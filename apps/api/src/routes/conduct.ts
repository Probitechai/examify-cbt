import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { requireTier } from '../middleware/tier'

export async function conductRoutes(app: FastifyInstance) {

  // ── Get conduct reports for a class/term ──────────────────────────────────
  app.get('/conduct', { preHandler: [authenticate, requireRole('school_admin', 'teacher'), requireTier('growth')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel required' })

      const tdb = tenantDb(request.schoolId)
      let students: any[]

      if (classArm) {
        students = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no, u.class_arm,
                 cr.id AS report_id, cr.class_teacher_remark,
                 cr.punctuality, cr.neatness, cr.cooperation,
                 cr.leadership, cr.participation
          FROM users u
          LEFT JOIN conduct_reports cr ON cr.student_id = u.id
            AND cr.term_id = ${termId}::uuid
            AND cr.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student' AND u.is_active = true
          AND u.class_level = ${classLevel} AND u.class_arm = ${classArm}
          ORDER BY u.full_name ASC
        ` as any[]
      } else {
        students = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no, u.class_arm,
                 cr.id AS report_id, cr.class_teacher_remark,
                 cr.punctuality, cr.neatness, cr.cooperation,
                 cr.leadership, cr.participation
          FROM users u
          LEFT JOIN conduct_reports cr ON cr.student_id = u.id
            AND cr.term_id = ${termId}::uuid
            AND cr.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student' AND u.is_active = true
          AND u.class_level = ${classLevel}
          ORDER BY u.full_name ASC
        ` as any[]
      }
      return reply.send({ students })
    })

  // ── Save conduct report for a student ────────────────────────────────────
  app.post('/conduct', { preHandler: [authenticate, requireRole('school_admin', 'teacher'), requireTier('growth')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        studentId: z.string().uuid(),
        classTeacherRemark: z.string().optional(),
        punctuality: z.number().int().min(1).max(5).optional(),
        neatness: z.number().int().min(1).max(5).optional(),
        cooperation: z.number().int().min(1).max(5).optional(),
        leadership: z.number().int().min(1).max(5).optional(),
        participation: z.number().int().min(1).max(5).optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      await tdb.query`
        INSERT INTO conduct_reports (
          school_id, term_id, student_id, entered_by,
          class_teacher_remark, punctuality, neatness,
          cooperation, leadership, participation
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.termId}::uuid, ${d.studentId}::uuid,
          ${request.user.id}::uuid,
          ${d.classTeacherRemark ?? null}, ${d.punctuality ?? null},
          ${d.neatness ?? null}, ${d.cooperation ?? null},
          ${d.leadership ?? null}, ${d.participation ?? null}
        )
        ON CONFLICT (term_id, student_id) DO UPDATE SET
          class_teacher_remark = EXCLUDED.class_teacher_remark,
          punctuality = EXCLUDED.punctuality,
          neatness = EXCLUDED.neatness,
          cooperation = EXCLUDED.cooperation,
          leadership = EXCLUDED.leadership,
          participation = EXCLUDED.participation,
          entered_by = EXCLUDED.entered_by,
          updated_at = now()
      `
      return reply.send({ saved: true })
    })

  // ── Bulk save conduct reports ─────────────────────────────────────────────
  app.post('/conduct/bulk', { preHandler: [authenticate, requireRole('school_admin', 'teacher'), requireTier('growth')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        reports: z.array(z.object({
          studentId: z.string().uuid(),
          classTeacherRemark: z.string().optional(),
          punctuality: z.number().int().min(1).max(5).optional(),
          neatness: z.number().int().min(1).max(5).optional(),
          cooperation: z.number().int().min(1).max(5).optional(),
          leadership: z.number().int().min(1).max(5).optional(),
          participation: z.number().int().min(1).max(5).optional(),
        }))
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      let saved = 0

      for (const r of d.reports) {
        await tdb.query`
          INSERT INTO conduct_reports (
            school_id, term_id, student_id, entered_by,
            class_teacher_remark, punctuality, neatness,
            cooperation, leadership, participation
          )
          VALUES (
            ${request.schoolId}::uuid, ${d.termId}::uuid, ${r.studentId}::uuid,
            ${request.user.id}::uuid,
            ${r.classTeacherRemark ?? null}, ${r.punctuality ?? null},
            ${r.neatness ?? null}, ${r.cooperation ?? null},
            ${r.leadership ?? null}, ${r.participation ?? null}
          )
          ON CONFLICT (term_id, student_id) DO UPDATE SET
            class_teacher_remark = EXCLUDED.class_teacher_remark,
            punctuality = EXCLUDED.punctuality,
            neatness = EXCLUDED.neatness,
            cooperation = EXCLUDED.cooperation,
            leadership = EXCLUDED.leadership,
            participation = EXCLUDED.participation,
            entered_by = EXCLUDED.entered_by,
            updated_at = now()
        `
        saved++
      }
      return reply.send({ saved })
    })

  // ── Get conduct report for a single student (used by report card) ─────────
  app.get('/conduct/student', { preHandler: [authenticate, requireTier('growth')] },
    async (request: any, reply: any) => {
      const { termId, studentId } = request.query as any
      if (!termId || !studentId) return reply.status(400).send({ error: 'termId and studentId required' })

      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT class_teacher_remark, punctuality, neatness,
               cooperation, leadership, participation
        FROM conduct_reports
        WHERE term_id = ${termId}::uuid
        AND student_id = ${studentId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      return reply.send({ conduct: rows[0] ?? null })
    })
}
