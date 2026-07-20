import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function parentRoutes(app: FastifyInstance) {

  // ── Link parent to student ────────────────────────────────────────────────
  app.post('/parents/link', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        parentId: z.string().uuid(),
        studentId: z.string().uuid(),
        relationship: z.string().default('parent'),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      await tdb.query`
        INSERT INTO parent_student_links (school_id, parent_id, student_id, relationship)
        VALUES (${request.schoolId}::uuid, ${d.parentId}::uuid, ${d.studentId}::uuid, ${d.relationship})
        ON CONFLICT (parent_id, student_id) DO NOTHING
      `
      return reply.send({ linked: true })
    })

  // ── Unlink parent from student ────────────────────────────────────────────
  app.delete('/parents/link', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { parentId, studentId } = request.query as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM parent_student_links
        WHERE parent_id = ${parentId}::uuid
        AND student_id = ${studentId}::uuid
        AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ unlinked: true })
    })

  // ── Get parent's linked students ──────────────────────────────────────────
  app.get('/parents/my-students', { preHandler: [authenticate, requireRole('parent')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const students = await tdb.query`
        SELECT u.id, u.full_name, u.admission_no, u.class_level, u.class_arm, u.photo_url,
               psl.relationship
        FROM parent_student_links psl
        JOIN users u ON u.id = psl.student_id
        WHERE psl.parent_id = ${request.user.id}::uuid
        AND psl.school_id = ${request.schoolId}::uuid
        ORDER BY u.full_name ASC
      ` as any[]
      return reply.send({ students })
    })

  // ── Get parent dashboard (summary for all linked students) ────────────────
  app.get('/parents/dashboard', { preHandler: [authenticate, requireRole('parent')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)

      // Get linked students
      const students = await tdb.query`
        SELECT u.id, u.full_name, u.admission_no, u.class_level, u.class_arm, u.photo_url
        FROM parent_student_links psl
        JOIN users u ON u.id = psl.student_id
        WHERE psl.parent_id = ${request.user.id}::uuid
        AND psl.school_id = ${request.schoolId}::uuid
      ` as any[]

      // Get active term
      const termRows = await tdb.query`
        SELECT t.id AS term_id, t.name AS term_name, s.name AS session_name
        FROM terms t JOIN academic_sessions s ON s.id = t.session_id
        WHERE t.school_id = ${request.schoolId}::uuid
        AND t.is_active = true AND s.is_active = true
        LIMIT 1
      ` as any[]

      const activeTerm = termRows[0]
      const dashboardData = []

      for (const student of students) {
        let resultSummary = null
        let attendanceSummary = null
        let feeSummary = null

        if (activeTerm) {
          // Result summary
          const resultRows = await tdb.query`
            SELECT COUNT(*) AS subject_count,
                   AVG(total_score) AS average,
                   COUNT(*) FILTER (WHERE grade = 'F') AS failed
            FROM student_results
            WHERE student_id = ${student.id}::uuid
            AND term_id = ${activeTerm.term_id}::uuid
            AND school_id = ${request.schoolId}::uuid
            AND approved_at IS NOT NULL
          ` as any[]
          resultSummary = resultRows[0]

          // Attendance summary
          const attRows = await tdb.query`
            SELECT
              COUNT(*) FILTER (WHERE status = 'present') AS present,
              COUNT(*) FILTER (WHERE status = 'absent') AS absent,
              COUNT(*) FILTER (WHERE status = 'late') AS late,
              COUNT(*) AS total_days
            FROM attendance_records
            WHERE student_id = ${student.id}::uuid
            AND term_id = ${activeTerm.term_id}::uuid
            AND school_id = ${request.schoolId}::uuid
          ` as any[]
          attendanceSummary = attRows[0]

          // Fee summary
          const feeRows = await tdb.query`
            SELECT
              COALESCE(SUM(fs.amount), 0) AS total_fees,
              COALESCE(SUM(fp.amount_paid), 0) AS total_paid
            FROM fee_structures fs
            LEFT JOIN fee_payments fp ON fp.fee_structure_id = fs.id
              AND fp.student_id = ${student.id}::uuid
              AND fp.school_id = ${request.schoolId}::uuid
            WHERE fs.school_id = ${request.schoolId}::uuid
            AND fs.term_id = ${activeTerm.term_id}::uuid
            AND fs.class_level = ${student.class_level}
          ` as any[]
          feeSummary = feeRows[0]
        }

        dashboardData.push({
          student,
          activeTerm,
          resultSummary,
          attendanceSummary,
          feeSummary: feeSummary ? {
            totalFees: Number(feeSummary.total_fees),
            totalPaid: Number(feeSummary.total_paid),
            balance: Number(feeSummary.total_fees) - Number(feeSummary.total_paid),
          } : null,
        })
      }

      return reply.send({ dashboard: dashboardData })
    })

  // ── Get student results (parent view — approved only) ─────────────────────
  app.get('/parents/results', { preHandler: [authenticate, requireRole('parent')] },
    async (request: any, reply: any) => {
      const { studentId, termId } = request.query as any
      if (!studentId || !termId) return reply.status(400).send({ error: 'studentId and termId required' })

      const tdb = tenantDb(request.schoolId)

      // Verify parent is linked to this student
      const linkRows = await tdb.query`
        SELECT id FROM parent_student_links
        WHERE parent_id = ${request.user.id}::uuid
        AND student_id = ${studentId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!linkRows[0]) return reply.status(403).send({ error: 'NOT_LINKED' })

      // Only return approved results
      const results = await tdb.query`
        SELECT subject, ca_score, exam_score, total_score, grade, remark, teacher_comment
        FROM student_results
        WHERE student_id = ${studentId}::uuid
        AND term_id = ${termId}::uuid
        AND school_id = ${request.schoolId}::uuid
        AND approved_at IS NOT NULL
        ORDER BY subject ASC
      ` as any[]

      const studentRows = await tdb.query`
        SELECT full_name, admission_no, class_level, class_arm
        FROM users WHERE id = ${studentId}::uuid
      ` as any[]

      const termRows = await tdb.query`
        SELECT t.name AS term_name, s.name AS session_name
        FROM terms t JOIN academic_sessions s ON s.id = t.session_id
        WHERE t.id = ${termId}::uuid
      ` as any[]

      const schoolRows = await tdb.query`
        SELECT name, logo_url FROM schools WHERE id = ${request.schoolId}::uuid
      ` as any[]

      const total = results.reduce((s: number, r: any) => s + Number(r.total_score ?? 0), 0)
      const average = results.length > 0 ? Math.round((total / results.length) * 10) / 10 : 0

      // Compute position
      const classmates = await tdb.query`
        SELECT sr.student_id, SUM(sr.total_score) AS grand_total
        FROM student_results sr JOIN users u ON u.id = sr.student_id
        WHERE sr.term_id = ${termId}::uuid AND sr.school_id = ${request.schoolId}::uuid
        AND u.class_level = ${studentRows[0]?.class_level}
        AND u.class_arm = ${studentRows[0]?.class_arm}
        AND sr.approved_at IS NOT NULL
        GROUP BY sr.student_id ORDER BY grand_total DESC
      ` as any[]
      const pos = classmates.findIndex((c: any) => c.student_id === studentId)
      const position = pos >= 0 ? `${pos + 1} of ${classmates.length}` : null

      return reply.send({
        results, student: studentRows[0], term: termRows[0],
        school: schoolRows[0],
        summary: { total, average, position }
      })
    })

  // ── Get student attendance (parent view) ──────────────────────────────────
  app.get('/parents/attendance', { preHandler: [authenticate, requireRole('parent')] },
    async (request: any, reply: any) => {
      const { studentId, termId } = request.query as any
      if (!studentId || !termId) return reply.status(400).send({ error: 'studentId and termId required' })

      const tdb = tenantDb(request.schoolId)

      // Verify link
      const linkRows = await tdb.query`
        SELECT id FROM parent_student_links
        WHERE parent_id = ${request.user.id}::uuid
        AND student_id = ${studentId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!linkRows[0]) return reply.status(403).send({ error: 'NOT_LINKED' })

      const records = await tdb.query`
        SELECT date, status, remark
        FROM attendance_records
        WHERE student_id = ${studentId}::uuid
        AND term_id = ${termId}::uuid
        AND school_id = ${request.schoolId}::uuid
        ORDER BY date DESC
      ` as any[]

      const summary = await tdb.query`
        SELECT
          COUNT(*) FILTER (WHERE status = 'present') AS present,
          COUNT(*) FILTER (WHERE status = 'absent') AS absent,
          COUNT(*) FILTER (WHERE status = 'late') AS late,
          COUNT(*) FILTER (WHERE status = 'excused') AS excused,
          COUNT(*) AS total_days
        FROM attendance_records
        WHERE student_id = ${studentId}::uuid
        AND term_id = ${termId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      return reply.send({ records, summary: summary[0] })
    })

  // ── Get student fees (parent view) ────────────────────────────────────────
  app.get('/parents/fees', { preHandler: [authenticate, requireRole('parent')] },
    async (request: any, reply: any) => {
      const { studentId, termId } = request.query as any
      if (!studentId || !termId) return reply.status(400).send({ error: 'studentId and termId required' })

      const tdb = tenantDb(request.schoolId)

      // Verify link
      const linkRows = await tdb.query`
        SELECT id FROM parent_student_links
        WHERE parent_id = ${request.user.id}::uuid
        AND student_id = ${studentId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!linkRows[0]) return reply.status(403).send({ error: 'NOT_LINKED' })

      const studentRows = await tdb.query`
        SELECT class_level FROM users WHERE id = ${studentId}::uuid
      ` as any[]

      const structures = await tdb.query`
        SELECT fs.id, fs.name, fs.amount, fs.is_mandatory,
               COALESCE(SUM(fp.amount_paid), 0) AS total_paid
        FROM fee_structures fs
        LEFT JOIN fee_payments fp ON fp.fee_structure_id = fs.id
          AND fp.student_id = ${studentId}::uuid
          AND fp.school_id = ${request.schoolId}::uuid
        WHERE fs.school_id = ${request.schoolId}::uuid
        AND fs.term_id = ${termId}::uuid
        AND fs.class_level = ${studentRows[0]?.class_level}
        GROUP BY fs.id ORDER BY fs.is_mandatory DESC, fs.name ASC
      ` as any[]

      const payments = await tdb.query`
        SELECT fp.receipt_number, fp.amount_paid, fp.payment_method,
               fp.payment_date, fs.name AS fee_name
        FROM fee_payments fp
        JOIN fee_structures fs ON fs.id = fp.fee_structure_id
        WHERE fp.student_id = ${studentId}::uuid
        AND fp.school_id = ${request.schoolId}::uuid
        AND fs.term_id = ${termId}::uuid
        ORDER BY fp.payment_date DESC
      ` as any[]

      const totalFees = structures.reduce((s: number, f: any) => s + Number(f.amount), 0)
      const totalPaid = structures.reduce((s: number, f: any) => s + Number(f.total_paid), 0)

      return reply.send({
        structures: structures.map((f: any) => ({
          ...f,
          amount: Number(f.amount),
          totalPaid: Number(f.total_paid),
          balance: Number(f.amount) - Number(f.total_paid),
        })),
        payments,
        summary: { totalFees, totalPaid, balance: totalFees - totalPaid }
      })
    })

  // ── Get all terms (for parent to select) ─────────────────────────────────
  app.get('/parents/terms', { preHandler: [authenticate, requireRole('parent')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const terms = await tdb.query`
        SELECT t.id, t.name, t.term_number, t.is_active, s.name AS session_name, s.is_active AS session_active
        FROM terms t JOIN academic_sessions s ON s.id = t.session_id
        WHERE t.school_id = ${request.schoolId}::uuid
        ORDER BY s.created_at DESC, t.term_number ASC
      ` as any[]
      return reply.send({ terms })
   
  // ── Get all parent-student links for admin ─────────────────────────────────
  app.get('/parents/links', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const links = await tdb.query`
        SELECT
          p.id AS parent_id, p.full_name AS parent_name,
          p.email AS parent_email, p.phone AS parent_phone,
          s.id AS student_id, s.full_name AS student_name,
          s.class_level, s.class_arm
        FROM parent_student_links psl
        JOIN users p ON p.id = psl.parent_id
        JOIN users s ON s.id = psl.student_id
        WHERE psl.school_id = ${request.schoolId}::uuid
        ORDER BY p.full_name, s.full_name
      ` as any[]
      return reply.send({ links })
    })
  }
