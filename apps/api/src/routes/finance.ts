import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { requireFinanceRead, requireFinanceWrite, requireFinanceApprover } from '../middleware/finance'
import { gateRoutes } from '../middleware/tier'
import { logFinance } from '../lib/finance'
import { paystackRequest } from './paystack'

// ─────────────────────────────────────────────────────────────────────────────
// Bursar / finance routes: reversals, waivers, approvals, audit log, reports,
// Paystack reconciliation. Permission model lives in middleware/finance.ts.
//
// Optional filters use the `(${x}::type IS NULL OR col = ${x})` pattern so every
// query is a single flat SQL template (no nested templates — Railway TS build).
// ─────────────────────────────────────────────────────────────────────────────

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export async function financeRoutes(app: FastifyInstance) {
  // On every plan: student lookup, reversals and their approval, the approvals list.
  // Standard and up: discounts and waivers, debtors, reports, reconciliation, audit log.
  gateRoutes(app, (url: string) =>
    /\/finance\/(waivers|debtors|reports|reconciliation|audit-log)/.test(url) ? 'financeControls' : null)

  const READ = [authenticate, requireFinanceRead]
  const WRITE = [authenticate, requireRole('school_admin', 'bursar'), requireFinanceWrite]
  const APPROVE = [authenticate, requireRole('proprietor', 'school_admin'), requireFinanceApprover]

  // ── Minimal student list for billing (no emails, DOBs or staff) ───────────
  app.get('/finance/students', { preHandler: READ },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const students = await tdb.query`
        SELECT u.id, u.full_name, u.admission_no, u.class_level, u.class_arm, u.is_active,
               COALESCE(json_agg(json_build_object('name', p.full_name, 'phone', p.phone))
                        FILTER (WHERE p.id IS NOT NULL), '[]') AS parents
        FROM users u
        LEFT JOIN parent_student_links psl ON psl.student_id = u.id AND psl.school_id = u.school_id
        LEFT JOIN users p ON p.id = psl.parent_id
        WHERE u.school_id = ${request.schoolId}::uuid AND u.role = 'student'
        GROUP BY u.id
        ORDER BY class_level_rank(u.class_level), u.class_level, u.class_arm, u.full_name
      ` as any[]
      return reply.send({ students })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // REVERSALS — always need approval
  // ═══════════════════════════════════════════════════════════════════════════

  app.post('/finance/reversals', { preHandler: WRITE },
    async (request: any, reply: any) => {
      const body = z.object({
        paymentId: z.string().uuid(),
        reason: z.string().trim().min(10, 'Give a clear reason (at least 10 characters)'),
      }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const result: any = await tdb.transaction(async (tx: any) => {
        const p = await tx`
          SELECT id, receipt_number, amount_paid, status FROM fee_payments
          WHERE id = ${d.paymentId}::uuid AND school_id = ${request.schoolId}::uuid
          FOR UPDATE
        ` as any[]
        if (!p[0]) return { error: 'NOT_FOUND' }
        if (p[0].status !== 'success') return { error: 'NOT_SETTLED' }

        const open = await tx`
          SELECT id FROM fee_reversals
          WHERE payment_id = ${d.paymentId}::uuid AND status IN ('pending', 'approved')
        ` as any[]
        if (open[0]) return { error: 'ALREADY_REVERSED_OR_PENDING' }

        const rows = await tx`
          INSERT INTO fee_reversals (school_id, payment_id, reason, requested_by)
          VALUES (${request.schoolId}::uuid, ${d.paymentId}::uuid, ${d.reason}, ${request.user.id}::uuid)
          RETURNING id, status, created_at
        ` as any[]
        await logFinance(tx, request, request.schoolId, {
          action: 'reversal.requested', entityType: 'fee_reversal', entityId: rows[0].id,
          after: { paymentId: d.paymentId, receipt: p[0].receipt_number, amount: Number(p[0].amount_paid) },
          reason: d.reason,
        })
        return { reversal: rows[0] }
      })

      if (result.error === 'NOT_FOUND') return reply.status(404).send(result)
      if (result.error) return reply.status(409).send(result)
      return reply.status(201).send(result)
    })

  app.get('/finance/reversals', { preHandler: READ },
    async (request: any, reply: any) => {
      const status = (request.query as any)?.status ?? null
      const tdb = tenantDb(request.schoolId)
      const reversals = await tdb.query`
        SELECT r.id, r.status, r.reason, r.created_at, r.decided_at, r.decision_note, r.requested_by,
               fp.id AS payment_id, fp.receipt_number, fp.amount_paid, fp.payment_method, fp.payment_date,
               st.full_name AS student_name, st.admission_no, st.class_level, st.class_arm,
               rq.full_name AS requested_by_name, dc.full_name AS decided_by_name
        FROM fee_reversals r
        JOIN fee_payments fp ON fp.id = r.payment_id
        JOIN users st ON st.id = fp.student_id
        JOIN users rq ON rq.id = r.requested_by
        LEFT JOIN users dc ON dc.id = r.decided_by
        WHERE r.school_id = ${request.schoolId}::uuid
          AND (${status}::text IS NULL OR r.status = ${status}::text)
        ORDER BY r.created_at DESC
        LIMIT 500
      ` as any[]
      return reply.send({ reversals })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // WAIVERS — auto-approved only while the student's TERM TOTAL stays within
  // the proprietor's threshold (stops splitting one big waiver into small ones)
  // ═══════════════════════════════════════════════════════════════════════════

  app.post('/finance/waivers', { preHandler: WRITE },
    async (request: any, reply: any) => {
      const body = z.object({
        studentId: z.string().uuid(),
        termId: z.string().uuid(),
        feeStructureId: z.string().uuid().optional(),
        kind: z.enum(['discount', 'sibling', 'scholarship', 'staff_child', 'waiver']),
        amount: z.number().positive(),
        reason: z.string().trim().min(5),
      }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const result: any = await tdb.transaction(async (tx: any) => {
        // Row lock on the student serialises concurrent waiver requests for them
        const st = await tx`
          SELECT id, class_level FROM users
          WHERE id = ${d.studentId}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'student'
          FOR UPDATE
        ` as any[]
        if (!st[0]) return { error: 'NOT_FOUND' }

        if (d.feeStructureId) {
          const fs = await tx`
            SELECT fee_structure_id FROM student_fee_bill
            WHERE fee_structure_id = ${d.feeStructureId}::uuid AND student_id = ${d.studentId}::uuid
              AND school_id = ${request.schoolId}::uuid AND term_id = ${d.termId}::uuid
          ` as any[]
          if (!fs[0]) return { error: 'FEE_ITEM_NOT_IN_STUDENT_BILL' }
        }

        const bill = await tx`
          SELECT COALESCE(SUM(amount), 0) AS total FROM student_fee_bill
          WHERE school_id = ${request.schoolId}::uuid AND term_id = ${d.termId}::uuid
            AND student_id = ${d.studentId}::uuid
        ` as any[]
        const prior = await tx`
          SELECT COALESCE(SUM(amount), 0) AS total FROM fee_waivers
          WHERE school_id = ${request.schoolId}::uuid AND student_id = ${d.studentId}::uuid
            AND term_id = ${d.termId}::uuid AND status IN ('pending', 'approved')
        ` as any[]
        const cfg = await tx`
          SELECT finance_approval_threshold AS threshold FROM schools WHERE id = ${request.schoolId}::uuid
        ` as any[]

        const cumulative = Number(prior[0].total) + d.amount
        const threshold = Number(cfg[0]?.threshold ?? 0)
        if (cumulative > Number(bill[0].total)) return { error: 'EXCEEDS_BILL', bill: Number(bill[0].total), cumulative }

        const auto = cumulative <= threshold
        let status = 'pending'
        let decidedAt: Date | null = null
        let note: string | null = null
        if (auto) {
          status = 'approved'
          decidedAt = new Date()
          note = 'Auto-approved: student term total within threshold'
        }

        const rows = await tx`
          INSERT INTO fee_waivers
            (school_id, student_id, term_id, fee_structure_id, kind, amount, reason,
             status, requested_by, decided_at, decision_note)
          VALUES
            (${request.schoolId}::uuid, ${d.studentId}::uuid, ${d.termId}::uuid,
             ${d.feeStructureId ?? null}::uuid, ${d.kind}, ${d.amount}, ${d.reason},
             ${status}, ${request.user.id}::uuid, ${decidedAt}, ${note})
          RETURNING id, status
        ` as any[]

        let action = 'waiver.requested'
        if (auto) action = 'waiver.auto_approved'
        await logFinance(tx, request, request.schoolId, {
          action, entityType: 'fee_waiver', entityId: rows[0].id,
          after: { ...d, cumulative, threshold },
          reason: d.reason,
        })
        return { waiver: rows[0], needsApproval: !auto }
      })

      if (result.error === 'NOT_FOUND') return reply.status(404).send(result)
      if (result.error) return reply.status(409).send(result)
      return reply.status(201).send(result)
    })

  app.get('/finance/waivers', { preHandler: READ },
    async (request: any, reply: any) => {
      const q = request.query as any
      const termId = q?.termId ?? null
      const studentId = q?.studentId ?? null
      const status = q?.status ?? null
      const tdb = tenantDb(request.schoolId)
      const waivers = await tdb.query`
        SELECT w.id, w.kind, w.amount, w.reason, w.status, w.created_at, w.decided_at, w.decision_note,
               w.term_id, w.fee_structure_id, w.requested_by, fs.name AS fee_name,
               st.id AS student_id, st.full_name AS student_name, st.admission_no, st.class_level, st.class_arm,
               rq.full_name AS requested_by_name, dc.full_name AS decided_by_name
        FROM fee_waivers w
        JOIN users st ON st.id = w.student_id
        JOIN users rq ON rq.id = w.requested_by
        LEFT JOIN users dc ON dc.id = w.decided_by
        LEFT JOIN fee_structures fs ON fs.id = w.fee_structure_id
        WHERE w.school_id = ${request.schoolId}::uuid
          AND (${termId}::uuid IS NULL OR w.term_id = ${termId}::uuid)
          AND (${studentId}::uuid IS NULL OR w.student_id = ${studentId}::uuid)
          AND (${status}::text IS NULL OR w.status = ${status}::text)
        ORDER BY w.created_at DESC
        LIMIT 500
      ` as any[]
      return reply.send({ waivers })
    })

  // Requester withdraws their own pending waiver
  app.post('/finance/waivers/:id/cancel', { preHandler: WRITE },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      const result = await tdb.transaction(async (tx: any) => {
        const rows = await tx`
          SELECT id, status, requested_by FROM fee_waivers
          WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
          FOR UPDATE
        ` as any[]
        const w = rows[0]
        if (!w) return 'NOT_FOUND'
        if (w.status !== 'pending') return 'NOT_PENDING'
        if (w.requested_by !== request.user.id) return 'NOT_YOUR_REQUEST'
        await tx`UPDATE fee_waivers SET status = 'cancelled' WHERE id = ${id}::uuid`
        await logFinance(tx, request, request.schoolId, {
          action: 'waiver.cancelled', entityType: 'fee_waiver', entityId: id,
          before: { status: 'pending' }, after: { status: 'cancelled' },
        })
        return 'OK'
      })
      if (result === 'NOT_FOUND') return reply.status(404).send({ error: result })
      if (result !== 'OK') return reply.status(409).send({ error: result })
      return reply.send({ cancelled: true })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVALS
  // ═══════════════════════════════════════════════════════════════════════════

  const decideSchema = z.object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().trim().max(500).optional(),
  })

  app.post('/finance/reversals/:id/decide', { preHandler: APPROVE },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const body = decideSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const result = await tdb.transaction(async (tx: any) => {
        const rows = await tx`
          SELECT r.id, r.status, r.requested_by, r.payment_id, fp.receipt_number, fp.amount_paid
          FROM fee_reversals r
          JOIN fee_payments fp ON fp.id = r.payment_id
          WHERE r.id = ${id}::uuid AND r.school_id = ${request.schoolId}::uuid
          FOR UPDATE OF r
        ` as any[]
        const r = rows[0]
        if (!r) return 'NOT_FOUND'
        if (r.status !== 'pending') return 'ALREADY_DECIDED'
        if (r.requested_by === request.user.id) return 'OWN_REQUEST'

        let newStatus = 'rejected'
        if (d.decision === 'approve') newStatus = 'approved'
        await tx`
          UPDATE fee_reversals
          SET status = ${newStatus}, decided_by = ${request.user.id}::uuid,
              decided_at = now(), decision_note = ${d.note ?? null}
          WHERE id = ${id}::uuid
        `
        await logFinance(tx, request, request.schoolId, {
          action: 'reversal.' + newStatus, entityType: 'fee_reversal', entityId: id,
          before: { status: 'pending' },
          after: { status: newStatus, paymentId: r.payment_id, receipt: r.receipt_number, amount: Number(r.amount_paid) },
          reason: d.note ?? null,
        })
        return 'OK'
      })

      if (result === 'NOT_FOUND') return reply.status(404).send({ error: result })
      if (result !== 'OK') return reply.status(409).send({ error: result })
      return reply.send({ decided: true })
    })

  app.post('/finance/waivers/:id/decide', { preHandler: APPROVE },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const body = decideSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const result = await tdb.transaction(async (tx: any) => {
        const rows = await tx`
          SELECT id, status, requested_by, student_id, term_id, amount, kind
          FROM fee_waivers
          WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
          FOR UPDATE
        ` as any[]
        const w = rows[0]
        if (!w) return 'NOT_FOUND'
        if (w.status !== 'pending') return 'ALREADY_DECIDED'
        if (w.requested_by === request.user.id) return 'OWN_REQUEST'

        let newStatus = 'rejected'
        if (d.decision === 'approve') newStatus = 'approved'
        await tx`
          UPDATE fee_waivers
          SET status = ${newStatus}, decided_by = ${request.user.id}::uuid,
              decided_at = now(), decision_note = ${d.note ?? null}
          WHERE id = ${id}::uuid
        `
        await logFinance(tx, request, request.schoolId, {
          action: 'waiver.' + newStatus, entityType: 'fee_waiver', entityId: id,
          before: { status: 'pending' },
          after: { status: newStatus, studentId: w.student_id, termId: w.term_id, amount: Number(w.amount), kind: w.kind },
          reason: d.note ?? null,
        })
        return 'OK'
      })

      if (result === 'NOT_FOUND') return reply.status(404).send({ error: result })
      if (result !== 'OK') return reply.status(409).send({ error: result })
      return reply.send({ decided: true })
    })

  // Everything waiting for the approver, in one list
  app.get('/finance/approvals', { preHandler: APPROVE },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const reversals = await tdb.query`
        SELECT r.id, r.reason, r.created_at, r.requested_by,
               fp.receipt_number, fp.amount_paid, fp.payment_method, fp.payment_date,
               st.full_name AS student_name, st.admission_no, st.class_level, st.class_arm,
               rq.full_name AS requested_by_name, rq.role AS requested_by_role
        FROM fee_reversals r
        JOIN fee_payments fp ON fp.id = r.payment_id
        JOIN users st ON st.id = fp.student_id
        JOIN users rq ON rq.id = r.requested_by
        WHERE r.school_id = ${request.schoolId}::uuid AND r.status = 'pending'
        ORDER BY r.created_at ASC
      ` as any[]
      const waivers = await tdb.query`
        SELECT w.id, w.kind, w.amount, w.reason, w.created_at, w.requested_by, w.term_id,
               st.full_name AS student_name, st.admission_no, st.class_level, st.class_arm,
               rq.full_name AS requested_by_name, rq.role AS requested_by_role,
               (SELECT COALESCE(SUM(w2.amount), 0) FROM fee_waivers w2
                 WHERE w2.student_id = w.student_id AND w2.term_id = w.term_id
                   AND w2.status = 'approved') AS already_approved_this_term
        FROM fee_waivers w
        JOIN users st ON st.id = w.student_id
        JOIN users rq ON rq.id = w.requested_by
        WHERE w.school_id = ${request.schoolId}::uuid AND w.status = 'pending'
        ORDER BY w.created_at ASC
      ` as any[]
      return reply.send({
        reversals: reversals.map((r: any) => ({ ...r, isOwnRequest: r.requested_by === request.user.id })),
        waivers: waivers.map((w: any) => ({ ...w, isOwnRequest: w.requested_by === request.user.id })),
        pendingCount: reversals.length + waivers.length,
      })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOG — bursar sees own actions only; admin/proprietor see all
  // ═══════════════════════════════════════════════════════════════════════════

  app.get('/finance/audit-log', { preHandler: READ },
    async (request: any, reply: any) => {
      const q = z.object({
        from: DATE.optional(),
        to: DATE.optional(),
        actorId: z.string().uuid().optional(),
        action: z.string().max(60).optional(),
      }).safeParse(request.query ?? {})
      if (!q.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: q.error.flatten() })

      let actorId: string | null = q.data.actorId ?? null
      if (request.user.role === 'bursar') actorId = request.user.id
      const from = q.data.from ?? null
      const to = q.data.to ?? null
      const action = q.data.action ?? null

      const tdb = tenantDb(request.schoolId)
      const entries = await tdb.query`
        SELECT l.id, l.created_at, l.actor_id, l.actor_role, u.full_name AS actor_name,
               l.action, l.entity_type, l.entity_id, l.before_data, l.after_data,
               l.reason, l.via_grant, l.ip_address
        FROM fee_audit_log l
        LEFT JOIN users u ON u.id = l.actor_id
        WHERE l.school_id = ${request.schoolId}::uuid
          AND (${actorId}::uuid IS NULL OR l.actor_id = ${actorId}::uuid)
          AND (${from}::date IS NULL OR l.created_at >= ${from}::date)
          AND (${to}::date IS NULL OR l.created_at < ${to}::date + 1)
          AND (${action}::text IS NULL OR l.action LIKE ${action}::text || '%')
        ORDER BY l.created_at DESC
        LIMIT 1000
      ` as any[]
      return reply.send({ entries })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Students with an outstanding balance, across classes
  app.get('/finance/debtors', { preHandler: READ },
    async (request: any, reply: any) => {
      const q = z.object({
        termId: z.string().uuid(),
        classLevel: z.string().optional(),
        minBalance: z.coerce.number().min(0).optional(),
      }).safeParse(request.query ?? {})
      if (!q.success) return reply.status(400).send({ error: 'termId is required' })
      const termId = q.data.termId
      const classLevel = q.data.classLevel ?? null
      const minBalance = q.data.minBalance ?? 0

      const tdb = tenantDb(request.schoolId)
      const debtors = await tdb.query`
        WITH kids AS (
          SELECT id, full_name, admission_no, class_level, class_arm FROM users
          WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND is_active = true
            AND (${classLevel}::text IS NULL OR class_level = ${classLevel}::text)
        ),
        bills AS (
          SELECT student_id, SUM(amount) AS total FROM student_fee_bill
          WHERE school_id = ${request.schoolId}::uuid AND term_id = ${termId}::uuid
          GROUP BY student_id
        ),
        paid AS (
          SELECT fp.student_id, SUM(fp.amount_paid) AS paid
          FROM fee_payments_effective fp
          JOIN fee_structures fs ON fs.id = fp.fee_structure_id
          WHERE fp.school_id = ${request.schoolId}::uuid AND fs.term_id = ${termId}::uuid
          GROUP BY fp.student_id
        ),
        waived AS (
          SELECT student_id, SUM(amount) AS waived FROM fee_waivers
          WHERE school_id = ${request.schoolId}::uuid AND term_id = ${termId}::uuid AND status = 'approved'
          GROUP BY student_id
        ),
        parents AS (
          SELECT psl.student_id,
                 string_agg(DISTINCT p.full_name, ', ') AS parent_names,
                 string_agg(DISTINCT p.phone, ', ') AS parent_phones
          FROM parent_student_links psl
          JOIN users p ON p.id = psl.parent_id
          WHERE psl.school_id = ${request.schoolId}::uuid
          GROUP BY psl.student_id
        )
        SELECT k.id AS student_id, k.full_name AS student_name, k.admission_no, k.class_level, k.class_arm,
               COALESCE(b.total, 0) AS total_fees,
               COALESCE(pd.paid, 0) AS total_paid,
               COALESCE(w.waived, 0) AS total_waived,
               COALESCE(b.total, 0) - COALESCE(pd.paid, 0) - COALESCE(w.waived, 0) AS balance,
               pr.parent_names, pr.parent_phones
        FROM kids k
        LEFT JOIN bills b   ON b.student_id = k.id
        LEFT JOIN paid pd   ON pd.student_id = k.id
        LEFT JOIN waived w  ON w.student_id = k.id
        LEFT JOIN parents pr ON pr.student_id = k.id
        WHERE COALESCE(b.total, 0) - COALESCE(pd.paid, 0) - COALESCE(w.waived, 0) > ${minBalance}
        ORDER BY balance DESC, k.full_name
      ` as any[]

      const totalOutstanding = debtors.reduce((s: number, r: any) => s + Number(r.balance), 0)
      return reply.send({ debtors, count: debtors.length, totalOutstanding })
    })

  // Every settled payment in a date range — reversed ones flagged, not hidden
  app.get('/finance/reports/cash-book', { preHandler: READ },
    async (request: any, reply: any) => {
      const q = z.object({ from: DATE, to: DATE }).safeParse(request.query ?? {})
      if (!q.success) return reply.status(400).send({ error: 'from and to (YYYY-MM-DD) required' })
      const { from, to } = q.data

      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT fp.id, fp.payment_date, fp.receipt_number, u.full_name AS student_name, u.admission_no,
               u.class_level, u.class_arm, fs.name AS fee_name, fp.amount_paid, fp.payment_method,
               fp.transfer_reference, fp.paystack_reference, fp.payer_name,
               rb.full_name AS recorded_by_name,
               EXISTS (SELECT 1 FROM fee_reversals r
                       WHERE r.payment_id = fp.id AND r.status = 'approved') AS is_reversed
        FROM fee_payments fp
        JOIN users u           ON u.id = fp.student_id
        JOIN fee_structures fs ON fs.id = fp.fee_structure_id
        LEFT JOIN users rb     ON rb.id = fp.recorded_by
        WHERE fp.school_id = ${request.schoolId}::uuid AND fp.status = 'success'
          AND fp.payment_date BETWEEN ${from}::date AND ${to}::date
        ORDER BY fp.payment_date, fp.receipt_number
      ` as any[]

      let gross = 0
      let reversed = 0
      const byMethod: Record<string, number> = {}
      for (const r of rows) {
        const amt = Number(r.amount_paid)
        gross += amt
        if (r.is_reversed) {
          reversed += amt
        } else {
          byMethod[r.payment_method] = (byMethod[r.payment_method] ?? 0) + amt
        }
      }
      return reply.send({ rows, totals: { gross, reversed, net: gross - reversed, byMethod } })
    })

  // Expected vs collected per fee item
  app.get('/finance/reports/by-item', { preHandler: READ },
    async (request: any, reply: any) => {
      const q = z.object({ termId: z.string().uuid() }).safeParse(request.query ?? {})
      if (!q.success) return reply.status(400).send({ error: 'termId is required' })
      const { termId } = q.data

      const tdb = tenantDb(request.schoolId)
      const items = await tdb.query`
        WITH counts AS (
          SELECT fee_structure_id, COUNT(*) AS n FROM student_fee_bill
          WHERE school_id = ${request.schoolId}::uuid AND term_id = ${termId}::uuid AND is_active = true
          GROUP BY fee_structure_id
        ),
        paid AS (
          SELECT fee_structure_id, SUM(amount_paid) AS collected, COUNT(DISTINCT student_id) AS payers
          FROM fee_payments_effective
          WHERE school_id = ${request.schoolId}::uuid
          GROUP BY fee_structure_id
        )
        SELECT fs.id, fs.name, fs.class_level, fs.amount, fs.is_mandatory,
               COALESCE(c.n, 0) AS student_count,
               fs.amount * COALESCE(c.n, 0) AS expected,
               COALESCE(p.collected, 0) AS collected,
               COALESCE(p.payers, 0) AS payers
        FROM fee_structures fs
        LEFT JOIN counts c ON c.fee_structure_id = fs.id
        LEFT JOIN paid p   ON p.fee_structure_id = fs.id
        WHERE fs.school_id = ${request.schoolId}::uuid AND fs.term_id = ${termId}::uuid
        ORDER BY class_level_rank(fs.class_level), fs.class_level, fs.is_mandatory DESC, fs.name
      ` as any[]
      return reply.send({ items })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYSTACK RECONCILIATION
  // ═══════════════════════════════════════════════════════════════════════════

  app.get('/finance/reconciliation', { preHandler: READ },
    async (request: any, reply: any) => {
      const q = z.object({ from: DATE, to: DATE }).safeParse(request.query ?? {})
      if (!q.success) return reply.status(400).send({ error: 'from and to (YYYY-MM-DD) required' })
      const { from, to } = q.data
      const tdb = tenantDb(request.schoolId)

      // 1. Paystack's view: successful fee charges for this school
      const paystackTx: any[] = []
      let paystackError: string | null = null
      for (let page = 1; page <= 20; page++) {
        let res: any = null
        try {
          res = await paystackRequest('GET',
            `/transaction?status=success&from=${from}&to=${to}T23:59:59&perPage=100&page=${page}`)
        } catch (err: any) {
          paystackError = 'Could not reach Paystack: ' + (err?.message ?? 'network error')
          break
        }
        if (!res?.status) {
          paystackError = res?.message ?? 'Paystack request failed'
          break
        }
        const list = res.data ?? []
        for (const t of list) {
          if (t.metadata?.type === 'fee_payment' && t.metadata?.school_id === request.schoolId) paystackTx.push(t)
        }
        if (list.length < 100) break
      }

      // 2. Our view of those references
      const refs = paystackTx.map((t: any) => t.reference)
      let local: any[] = []
      if (refs.length > 0) {
        local = await tdb.query`
          SELECT paystack_reference, status, amount_paid, receipt_number
          FROM fee_payments
          WHERE school_id = ${request.schoolId}::uuid AND paystack_reference = ANY(${refs}::text[])
        ` as any[]
      }
      const byRef: Record<string, any> = {}
      for (const l of local) byRef[l.paystack_reference] = l

      const missedWebhooks = paystackTx
        .filter((t: any) => !byRef[t.reference] || byRef[t.reference].status !== 'success')
        .map((t: any) => ({
          reference: t.reference, amount: t.amount / 100, paidAt: t.paid_at,
          student: t.metadata?.student_name ?? null, fee: t.metadata?.fee_name ?? null,
          localStatus: byRef[t.reference]?.status ?? 'missing',
        }))

      const amountMismatch = paystackTx
        .filter((t: any) => byRef[t.reference]?.status === 'success'
          && Math.round(Number(byRef[t.reference].amount_paid) * 100) !== t.amount)
        .map((t: any) => ({
          reference: t.reference, paystack: t.amount / 100,
          examify: Number(byRef[t.reference].amount_paid), receipt: byRef[t.reference].receipt_number,
        }))

      // 3. Abandoned checkouts (pending > 1 hour) — informational, never counted as paid
      const stalePending = await tdb.query`
        SELECT fp.paystack_reference, fp.amount_paid, fp.created_at, u.full_name AS student_name
        FROM fee_payments fp
        JOIN users u ON u.id = fp.student_id
        WHERE fp.school_id = ${request.schoolId}::uuid AND fp.status = 'pending'
          AND fp.created_at < now() - interval '1 hour'
          AND fp.created_at::date BETWEEN ${from}::date AND ${to}::date
        ORDER BY fp.created_at DESC
      ` as any[]

      return reply.send({
        paystackCount: paystackTx.length,
        paystackError,
        missedWebhooks,
        amountMismatch,
        stalePending,
      })
    })
}
