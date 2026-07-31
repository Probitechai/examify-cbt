import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function learningPathRoutes(app: FastifyInstance) {

  // LIST PATHS
  app.get('/learning-paths', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { classLevel, subjectId, termId } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const cl = classLevel ? String(classLevel) : null
      const sid = subjectId ? String(subjectId) : null
      const tid = termId ? String(termId) : null

      let rows: any[]
      if (cl && tid) {
        rows = await tdb.query`
          SELECT lp.*, cs.name AS subject_name, t.name AS term_name,
                 COUNT(lps.id) AS step_count
          FROM learning_paths lp
          LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
          LEFT JOIN terms t ON t.id = lp.term_id
          LEFT JOIN learning_path_steps lps ON lps.path_id = lp.id
          WHERE lp.school_id = ${request.schoolId}::uuid
          AND lp.class_level = ${cl}
          AND lp.term_id = ${tid}::uuid
          GROUP BY lp.id, cs.name, t.name
          ORDER BY cs.name ASC
        ` as any[]
      } else if (cl) {
        rows = await tdb.query`
          SELECT lp.*, cs.name AS subject_name, t.name AS term_name,
                 COUNT(lps.id) AS step_count
          FROM learning_paths lp
          LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
          LEFT JOIN terms t ON t.id = lp.term_id
          LEFT JOIN learning_path_steps lps ON lps.path_id = lp.id
          WHERE lp.school_id = ${request.schoolId}::uuid
          AND lp.class_level = ${cl}
          GROUP BY lp.id, cs.name, t.name
          ORDER BY cs.name ASC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT lp.*, cs.name AS subject_name, t.name AS term_name,
                 COUNT(lps.id) AS step_count
          FROM learning_paths lp
          LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
          LEFT JOIN terms t ON t.id = lp.term_id
          LEFT JOIN learning_path_steps lps ON lps.path_id = lp.id
          WHERE lp.school_id = ${request.schoolId}::uuid
          GROUP BY lp.id, cs.name, t.name
          ORDER BY lp.class_level ASC, cs.name ASC
        ` as any[]
      }
      return reply.send({ paths: rows })
    })

  // GET SINGLE PATH WITH STEPS
  app.get('/learning-paths/:id', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const pid = String(id)
      const tdb = tenantDb(request.schoolId)

      const pathRows = await tdb.query`
        SELECT lp.*, cs.name AS subject_name, t.name AS term_name
        FROM learning_paths lp
        LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
        LEFT JOIN terms t ON t.id = lp.term_id
        WHERE lp.id = ${pid}::uuid AND lp.school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!pathRows[0]) return reply.status(404).send({ error: 'Path not found' })

      const steps = await tdb.query`
        SELECT lps.*, lesson.title AS lesson_title, lesson.status AS lesson_status,
               sow.topic AS scheme_topic, sow.week_number
        FROM learning_path_steps lps
        LEFT JOIN lesson_plans lesson ON lesson.id = lps.lesson_id
        LEFT JOIN scheme_of_work sow ON sow.id = lps.scheme_id
        WHERE lps.path_id = ${pid}::uuid AND lps.school_id = ${request.schoolId}::uuid
        ORDER BY lps.step_number ASC
      ` as any[]

      return reply.send({ path: pathRows[0], steps })
    })

  // GET PATH PROGRESS FOR A STUDENT
  app.get('/learning-paths/:id/progress', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const pid = String(id)
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      const steps = await tdb.query`
        SELECT lps.id AS step_id, lps.step_number, lps.title, lps.lesson_id,
               lps.is_required, lps.unlock_after_step,
               lc.progress_pct, lc.completed_at,
               lesson.title AS lesson_title, lesson.status AS lesson_status
        FROM learning_path_steps lps
        LEFT JOIN lesson_plans lesson ON lesson.id = lps.lesson_id
        LEFT JOIN lesson_completions lc ON lc.lesson_id = lps.lesson_id
          AND lc.student_id = ${uid}::uuid
          AND lc.school_id = ${request.schoolId}::uuid
        WHERE lps.path_id = ${pid}::uuid AND lps.school_id = ${request.schoolId}::uuid
        ORDER BY lps.step_number ASC
      ` as any[]

      const completed = steps.filter((s: any) => s.completed_at).length
      const total = steps.length
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0

      return reply.send({ steps, progress: { completed, total, pct } })
    })

  // CREATE PATH
  app.post('/learning-paths', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectId: z.string().uuid(),
        termId: z.string().uuid(),
        classLevel: z.string().min(1),
        classArm: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        isSequential: z.boolean().default(true),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const subid = d.subjectId
      const tid = d.termId
      const cl = d.classLevel
      const ca = d.classArm ?? null
      const title = d.title
      const desc = d.description ?? null
      const isSeq = d.isSequential
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      const rows = await tdb.query`
        INSERT INTO learning_paths (school_id, subject_id, term_id, class_level, class_arm, title, description, is_sequential, created_by)
        VALUES (${request.schoolId}::uuid, ${subid}::uuid, ${tid}::uuid, ${cl}, ${ca}, ${title}, ${desc}, ${isSeq}, ${uid}::uuid)
        ON CONFLICT (school_id, subject_id, term_id, class_level) DO UPDATE SET
          title = EXCLUDED.title, description = EXCLUDED.description,
          is_sequential = EXCLUDED.is_sequential, updated_at = now()
        RETURNING id, title
      ` as any[]
      return reply.status(201).send({ path: rows[0] })
    })

  // ADD STEP TO PATH
  app.post('/learning-paths/:id/steps', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        lessonId: z.string().uuid().optional(),
        schemeId: z.string().uuid().optional(),
        stepNumber: z.number().int().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        isRequired: z.boolean().default(true),
        unlockAfterStep: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const pid = String(id)
      const lid = d.lessonId ?? null
      const scid = d.schemeId ?? null
      const sn = d.stepNumber
      const title = d.title
      const desc = d.description ?? null
      const ir = d.isRequired
      const uas = d.unlockAfterStep ?? null
      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (lid && scid) {
        rows = await tdb.query`
          INSERT INTO learning_path_steps (school_id, path_id, lesson_id, scheme_id, step_number, title, description, is_required, unlock_after_step)
          VALUES (${request.schoolId}::uuid, ${pid}::uuid, ${lid}::uuid, ${scid}::uuid, ${sn}, ${title}, ${desc}, ${ir}, ${uas})
          ON CONFLICT (school_id, path_id, step_number) DO UPDATE SET
            lesson_id = EXCLUDED.lesson_id, scheme_id = EXCLUDED.scheme_id,
            title = EXCLUDED.title, description = EXCLUDED.description
          RETURNING id, step_number, title
        ` as any[]
      } else if (lid) {
        rows = await tdb.query`
          INSERT INTO learning_path_steps (school_id, path_id, lesson_id, step_number, title, description, is_required, unlock_after_step)
          VALUES (${request.schoolId}::uuid, ${pid}::uuid, ${lid}::uuid, ${sn}, ${title}, ${desc}, ${ir}, ${uas})
          ON CONFLICT (school_id, path_id, step_number) DO UPDATE SET
            lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title
          RETURNING id, step_number, title
        ` as any[]
      } else {
        rows = await tdb.query`
          INSERT INTO learning_path_steps (school_id, path_id, step_number, title, description, is_required, unlock_after_step)
          VALUES (${request.schoolId}::uuid, ${pid}::uuid, ${sn}, ${title}, ${desc}, ${ir}, ${uas})
          ON CONFLICT (school_id, path_id, step_number) DO UPDATE SET
            title = EXCLUDED.title, description = EXCLUDED.description
          RETURNING id, step_number, title
        ` as any[]
      }
      return reply.status(201).send({ step: rows[0] })
    })

  // AUTO-BUILD PATH FROM SCHEME OF WORK
  app.post('/learning-paths/:id/auto-build', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const pid = String(id)
      const tdb = tenantDb(request.schoolId)

      // Get path details
      const pathRows = await tdb.query`
        SELECT * FROM learning_paths WHERE id = ${pid}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!pathRows[0]) return reply.status(404).send({ error: 'Path not found' })
      const path = pathRows[0]

      // Get scheme of work for this subject/term/class
      const scheme = await tdb.query`
        SELECT s.id, s.week_number, s.topic,
               lp.id AS lesson_id, lp.title AS lesson_title
        FROM scheme_of_work s
        LEFT JOIN lesson_plans lp ON lp.week_number = s.week_number
          AND lp.subject_id = s.subject_id
          AND lp.term_id = s.term_id
          AND lp.class_level = s.class_level
          AND lp.school_id = s.school_id
          AND lp.status = 'published'
        WHERE s.school_id = ${request.schoolId}::uuid
        AND s.subject_id = ${path.subject_id}::uuid
        AND s.term_id = ${path.term_id}::uuid
        AND s.class_level = ${path.class_level}
        ORDER BY s.week_number ASC
      ` as any[]

      let built = 0
      for (const item of scheme) {
        const sn = item.week_number
        const title = item.topic
        const scid = item.id
        if (item.lesson_id) {
          const lid = item.lesson_id
          await tdb.query`
            INSERT INTO learning_path_steps (school_id, path_id, lesson_id, scheme_id, step_number, title, is_required, unlock_after_step)
            VALUES (${request.schoolId}::uuid, ${pid}::uuid, ${lid}::uuid, ${scid}::uuid, ${sn}, ${title}, true, ${sn > 1 ? sn - 1 : null})
            ON CONFLICT (school_id, path_id, step_number) DO UPDATE SET
              lesson_id = EXCLUDED.lesson_id, scheme_id = EXCLUDED.scheme_id, title = EXCLUDED.title
          `
        } else {
          await tdb.query`
            INSERT INTO learning_path_steps (school_id, path_id, scheme_id, step_number, title, is_required, unlock_after_step)
            VALUES (${request.schoolId}::uuid, ${pid}::uuid, ${scid}::uuid, ${sn}, ${title}, true, ${sn > 1 ? sn - 1 : null})
            ON CONFLICT (school_id, path_id, step_number) DO UPDATE SET
              scheme_id = EXCLUDED.scheme_id, title = EXCLUDED.title
          `
        }
        built++
      }

      // Publish the path
      await tdb.query`
        UPDATE learning_paths SET is_published = true, updated_at = now()
        WHERE id = ${pid}::uuid AND school_id = ${request.schoolId}::uuid
      `

      return reply.send({ built, published: true })
    })

  // PUBLISH/UNPUBLISH PATH
  app.patch('/learning-paths/:id/publish', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const pid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE learning_paths SET is_published = NOT is_published, updated_at = now()
        WHERE id = ${pid}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ updated: true })
    })

  // DELETE STEP
  app.delete('/learning-paths/steps/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const sid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM learning_path_steps WHERE id = ${sid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // DELETE PATH
  app.delete('/learning-paths/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const pid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM learning_paths WHERE id = ${pid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })
}
