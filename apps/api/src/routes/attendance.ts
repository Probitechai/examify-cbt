import { sendSms, absenceAlertSms } from '../lib/sms'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function attendanceRoutes(app: FastifyInstance) {

  // ── Mark attendance for a class (bulk) ───────────────────────────────────
  app.post('/attendance', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        date: z.string(), // YYYY-MM-DD
        classLevel: z.string(),
        classArm: z.string().optional(),
        records: z.array(z.object({
          studentId: z.string().uuid(),
          status: z.enum(['present', 'absent', 'late', 'excused']),
          remark: z.string().optional(),
        }))
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      let saved = 0

      for (const r of d.records) {
        await tdb.query`
          INSERT INTO attendance_records (
            school_id, term_id, student_id, class_level, class_arm,
            date, status, remark, marked_by
          )
          VALUES (
            ${request.schoolId}::uuid, ${d.termId}::uuid, ${r.studentId}::uuid,
            ${d.classLevel}, ${d.classArm ?? null},
            ${d.date}::date, ${r.status}, ${r.remark ?? null}, ${request.user.id}::uuid
          )
          ON CONFLICT (student_id, date) DO UPDATE SET
            status = EXCLUDED.status,
            remark = EXCLUDED.remark,
            marked_by = EXCLUDED.marked_by
        `
        saved++
      }

      // Send SMS alerts for absent students (fire and forget)
      ;(async () => {
        try {
          const absentStudents = d.records.filter(r => r.status === 'absent')
          if (absentStudents.length === 0) return

          const tdb2 = tenantDb(request.schoolId)
          for (const r of absentStudents) {
            // Get student and parent phone
            const rows = await tdb2.query`
              SELECT u.full_name AS student_name,
                     p.phone AS parent_phone
              FROM users u
              LEFT JOIN parent_student_links psl ON psl.student_id = u.id
                AND psl.school_id = ${request.schoolId}::uuid
              LEFT JOIN users p ON p.id = psl.parent_id
              WHERE u.id = ${r.studentId}::uuid
              LIMIT 1
            ` as any[]

            const row = rows[0]
            if (row?.parent_phone) {
              const message = absenceAlertSms({
                schoolName: request.school.name,
                studentName: row.student_name,
                date: new Date(d.date).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }),
              })
              await sendSms({ to: row.parent_phone, message })
            }
          }
        } catch (err: any) {
          console.error('[SMS] Absence alert error:', err.message)
        }
      })()

      return reply.send({ saved })
    })

  // ── Get attendance for a class on a specific date ─────────────────────────
  app.get('/attendance', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, date, classLevel, classArm } = request.query as any
      if (!termId || !date || !classLevel) {
        return reply.status(400).send({ error: 'termId, date and classLevel are required' })
      }

      const tdb = tenantDb(request.schoolId)

      // Get all students in the class
      let students: any[]
      if (classArm) {
        students = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no, u.class_arm,
                 ar.status, ar.remark, ar.id AS record_id
          FROM users u
          LEFT JOIN attendance_records ar ON ar.student_id = u.id
            AND ar.date = ${date}::date
            AND ar.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student' AND u.is_active = true
          AND u.class_level = ${classLevel} AND u.class_arm = ${classArm}
          ORDER BY u.full_name ASC
        ` as any[]
      } else {
        students = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no, u.class_arm,
                 ar.status, ar.remark, ar.id AS record_id
          FROM users u
          LEFT JOIN attendance_records ar ON ar.student_id = u.id
            AND ar.date = ${date}::date
            AND ar.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student' AND u.is_active = true
          AND u.class_level = ${classLevel}
          ORDER BY u.full_name ASC
        ` as any[]
      }

      return reply.send({ students, date, alreadyMarked: students.some((s: any) => s.status !== null) })
    })

  // ── Get attendance summary for a student ──────────────────────────────────
  app.get('/attendance/summary', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId, studentId, classLevel, classArm } = request.query as any
      if (!termId) return reply.status(400).send({ error: 'termId is required' })

      const tdb = tenantDb(request.schoolId)

      if (studentId) {
        // Single student summary
        const rows = await tdb.query`
          SELECT
            COUNT(*) FILTER (WHERE status = 'present') AS present,
            COUNT(*) FILTER (WHERE status = 'absent') AS absent,
            COUNT(*) FILTER (WHERE status = 'late') AS late,
            COUNT(*) FILTER (WHERE status = 'excused') AS excused,
            COUNT(*) AS total_days
          FROM attendance_records
          WHERE term_id = ${termId}::uuid
          AND student_id = ${studentId}::uuid
          AND school_id = ${request.schoolId}::uuid
        ` as any[]
        return reply.send({ summary: rows[0] })
      }

      // Class summary
      let rows: any[]
      if (classArm) {
        rows = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no,
            COUNT(ar.id) FILTER (WHERE ar.status = 'present') AS present,
            COUNT(ar.id) FILTER (WHERE ar.status = 'absent') AS absent,
            COUNT(ar.id) FILTER (WHERE ar.status = 'late') AS late,
            COUNT(ar.id) FILTER (WHERE ar.status = 'excused') AS excused,
            COUNT(ar.id) AS total_days
          FROM users u
          LEFT JOIN attendance_records ar ON ar.student_id = u.id
            AND ar.term_id = ${termId}::uuid
            AND ar.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student' AND u.is_active = true
          AND u.class_level = ${classLevel} AND u.class_arm = ${classArm}
          GROUP BY u.id ORDER BY u.full_name
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no,
            COUNT(ar.id) FILTER (WHERE ar.status = 'present') AS present,
            COUNT(ar.id) FILTER (WHERE ar.status = 'absent') AS absent,
            COUNT(ar.id) FILTER (WHERE ar.status = 'late') AS late,
            COUNT(ar.id) FILTER (WHERE ar.status = 'excused') AS excused,
            COUNT(ar.id) AS total_days
          FROM users u
          LEFT JOIN attendance_records ar ON ar.student_id = u.id
            AND ar.term_id = ${termId}::uuid
            AND ar.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student' AND u.is_active = true
          AND u.class_level = ${classLevel}
          GROUP BY u.id ORDER BY u.full_name
        ` as any[]
      }
      return reply.send({ summary: rows })
    })

  // ── Get attendance history for a class (by date range) ───────────────────
  app.get('/attendance/history', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm, startDate, endDate } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel are required' })

      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (classArm) {
        rows = await tdb.query`
          SELECT ar.date, ar.student_id, ar.status, ar.remark,
                 u.full_name AS student_name
          FROM attendance_records ar
          JOIN users u ON u.id = ar.student_id
          WHERE ar.term_id = ${termId}::uuid
          AND ar.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          AND u.class_arm = ${classArm}
          ORDER BY ar.date DESC, u.full_name ASC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT ar.date, ar.student_id, ar.status, ar.remark,
                 u.full_name AS student_name
          FROM attendance_records ar
          JOIN users u ON u.id = ar.student_id
          WHERE ar.term_id = ${termId}::uuid
          AND ar.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          ORDER BY ar.date DESC, u.full_name ASC
        ` as any[]
      }
      return reply.send({ records: rows })
    })
}
