import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function feeRoutes(app: FastifyInstance) {

  // ── Generate receipt number ───────────────────────────────────────────────
  async function generateReceiptNo(tdb: any, schoolId: string): Promise<string> {
    const rows = await tdb.query`
      SELECT COUNT(*) AS total FROM fee_payments WHERE school_id = ${schoolId}::uuid
    ` as any[]
    const count = Number(rows[0]?.total ?? 0) + 1
    return `RCP-${String(count).padStart(5, '0')}-${new Date().getFullYear()}`
  }

  // ── List fee structures ───────────────────────────────────────────────────
  app.get('/fees/structures', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel } = request.query as any
      const tdb = tenantDb(request.schoolId)

      let structures: any[]
      if (termId && classLevel) {
        structures = await tdb.query`
          SELECT id, name, amount, class_level, is_mandatory, term_id, created_at
          FROM fee_structures
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          AND class_level = ${classLevel}
          ORDER BY is_mandatory DESC, name ASC
        ` as any[]
      } else if (termId) {
        structures = await tdb.query`
          SELECT id, name, amount, class_level, is_mandatory, term_id, created_at
          FROM fee_structures
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          ORDER BY class_level, is_mandatory DESC, name ASC
        ` as any[]
      } else {
        structures = await tdb.query`
          SELECT id, name, amount, class_level, is_mandatory, term_id, created_at
          FROM fee_structures
          WHERE school_id = ${request.schoolId}::uuid
          ORDER BY class_level, is_mandatory DESC, name ASC
        ` as any[]
      }
      return reply.send({ structures })
    })

  // ── Create fee structure ──────────────────────────────────────────────────
  app.post('/fees/structures', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        classLevel: z.string().min(1),
        name: z.string().min(1),
        amount: z.number().positive(),
        isMandatory: z.boolean().default(true),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO fee_structures (school_id, term_id, class_level, name, amount, is_mandatory)
        VALUES (${request.schoolId}::uuid, ${d.termId}::uuid, ${d.classLevel}, ${d.name}, ${d.amount}, ${d.isMandatory})
        RETURNING id, name, amount, class_level, is_mandatory
      ` as any[]
      return reply.status(201).send({ structure: rows[0] })
    })

  // ── Delete fee structure ──────────────────────────────────────────────────
  app.delete('/fees/structures/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM fee_structures WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })

  // ── Get fee ledger for a class (who owes what, who paid) ─────────────────
  app.get('/fees/ledger', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel are required' })

      const tdb = tenantDb(request.schoolId)

      // Get fee structures for this class/term
      const structures = await tdb.query`
        SELECT id, name, amount, is_mandatory
        FROM fee_structures
        WHERE school_id = ${request.schoolId}::uuid
        AND term_id = ${termId}::uuid
        AND class_level = ${classLevel}
        ORDER BY is_mandatory DESC, name ASC
      ` as any[]

      // Get students
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

      // Get all payments for this term/class
      const payments = await tdb.query`
        SELECT fp.student_id, fp.fee_structure_id, SUM(fp.amount_paid) AS total_paid
        FROM fee_payments fp
        JOIN fee_structures fs ON fs.id = fp.fee_structure_id
        WHERE fp.school_id = ${request.schoolId}::uuid
        AND fs.term_id = ${termId}::uuid
        AND fs.class_level = ${classLevel}
        GROUP BY fp.student_id, fp.fee_structure_id
      ` as any[]

      // Build payment map
      const paymentMap: Record<string, Record<string, number>> = {}
      for (const p of payments) {
        if (!paymentMap[p.student_id]) paymentMap[p.student_id] = {}
        paymentMap[p.student_id][p.fee_structure_id] = Number(p.total_paid)
      }

      // Build ledger
      const totalFees = structures.reduce((s: number, f: any) => s + Number(f.amount), 0)
      const ledger = students.map((s: any) => {
        const studentPayments = paymentMap[s.id] ?? {}
        const totalPaid = Object.values(studentPayments).reduce((a: number, b: any) => a + Number(b), 0)
        const balance = totalFees - totalPaid
        return {
          studentId: s.id,
          studentName: s.full_name,
          admissionNo: s.admission_no,
          classArm: s.class_arm,
          totalFees,
          totalPaid,
          balance,
          isPaid: balance <= 0,
          feeDetails: structures.map((f: any) => ({
            feeId: f.id,
            feeName: f.name,
            amount: Number(f.amount),
            paid: studentPayments[f.id] ?? 0,
            balance: Number(f.amount) - (studentPayments[f.id] ?? 0),
          }))
        }
      })

      return reply.send({ ledger, structures, totalFees })
    })

  // ── Record a payment ──────────────────────────────────────────────────────
  app.post('/fees/payments', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        feeStructureId: z.string().uuid(),
        studentId: z.string().uuid(),
        amountPaid: z.number().positive(),
        paymentMethod: z.enum(['cash', 'bank_transfer', 'paystack']),
        paymentDate: z.string().optional(),
        notes: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const receiptNo = await generateReceiptNo(tdb, request.schoolId)

      const rows = await tdb.query`
        INSERT INTO fee_payments (
          school_id, fee_structure_id, student_id, amount_paid,
          payment_method, receipt_number, payment_date, recorded_by, notes
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.feeStructureId}::uuid, ${d.studentId}::uuid,
          ${d.amountPaid}, ${d.paymentMethod}, ${receiptNo},
          ${d.paymentDate ?? new Date().toISOString().split('T')[0]}::date,
          ${request.user.id}::uuid, ${d.notes ?? null}
        )
        RETURNING id, receipt_number, amount_paid, payment_method, payment_date
      ` as any[]

      return reply.status(201).send({ payment: rows[0], receiptNo })
    })

  // ── Get payment history for a student ────────────────────────────────────
  app.get('/fees/payments', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { studentId, termId } = request.query as any
      if (!studentId) return reply.status(400).send({ error: 'studentId is required' })

      const tdb = tenantDb(request.schoolId)

      let payments: any[]
      if (termId) {
        payments = await tdb.query`
          SELECT fp.id, fp.amount_paid, fp.payment_method, fp.receipt_number,
                 fp.payment_date, fp.notes, fs.name AS fee_name, fs.amount AS fee_amount
          FROM fee_payments fp
          JOIN fee_structures fs ON fs.id = fp.fee_structure_id
          WHERE fp.student_id = ${studentId}::uuid
          AND fp.school_id = ${request.schoolId}::uuid
          AND fs.term_id = ${termId}::uuid
          ORDER BY fp.payment_date DESC, fp.created_at DESC
        ` as any[]
      } else {
        payments = await tdb.query`
          SELECT fp.id, fp.amount_paid, fp.payment_method, fp.receipt_number,
                 fp.payment_date, fp.notes, fs.name AS fee_name, fs.amount AS fee_amount
          FROM fee_payments fp
          JOIN fee_structures fs ON fs.id = fp.fee_structure_id
          WHERE fp.student_id = ${studentId}::uuid
          AND fp.school_id = ${request.schoolId}::uuid
          ORDER BY fp.payment_date DESC, fp.created_at DESC
        ` as any[]
      }
      return reply.send({ payments })
    })

  // ── Get fee collection summary ────────────────────────────────────────────
  app.get('/fees/summary', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { termId } = request.query as any
      if (!termId) return reply.status(400).send({ error: 'termId is required' })

      const tdb = tenantDb(request.schoolId)

      const summary = await tdb.query`
        SELECT
          fs.class_level,
          SUM(fs.amount) AS fee_per_student,
          COUNT(DISTINCT u.id) AS student_count,
          SUM(fs.amount) * COUNT(DISTINCT u.id) AS total_expected,
          COALESCE(SUM(fp.amount_paid), 0) AS total_collected,
          SUM(fs.amount) * COUNT(DISTINCT u.id) - COALESCE(SUM(fp.amount_paid), 0) AS total_outstanding
        FROM fee_structures fs
        JOIN users u ON u.class_level = fs.class_level
          AND u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student' AND u.is_active = true
        LEFT JOIN fee_payments fp ON fp.fee_structure_id = fs.id
          AND fp.student_id = u.id
          AND fp.school_id = ${request.schoolId}::uuid
        WHERE fs.school_id = ${request.schoolId}::uuid
        AND fs.term_id = ${termId}::uuid
        GROUP BY fs.class_level
        ORDER BY fs.class_level
      ` as any[]

      return reply.send({ summary })
    })
}
