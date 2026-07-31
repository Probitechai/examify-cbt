import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function certificateRoutes(app: FastifyInstance) {

  // LIST CERTIFICATES FOR A STUDENT
  app.get('/certificates/student/:studentId', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { studentId } = request.params as any
      const sid = String(studentId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT cc.*, u.full_name AS student_name, u.class_level, u.class_arm,
               cs.name AS subject_name, t.name AS term_name,
               s.name AS session_name, iss.full_name AS issued_by_name,
               sch.name AS school_name, sch.logo_url AS school_logo
        FROM completion_certificates cc
        JOIN users u ON u.id = cc.student_id
        LEFT JOIN curriculum_subjects cs ON cs.id = cc.subject_id
        JOIN terms t ON t.id = cc.term_id
        JOIN academic_sessions s ON s.id = t.session_id
        LEFT JOIN users iss ON iss.id = cc.issued_by
        JOIN schools sch ON sch.id = cc.school_id
        WHERE cc.school_id = ${request.schoolId}::uuid
        AND cc.student_id = ${sid}::uuid
        AND cc.is_revoked = false
        ORDER BY cc.issued_at DESC
      ` as any[]
      return reply.send({ certificates: rows })
    })

  // LIST ALL CERTIFICATES (admin view)
  app.get('/certificates', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, type } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const tid = termId ? String(termId) : null
      const cl = classLevel ? String(classLevel) : null
      const tp = type ? String(type) : null

      let rows: any[]
      if (tid && cl) {
        rows = await tdb.query`
          SELECT cc.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 cs.name AS subject_name, t.name AS term_name
          FROM completion_certificates cc
          JOIN users u ON u.id = cc.student_id
          LEFT JOIN curriculum_subjects cs ON cs.id = cc.subject_id
          JOIN terms t ON t.id = cc.term_id
          WHERE cc.school_id = ${request.schoolId}::uuid
          AND cc.term_id = ${tid}::uuid
          AND u.class_level = ${cl}
          AND cc.is_revoked = false
          ORDER BY cc.issued_at DESC
        ` as any[]
      } else if (tid) {
        rows = await tdb.query`
          SELECT cc.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 cs.name AS subject_name, t.name AS term_name
          FROM completion_certificates cc
          JOIN users u ON u.id = cc.student_id
          LEFT JOIN curriculum_subjects cs ON cs.id = cc.subject_id
          JOIN terms t ON t.id = cc.term_id
          WHERE cc.school_id = ${request.schoolId}::uuid
          AND cc.term_id = ${tid}::uuid
          AND cc.is_revoked = false
          ORDER BY cc.issued_at DESC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT cc.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 cs.name AS subject_name, t.name AS term_name
          FROM completion_certificates cc
          JOIN users u ON u.id = cc.student_id
          LEFT JOIN curriculum_subjects cs ON cs.id = cc.subject_id
          JOIN terms t ON t.id = cc.term_id
          WHERE cc.school_id = ${request.schoolId}::uuid
          AND cc.is_revoked = false
          ORDER BY cc.issued_at DESC
        ` as any[]
      }
      return reply.send({ certificates: rows })
    })

  // GET SINGLE CERTIFICATE (for rendering)
  app.get('/certificates/:id', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const cid = String(id)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT cc.*, u.full_name AS student_name, u.class_level, u.class_arm,
               u.admission_no,
               cs.name AS subject_name, t.name AS term_name,
               s.name AS session_name, iss.full_name AS issued_by_name,
               sch.name AS school_name, sch.logo_url AS school_logo
        FROM completion_certificates cc
        JOIN users u ON u.id = cc.student_id
        LEFT JOIN curriculum_subjects cs ON cs.id = cc.subject_id
        JOIN terms t ON t.id = cc.term_id
        JOIN academic_sessions s ON s.id = t.session_id
        LEFT JOIN users iss ON iss.id = cc.issued_by
        JOIN schools sch ON sch.id = cc.school_id
        WHERE cc.id = ${cid}::uuid
        AND cc.school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'Certificate not found' })
      return reply.send({ certificate: rows[0] })
    })

  // ISSUE CERTIFICATE (manual or auto)
  app.post('/certificates', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        studentId: z.string().uuid(),
        termId: z.string().uuid(),
        subjectId: z.string().uuid().optional(),
        certificateType: z.enum(['lesson_completion', 'term_excellence', 'custom']),
        title: z.string().min(1),
        description: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const stid = d.studentId
      const tid = d.termId
      const subid = d.subjectId ?? null
      const ct = d.certificateType
      const title = d.title
      const desc = d.description ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (subid) {
        rows = await tdb.query`
          INSERT INTO completion_certificates (school_id, student_id, term_id, subject_id, certificate_type, title, description, issued_by)
          VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${tid}::uuid, ${subid}::uuid, ${ct}, ${title}, ${desc}, ${uid}::uuid)
          ON CONFLICT (school_id, student_id, term_id, subject_id, certificate_type) DO NOTHING
          RETURNING id, certificate_number, issued_at
        ` as any[]
      } else {
        rows = await tdb.query`
          INSERT INTO completion_certificates (school_id, student_id, term_id, certificate_type, title, description, issued_by)
          VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${tid}::uuid, ${ct}, ${title}, ${desc}, ${uid}::uuid)
          RETURNING id, certificate_number, issued_at
        ` as any[]
      }
      if (!rows[0]) return reply.send({ alreadyIssued: true })
      return reply.status(201).send({ certificate: rows[0] })
    })

  // BULK ISSUE — issue to all students who completed lessons in a term
  app.post('/certificates/bulk-issue', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        classLevel: z.string().min(1),
        subjectId: z.string().uuid().optional(),
        certificateType: z.enum(['lesson_completion', 'term_excellence', 'custom']),
        title: z.string().min(1),
        description: z.string().optional(),
        minCompletionPct: z.number().min(0).max(100).default(80),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tid = d.termId
      const cl = d.classLevel
      const subid = d.subjectId ?? null
      const ct = d.certificateType
      const title = d.title
      const desc = d.description ?? null
      const minPct = d.minCompletionPct
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      // Find eligible students based on lesson completions
      const eligible = await tdb.query`
        SELECT DISTINCT lc.student_id,
               AVG(lc.progress_pct) AS avg_progress
        FROM lesson_completions lc
        JOIN lesson_plans lp ON lp.id = lc.lesson_id
        JOIN users u ON u.id = lc.student_id
        WHERE lc.school_id = ${request.schoolId}::uuid
        AND lp.term_id = ${tid}::uuid
        AND lp.class_level = ${cl}
        AND lp.status = 'published'
        AND u.class_level = ${cl}
        GROUP BY lc.student_id
        HAVING AVG(lc.progress_pct) >= ${minPct}
      ` as any[]

      let issued = 0
      for (const student of eligible) {
        const stid = student.student_id
        if (subid) {
          await tdb.query`
            INSERT INTO completion_certificates (school_id, student_id, term_id, subject_id, certificate_type, title, description, issued_by)
            VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${tid}::uuid, ${subid}::uuid, ${ct}, ${title}, ${desc}, ${uid}::uuid)
            ON CONFLICT (school_id, student_id, term_id, subject_id, certificate_type) DO NOTHING
          `
        } else {
          await tdb.query`
            INSERT INTO completion_certificates (school_id, student_id, term_id, certificate_type, title, description, issued_by)
            VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${tid}::uuid, ${ct}, ${title}, ${desc}, ${uid}::uuid)
            ON CONFLICT DO NOTHING
          `
        }
        issued++
      }
      return reply.send({ issued, eligible: eligible.length })
    })

  // REVOKE CERTIFICATE
  app.patch('/certificates/:id/revoke', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const cid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE completion_certificates SET is_revoked = true
        WHERE id = ${cid}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ revoked: true })
    })
}
