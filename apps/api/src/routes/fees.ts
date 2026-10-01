import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { SECTION_LEVELS, levelsFor, asSections } from '../lib/classLevels'
import { authenticate, requireRole } from '../middleware/auth'
import { requireFeature } from '../middleware/tier'
import { getFinanceAccess, requireFinanceRead, requireFinanceWrite } from '../middleware/finance'
import { nextReceiptNo, logFinance } from '../lib/finance'
import { sendSms, feeReminderSms } from '../lib/sms'

export async function feeRoutes(app: FastifyInstance) {

  // Guard sets — see middleware/finance.ts for the permission model
  const READ = [authenticate, requireFinanceRead]
  const WRITE = [authenticate, requireRole('school_admin', 'bursar'), requireFinanceWrite]

  // ── Who am I, finance-wise? (drives read-only banners in the UI) ──────────
  app.get('/finance/access', { preHandler: READ },
    async (request: any, reply: any) => {
      return reply.send(await getFinanceAccess(request))
    })

  // ── List fee structures ───────────────────────────────────────────────────
  app.get('/fees/structures', { preHandler: [authenticate, requireRole('school_admin', 'teacher', 'bursar', 'proprietor')] },
    async (request: any, reply: any) => {
      const { termId, classLevel } = request.query as any
      const tdb = tenantDb(request.schoolId)

      let structures: any[]
      if (termId && classLevel) {
        structures = await tdb.query`
          SELECT id, name, amount, class_level, is_mandatory, term_id, created_at,
                 (SELECT COUNT(*) FROM fee_optional_enrollments e WHERE e.fee_structure_id = fee_structures.id) AS enrolled_count
          FROM fee_structures
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          AND class_level = ${classLevel}
          ORDER BY is_mandatory DESC, name ASC
        ` as any[]
      } else if (termId) {
        structures = await tdb.query`
          SELECT id, name, amount, class_level, is_mandatory, term_id, created_at,
                 (SELECT COUNT(*) FROM fee_optional_enrollments e WHERE e.fee_structure_id = fee_structures.id) AS enrolled_count
          FROM fee_structures
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          ORDER BY class_level_rank(class_level), class_level, is_mandatory DESC, name ASC
        ` as any[]
      } else {
        structures = await tdb.query`
          SELECT id, name, amount, class_level, is_mandatory, term_id, created_at,
                 (SELECT COUNT(*) FROM fee_optional_enrollments e WHERE e.fee_structure_id = fee_structures.id) AS enrolled_count
          FROM fee_structures
          WHERE school_id = ${request.schoolId}::uuid
          ORDER BY class_level_rank(class_level), class_level, is_mandatory DESC, name ASC
        ` as any[]
      }
      return reply.send({ structures })
    })

  // ── Create fee structure ──────────────────────────────────────────────────
  app.post('/fees/structures', { preHandler: WRITE },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        classLevel: z.string().min(1).optional(),
        applyToAllClasses: z.boolean().optional().default(false),
        applyToSection: z.enum(['nursery', 'primary', 'secondary']).optional(),
        name: z.string().min(1),
        amount: z.number().positive(),
        isMandatory: z.boolean().default(true),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      if (!d.applyToAllClasses && !d.applyToSection && !d.classLevel) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Choose a class, a section, or all classes.' })
      }

      // "All classes" and "whole section" mean the classes this school runs
      const [sch] = await db()`SELECT sections FROM schools WHERE id = ${request.schoolId}::uuid` as any[]
      const schoolSections = asSections(sch?.sections)
      const schoolLevels = levelsFor(schoolSections)
      let levels: string[] = [d.classLevel as string]
      if (d.applyToAllClasses) levels = schoolLevels
      else if (d.applyToSection) {
        if (!schoolSections.includes(d.applyToSection)) {
          return reply.status(400).send({ error: 'SECTION_NOT_OFFERED', message: 'This school doesn’t run that section.' })
        }
        levels = [...SECTION_LEVELS[d.applyToSection]]
      }

      const tdb = tenantDb(request.schoolId)
      const created = await tdb.transaction(async (tx: any) => {
        const out: any[] = []
        for (const level of levels) {
          const rows = await tx`
            INSERT INTO fee_structures (school_id, term_id, class_level, name, amount, is_mandatory)
            VALUES (${request.schoolId}::uuid, ${d.termId}::uuid, ${level}, ${d.name}, ${d.amount}, ${d.isMandatory})
            RETURNING id, name, amount, class_level, is_mandatory
          ` as any[]
          out.push(rows[0])
          await logFinance(tx, request, request.schoolId, {
            action: 'structure.created', entityType: 'fee_structure', entityId: rows[0].id,
            after: { termId: d.termId, classLevel: level, name: d.name, amount: d.amount, isMandatory: d.isMandatory },
          })
        }
        return out
      })

      if (d.applyToAllClasses) return reply.status(201).send({ structures: created })
      return reply.status(201).send({ structure: created[0] })
    })

  // ── Delete fee structure (only if nothing has been paid against it) ───────
  app.delete('/fees/structures/:id', { preHandler: WRITE },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)

      const result = await tdb.transaction(async (tx: any) => {
        const rows = await tx`
          SELECT id, name, amount, class_level, term_id FROM fee_structures
          WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
        ` as any[]
        if (!rows[0]) return 'NOT_FOUND'

        const paid = await tx`SELECT 1 FROM fee_payments WHERE fee_structure_id = ${id}::uuid LIMIT 1` as any[]
        if (paid[0]) return 'HAS_PAYMENTS'

        await tx`DELETE FROM fee_structures WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
        await logFinance(tx, request, request.schoolId, {
          action: 'structure.deleted', entityType: 'fee_structure', entityId: id, before: rows[0],
        })
        return 'OK'
      })

      if (result === 'NOT_FOUND') return reply.status(404).send({ error: 'NOT_FOUND' })
      if (result === 'HAS_PAYMENTS') {
        return reply.status(409).send({ error: 'HAS_PAYMENTS', message: 'Payments exist against this fee item. It cannot be deleted.' })
      }
      return reply.send({ deleted: true })
    })

  // ── Who takes an optional fee item ────────────────────────────────────────
  app.get('/fees/structures/:id/enrollments', { preHandler: READ },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      const fs = await tdb.query`
        SELECT id, name, amount, class_level, is_mandatory, term_id FROM fee_structures
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!fs[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      const students = await tdb.query`
        SELECT u.id, u.full_name, u.admission_no, u.class_arm,
               EXISTS (SELECT 1 FROM fee_optional_enrollments e
                       WHERE e.fee_structure_id = ${id}::uuid AND e.student_id = u.id) AS enrolled,
               COALESCE((SELECT SUM(fp.amount_paid) FROM fee_payments_effective fp
                         WHERE fp.fee_structure_id = ${id}::uuid AND fp.student_id = u.id), 0) AS paid
        FROM users u
        WHERE u.school_id = ${request.schoolId}::uuid AND u.role = 'student' AND u.is_active = true
          AND u.class_level = ${fs[0].class_level}
        ORDER BY u.class_arm, u.full_name
      ` as any[]
      return reply.send({ structure: fs[0], students })
    })

  // Set the full list of students taking an optional item.
  // Students with payments against the item can't be removed; they are reported back.
  app.put('/fees/structures/:id/enrollments', { preHandler: WRITE },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const body = z.object({ studentIds: z.array(z.string().uuid()).max(2000) }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const wanted = new Set(body.data.studentIds)
      const tdb = tenantDb(request.schoolId)

      const result: any = await tdb.transaction(async (tx: any) => {
        const fs = await tx`
          SELECT id, name, class_level, is_mandatory FROM fee_structures
          WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
          FOR UPDATE
        ` as any[]
        if (!fs[0]) return { error: 'NOT_FOUND' }
        if (fs[0].is_mandatory) return { error: 'MANDATORY_ITEM' }

        const cls = await tx`
          SELECT id FROM users
          WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND class_level = ${fs[0].class_level}
        ` as any[]
        const inClass = new Set(cls.map((u: any) => u.id))
        const outsiders = [...wanted].filter(sid => !inClass.has(sid))
        if (outsiders.length) return { error: 'WRONG_CLASS' }

        const current = await tx`
          SELECT e.student_id,
                 EXISTS (SELECT 1 FROM fee_payments_effective fp
                         WHERE fp.fee_structure_id = e.fee_structure_id AND fp.student_id = e.student_id) AS has_payments
          FROM fee_optional_enrollments e WHERE e.fee_structure_id = ${id}::uuid
        ` as any[]
        const now = new Set(current.map((c: any) => c.student_id))
        const toAdd = [...wanted].filter(sid => !now.has(sid))
        const toRemove = current.filter((c: any) => !wanted.has(c.student_id) && !c.has_payments).map((c: any) => c.student_id)
        const kept = current.filter((c: any) => !wanted.has(c.student_id) && c.has_payments).map((c: any) => c.student_id)

        for (const sid of toAdd) {
          await tx`
            INSERT INTO fee_optional_enrollments (school_id, fee_structure_id, student_id, created_by)
            VALUES (${request.schoolId}::uuid, ${id}::uuid, ${sid}::uuid, ${request.user.id}::uuid)
          `
        }
        if (toRemove.length) {
          await tx`
            DELETE FROM fee_optional_enrollments
            WHERE fee_structure_id = ${id}::uuid AND student_id = ANY(${toRemove}::uuid[])
          `
        }
        if (toAdd.length || toRemove.length) {
          await logFinance(tx, request, request.schoolId, {
            action: 'optional.enrolment_changed', entityType: 'fee_structure', entityId: id,
            after: { name: fs[0].name, added: toAdd.length, removed: toRemove.length, addedIds: toAdd, removedIds: toRemove },
          })
        }
        return { added: toAdd.length, removed: toRemove.length, keptWithPayments: kept }
      })

      if (result.error === 'NOT_FOUND') return reply.status(404).send(result)
      if (result.error === 'MANDATORY_ITEM') return reply.status(400).send({ ...result, message: 'Every student in the class pays mandatory items.' })
      if (result.error) return reply.status(400).send({ ...result, message: "Some of those students aren't in this class." })
      return reply.send(result)
    })

  // ── Fee ledger for a class (who owes what, who paid) ──────────────────────
  app.get('/fees/ledger', { preHandler: READ },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel are required' })

      const tdb = tenantDb(request.schoolId)

      const structures = await tdb.query`
        SELECT id, name, amount, is_mandatory
        FROM fee_structures
        WHERE school_id = ${request.schoolId}::uuid
        AND term_id = ${termId}::uuid
        AND class_level = ${classLevel}
        ORDER BY is_mandatory DESC, name ASC
      ` as any[]

      let students: any[]
      if (classArm) {
        students = await tdb.query`
          SELECT id, full_name, admission_no, class_arm
          FROM users
          WHERE school_id = ${request.schoolId}::uuid
          AND role = 'student' AND is_active = true
          AND class_level = ${classLevel} AND class_arm = ${classArm}
          ORDER BY full_name ASC
        ` as any[]
      } else {
        students = await tdb.query`
          SELECT id, full_name, admission_no, class_arm
          FROM users
          WHERE school_id = ${request.schoolId}::uuid
          AND role = 'student' AND is_active = true
          AND class_level = ${classLevel}
          ORDER BY full_name ASC
        ` as any[]
      }

      // Only settled, non-reversed payments count
      const payments = await tdb.query`
        SELECT fp.student_id, fp.fee_structure_id, SUM(fp.amount_paid) AS total_paid
        FROM fee_payments_effective fp
        JOIN fee_structures fs ON fs.id = fp.fee_structure_id
        WHERE fp.school_id = ${request.schoolId}::uuid
        AND fs.term_id = ${termId}::uuid
        AND fs.class_level = ${classLevel}
        GROUP BY fp.student_id, fp.fee_structure_id
      ` as any[]

      const waivers = await tdb.query`
        SELECT student_id, SUM(amount) AS total_waived
        FROM fee_waivers
        WHERE school_id = ${request.schoolId}::uuid AND term_id = ${termId}::uuid AND status = 'approved'
        GROUP BY student_id
      ` as any[]

      // Optional items only count for students enrolled in them
      const enrolments = await tdb.query`
        SELECT e.student_id, e.fee_structure_id
        FROM fee_optional_enrollments e
        JOIN fee_structures fs ON fs.id = e.fee_structure_id
        WHERE e.school_id = ${request.schoolId}::uuid AND fs.term_id = ${termId}::uuid AND fs.class_level = ${classLevel}
      ` as any[]
      const enrolled = new Set(enrolments.map((e: any) => `${e.student_id}:${e.fee_structure_id}`))

      const paymentMap: Record<string, Record<string, number>> = {}
      for (const p of payments) {
        if (!paymentMap[p.student_id]) paymentMap[p.student_id] = {}
        paymentMap[p.student_id][p.fee_structure_id] = Number(p.total_paid)
      }
      const waivedMap: Record<string, number> = {}
      for (const w of waivers) waivedMap[w.student_id] = Number(w.total_waived)

      const mandatoryTotal = structures.filter((f: any) => f.is_mandatory).reduce((a: number, f: any) => a + Number(f.amount), 0)
      const totalFees = mandatoryTotal
      const onBill = (studentId: string, f: any) => f.is_mandatory || enrolled.has(`${studentId}:${f.id}`)
      const ledger = students.map((s: any) => {
        const studentPayments = paymentMap[s.id] ?? {}
        const totalFees = structures.filter((f: any) => onBill(s.id, f)).reduce((a: number, f: any) => a + Number(f.amount), 0)
        const totalPaid = Object.values(studentPayments).reduce((a: number, b: any) => a + Number(b), 0)
        const totalWaived = waivedMap[s.id] ?? 0
        const balance = totalFees - totalPaid - totalWaived
        return {
          studentId: s.id,
          studentName: s.full_name,
          admissionNo: s.admission_no,
          classArm: s.class_arm,
          totalFees,
          totalPaid,
          totalWaived,
          balance,
          isPaid: balance <= 0,
          feeDetails: structures.map((f: any) => {
            const billed = onBill(s.id, f)
            return {
              feeId: f.id,
              feeName: f.name,
              optional: !f.is_mandatory,
              enrolled: billed,
              amount: billed ? Number(f.amount) : 0,
              paid: studentPayments[f.id] ?? 0,
              balance: billed ? Number(f.amount) - (studentPayments[f.id] ?? 0) : 0,
            }
          }),
        }
      })

      return reply.send({ ledger, structures, totalFees })
    })

  // ── Record a manual payment ───────────────────────────────────────────────
  app.post('/fees/payments', { preHandler: WRITE },
    async (request: any, reply: any) => {
      const schema = z.object({
        feeStructureId: z.string().uuid(),
        studentId: z.string().uuid(),
        amountPaid: z.number().positive(),
        paymentMethod: z.enum(['cash', 'bank_transfer', 'pos', 'card', 'cheque']),
        paymentDate: z.string().optional(),
        notes: z.string().optional(),
        payerName: z.string().optional(),
        payerBank: z.string().optional(),
        accountNumber: z.string().optional(),
        transferReference: z.string().trim().optional(),
        enrol: z.boolean().optional(),   // also enrol the student in an optional item they aren't taking yet
      }).refine(d => d.paymentMethod === 'cash' || !!d.transferReference, {
        message: 'A teller / transfer / POS reference is required for non-cash payments',
        path: ['transferReference'],
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const result: any = await tdb.transaction(async (tx: any) => {
        // Both IDs must belong to THIS school
        const fs = await tx`
          SELECT id, name, is_mandatory, class_level FROM fee_structures
          WHERE id = ${d.feeStructureId}::uuid AND school_id = ${request.schoolId}::uuid
        ` as any[]
        const st = await tx`
          SELECT id, class_level FROM users
          WHERE id = ${d.studentId}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'student'
        ` as any[]
        if (!fs[0] || !st[0]) return { error: 'NOT_FOUND' }

        // Optional items: the student must be taking it (or the Bursar confirms enrolling them now)
        if (!fs[0].is_mandatory) {
          const en = await tx`
            SELECT 1 FROM fee_optional_enrollments
            WHERE fee_structure_id = ${d.feeStructureId}::uuid AND student_id = ${d.studentId}::uuid
          ` as any[]
          if (!en[0]) {
            if (!d.enrol) return { error: 'NOT_ENROLLED', item: fs[0].name }
            await tx`
              INSERT INTO fee_optional_enrollments (school_id, fee_structure_id, student_id, created_by)
              VALUES (${request.schoolId}::uuid, ${d.feeStructureId}::uuid, ${d.studentId}::uuid, ${request.user.id}::uuid)
            `
            await logFinance(tx, request, request.schoolId, {
              action: 'optional.enrolled', entityType: 'fee_structure', entityId: d.feeStructureId,
              after: { studentId: d.studentId, name: fs[0].name, via: 'payment' },
            })
          }
        }

        // The same teller / transfer reference can't be used twice (unless the first was reversed)
        if (d.transferReference) {
          const dup = await tx`
            SELECT receipt_number FROM fee_payments_effective
            WHERE school_id = ${request.schoolId}::uuid
              AND lower(transfer_reference) = lower(${d.transferReference})
          ` as any[]
          if (dup[0]) return { error: 'DUPLICATE_REFERENCE', receipt: dup[0].receipt_number }
        }

        const receiptNo = await nextReceiptNo(tx, request.schoolId)
        const rows = await tx`
          INSERT INTO fee_payments (
            school_id, fee_structure_id, student_id, amount_paid, payment_method,
            receipt_number, payment_date, recorded_by, notes,
            payer_name, payer_bank, account_number, transfer_reference, status
          ) VALUES (
            ${request.schoolId}::uuid, ${d.feeStructureId}::uuid, ${d.studentId}::uuid,
            ${d.amountPaid}, ${d.paymentMethod}, ${receiptNo},
            ${d.paymentDate ?? new Date().toISOString().split('T')[0]}::date,
            ${request.user.id}::uuid, ${d.notes ?? null},
            ${d.payerName ?? null}, ${d.payerBank ?? null},
            ${d.accountNumber ?? null}, ${d.transferReference ?? null}, 'success'
          )
          RETURNING id, receipt_number, amount_paid, payment_method, payment_date
        ` as any[]

        await logFinance(tx, request, request.schoolId, {
          action: 'payment.recorded',
          entityType: 'fee_payment',
          entityId: rows[0].id,
          after: { ...d, receiptNo },
        })
        return { payment: rows[0], receiptNo }
      })

      if (result.error === 'DUPLICATE_REFERENCE') {
        return reply.status(409).send({ error: 'DUPLICATE_REFERENCE', message: `This reference is already on receipt ${result.receipt}.` })
      }
      if (result.error === 'NOT_ENROLLED') {
        return reply.status(409).send({ error: 'NOT_ENROLLED', message: `This student isn't taking the optional item “${result.item}”. Enrol them first, or confirm to enrol and record together.` })
      }

      if (result.error) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.status(201).send(result)
    })

  // ── Payment history for a student ─────────────────────────────────────────
  app.get('/fees/payments', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { studentId, termId } = request.query as any
      if (!studentId) return reply.status(400).send({ error: 'studentId is required' })

      const role = request.user.role
      const tdb = tenantDb(request.schoolId)

      if (role === 'student') {
        if (studentId !== request.user.id) return reply.status(403).send({ error: 'FORBIDDEN' })
      } else if (role === 'parent') {
        const link = await tdb.query`
          SELECT 1 FROM parent_student_links
          WHERE parent_id = ${request.user.id}::uuid
          AND student_id = ${studentId}::uuid
          AND school_id = ${request.schoolId}::uuid
        ` as any[]
        if (!link[0]) return reply.status(403).send({ error: 'NOT_LINKED' })
      } else if (!['school_admin', 'bursar', 'proprietor'].includes(role)) {
        return reply.status(403).send({ error: 'FORBIDDEN' })
      }

      let payments: any[]
      if (termId) {
        payments = await tdb.query`
          SELECT fp.id, fp.amount_paid, fp.payment_method, fp.receipt_number,
                 fp.payment_date, fp.notes, fp.status, fs.name AS fee_name, fs.amount AS fee_amount,
                 EXISTS (SELECT 1 FROM fee_reversals r
                         WHERE r.payment_id = fp.id AND r.status = 'approved') AS is_reversed
          FROM fee_payments fp
          JOIN fee_structures fs ON fs.id = fp.fee_structure_id
          WHERE fp.student_id = ${studentId}::uuid
          AND fp.school_id = ${request.schoolId}::uuid
          AND fs.term_id = ${termId}::uuid
          AND fp.status = 'success'
          ORDER BY fp.payment_date DESC, fp.created_at DESC
        ` as any[]
      } else {
        payments = await tdb.query`
          SELECT fp.id, fp.amount_paid, fp.payment_method, fp.receipt_number,
                 fp.payment_date, fp.notes, fp.status, fs.name AS fee_name, fs.amount AS fee_amount,
                 EXISTS (SELECT 1 FROM fee_reversals r
                         WHERE r.payment_id = fp.id AND r.status = 'approved') AS is_reversed
          FROM fee_payments fp
          JOIN fee_structures fs ON fs.id = fp.fee_structure_id
          WHERE fp.student_id = ${studentId}::uuid
          AND fp.school_id = ${request.schoolId}::uuid
          AND fp.status = 'success'
          ORDER BY fp.payment_date DESC, fp.created_at DESC
        ` as any[]
      }
      return reply.send({ payments })
    })

  // ── Fee collection summary by class ───────────────────────────────────────
  app.get('/fees/summary', { preHandler: READ },
    async (request: any, reply: any) => {
      const { termId } = request.query as any
      if (!termId) return reply.status(400).send({ error: 'termId is required' })

      const tdb = tenantDb(request.schoolId)

      // Each side aggregated separately — no row multiplication
      const summary = await tdb.query`
        WITH fees AS (
          SELECT class_level, SUM(amount) FILTER (WHERE is_mandatory) AS fee_per_student
          FROM fee_structures
          WHERE school_id = ${request.schoolId}::uuid AND term_id = ${termId}::uuid
          GROUP BY class_level
        ),
        expected AS (
          SELECT class_level, SUM(amount) AS total_expected
          FROM student_fee_bill
          WHERE school_id = ${request.schoolId}::uuid AND term_id = ${termId}::uuid AND is_active = true
          GROUP BY class_level
        ),
        counts AS (
          SELECT class_level, COUNT(*) AS student_count
          FROM users
          WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND is_active = true
          GROUP BY class_level
        ),
        paid AS (
          SELECT u.class_level, SUM(fp.amount_paid) AS collected
          FROM fee_payments_effective fp
          JOIN fee_structures fs ON fs.id = fp.fee_structure_id
          JOIN users u ON u.id = fp.student_id
          WHERE fp.school_id = ${request.schoolId}::uuid AND fs.term_id = ${termId}::uuid
          GROUP BY u.class_level
        ),
        waived AS (
          SELECT u.class_level, SUM(w.amount) AS waived
          FROM fee_waivers w
          JOIN users u ON u.id = w.student_id
          WHERE w.school_id = ${request.schoolId}::uuid AND w.term_id = ${termId}::uuid
            AND w.status = 'approved'
          GROUP BY u.class_level
        )
        SELECT f.class_level,
               COALESCE(f.fee_per_student, 0) AS fee_per_student,
               COALESCE(c.student_count, 0) AS student_count,
               COALESCE(x.total_expected, 0) AS total_expected,
               COALESCE(p.collected, 0) AS total_collected,
               COALESCE(w.waived, 0) AS total_waived,
               COALESCE(x.total_expected, 0) - COALESCE(p.collected, 0) - COALESCE(w.waived, 0) AS total_outstanding
        FROM fees f
        LEFT JOIN expected x USING (class_level)
        LEFT JOIN counts c USING (class_level)
        LEFT JOIN paid   p USING (class_level)
        LEFT JOIN waived w USING (class_level)
        ORDER BY class_level_rank(f.class_level), f.class_level
      ` as any[]

      return reply.send({ summary })
    })

  // ── Fee reminder SMS to parents of students with an outstanding balance ───
  app.post('/fees/remind-sms', { preHandler: [...WRITE, requireFeature('financeControls')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        classLevel: z.string(),
        classArm: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const termRows = await tdb.query`
        SELECT name FROM terms WHERE id = ${d.termId}::uuid
      ` as any[]
      const termName = termRows[0]?.name ?? 'this term'

      let students: any[]
      if (d.classArm) {
        students = await tdb.query`
          WITH bill AS (
            SELECT student_id, SUM(amount) AS total FROM student_fee_bill
            WHERE school_id = ${request.schoolId}::uuid AND term_id = ${d.termId}::uuid
              AND class_level = ${d.classLevel}
            GROUP BY student_id
          ),
          kids AS (
            SELECT id, full_name FROM users
            WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND is_active = true
              AND class_level = ${d.classLevel} AND class_arm = ${d.classArm}
          ),
          paid AS (
            SELECT fp.student_id, SUM(fp.amount_paid) AS paid
            FROM fee_payments_effective fp
            JOIN fee_structures fs ON fs.id = fp.fee_structure_id
            WHERE fp.school_id = ${request.schoolId}::uuid AND fs.term_id = ${d.termId}::uuid
            GROUP BY fp.student_id
          ),
          waived AS (
            SELECT student_id, SUM(amount) AS waived FROM fee_waivers
            WHERE school_id = ${request.schoolId}::uuid AND term_id = ${d.termId}::uuid
              AND status = 'approved'
            GROUP BY student_id
          )
          SELECT k.full_name AS student_name, p.phone AS parent_phone,
                 b.total - COALESCE(pd.paid, 0) - COALESCE(w.waived, 0) AS balance
          FROM kids k
          JOIN bill b ON b.student_id = k.id
          LEFT JOIN paid pd  ON pd.student_id = k.id
          LEFT JOIN waived w ON w.student_id = k.id
          LEFT JOIN parent_student_links psl ON psl.student_id = k.id
            AND psl.school_id = ${request.schoolId}::uuid
          LEFT JOIN users p ON p.id = psl.parent_id
          WHERE b.total - COALESCE(pd.paid, 0) - COALESCE(w.waived, 0) > 0
        ` as any[]
      } else {
        students = await tdb.query`
          WITH bill AS (
            SELECT student_id, SUM(amount) AS total FROM student_fee_bill
            WHERE school_id = ${request.schoolId}::uuid AND term_id = ${d.termId}::uuid
              AND class_level = ${d.classLevel}
            GROUP BY student_id
          ),
          kids AS (
            SELECT id, full_name FROM users
            WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND is_active = true
              AND class_level = ${d.classLevel}
          ),
          paid AS (
            SELECT fp.student_id, SUM(fp.amount_paid) AS paid
            FROM fee_payments_effective fp
            JOIN fee_structures fs ON fs.id = fp.fee_structure_id
            WHERE fp.school_id = ${request.schoolId}::uuid AND fs.term_id = ${d.termId}::uuid
            GROUP BY fp.student_id
          ),
          waived AS (
            SELECT student_id, SUM(amount) AS waived FROM fee_waivers
            WHERE school_id = ${request.schoolId}::uuid AND term_id = ${d.termId}::uuid
              AND status = 'approved'
            GROUP BY student_id
          )
          SELECT k.full_name AS student_name, p.phone AS parent_phone,
                 b.total - COALESCE(pd.paid, 0) - COALESCE(w.waived, 0) AS balance
          FROM kids k
          JOIN bill b ON b.student_id = k.id
          LEFT JOIN paid pd  ON pd.student_id = k.id
          LEFT JOIN waived w ON w.student_id = k.id
          LEFT JOIN parent_student_links psl ON psl.student_id = k.id
            AND psl.school_id = ${request.schoolId}::uuid
          LEFT JOIN users p ON p.id = psl.parent_id
          WHERE b.total - COALESCE(pd.paid, 0) - COALESCE(w.waived, 0) > 0
        ` as any[]
      }

      let sent = 0
      let skipped = 0
      for (const s of students) {
        if (s.parent_phone) {
          const message = feeReminderSms({
            schoolName: request.school.name,
            studentName: s.student_name,
            balance: Number(s.balance),
            termName,
          })
          const result = await sendSms({ to: s.parent_phone, message })
          if (result.success) sent++
        } else {
          skipped++
        }
      }

      const tdb2 = tenantDb(request.schoolId)
      await tdb2.transaction(async (tx: any) => {
        await logFinance(tx, request, request.schoolId, {
          action: 'reminders.sms_sent', entityType: 'settings', entityId: null,
          after: { termId: d.termId, classLevel: d.classLevel, classArm: d.classArm ?? null, sent, skipped },
        })
      })

      return reply.send({
        sent,
        skipped,
        total: students.length,
        message: `SMS sent to ${sent} parent(s). ${skipped} skipped (no phone number).`,
      })
    })
}
