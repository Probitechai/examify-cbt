import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { requireTier } from '../middleware/tier'

async function isClassTeacherFor(tdb: any, schoolId: string, teacherId: string, classLevel: string, classArm: string): Promise<boolean> {
  const rows = await tdb.query`
    SELECT 1 FROM class_teachers
    WHERE school_id = ${schoolId}::uuid AND teacher_id = ${teacherId}::uuid
    AND class_level = ${classLevel} AND class_arm = ${classArm}
    LIMIT 1
  ` as any[]
  return rows.length > 0
}

export async function conductRoutes(app: FastifyInstance) {

  // ── Get conduct reports for a class/term ──────────────────────────────────
  app.get('/conduct', { preHandler: [authenticate, requireRole('school_admin', 'teacher', 'proprietor'), requireTier('standard')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel required' })

      const tdb = tenantDb(request.schoolId)

      if (request.user.role === 'teacher') {
        if (!classArm) {
          return reply.status(400).send({ error: 'ARM_REQUIRED', message: 'Select the specific class arm you are the class teacher for.' })
        }
        const isClassTeacher = await isClassTeacherFor(tdb, request.schoolId, request.user.id, classLevel, classArm)
        if (!isClassTeacher) {
          return reply.status(403).send({ error: 'NOT_CLASS_TEACHER', message: 'You are not the class teacher for this class arm.' })
        }
      }

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
  app.post('/conduct', { preHandler: [authenticate, requireRole('school_admin', 'teacher'), requireTier('standard')] },
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

      if (request.user.role === 'teacher') {
        const studentRows = await tdb.query`
          SELECT class_level, class_arm FROM users
          WHERE id = ${d.studentId}::uuid AND school_id = ${request.schoolId}::uuid
        ` as any[]
        const student = studentRows[0]
        if (!student) return reply.status(404).send({ error: 'STUDENT_NOT_FOUND' })
        const isClassTeacher = await isClassTeacherFor(tdb, request.schoolId, request.user.id, student.class_level, student.class_arm)
        if (!isClassTeacher) {
          return reply.status(403).send({ error: 'NOT_CLASS_TEACHER', message: 'You are not the class teacher for this student\'s class.' })
        }
      }

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
  app.post('/conduct/bulk', { preHandler: [authenticate, requireRole('school_admin', 'teacher'), requireTier('standard')] },
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

      if (request.user.role === 'teacher') {
        const studentIds = d.reports.map(r => r.studentId)
        const studentRows = await tdb.query`
          SELECT id, class_level, class_arm FROM users
          WHERE id = ANY(${studentIds}::uuid[]) AND school_id = ${request.schoolId}::uuid
        ` as any[]

        const scopeCache: Record<string, boolean> = {}
        const unauthorized: string[] = []
        for (const s of studentRows) {
          const key = `${s.class_level}|${s.class_arm}`
          if (!(key in scopeCache)) {
            scopeCache[key] = await isClassTeacherFor(tdb, request.schoolId, request.user.id, s.class_level, s.class_arm)
          }
          if (!scopeCache[key]) unauthorized.push(s.id)
        }
        if (unauthorized.length > 0) {
          return reply.status(403).send({
            error: 'NOT_CLASS_TEACHER',
            message: `You are not the class teacher for ${unauthorized.length} of these students. No reports were saved.`,
          })
        }
      }

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
  app.get('/conduct/student', { preHandler: [authenticate, requireTier('standard')] },
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
