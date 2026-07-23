import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function lessonRoutes(app: FastifyInstance) {

  // ── LESSON PLANS ──────────────────────────────────────────────────────────

  // List lesson plans
  app.get('/lessons', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { classLevel, subjectId, termId, status, teacherId } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const cl = classLevel ? String(classLevel) : null
      const sid = subjectId ? String(subjectId) : null
      const tid = termId ? String(termId) : null
      const st = status ? String(status) : null
      const teaid = teacherId ? String(teacherId) : null

      let rows: any[]
      if (cl && sid && tid) {
        rows = await tdb.query`
          SELECT lp.id, lp.title, lp.class_level, lp.class_arm, lp.week_number,
                 lp.status, lp.estimated_duration_mins, lp.published_at, lp.created_at,
                 u.full_name AS teacher_name,
                 cs.name AS subject_name,
                 COUNT(DISTINCT lr.id) AS resource_count,
                 COUNT(DISTINCT la.id) AS assignment_count,
                 COUNT(DISTINCT lq.id) AS quiz_count
          FROM lesson_plans lp
          LEFT JOIN users u ON u.id = lp.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
          LEFT JOIN lesson_resources lr ON lr.lesson_id = lp.id
          LEFT JOIN lesson_assignments la ON la.lesson_id = lp.id
          LEFT JOIN lesson_quizzes lq ON lq.lesson_id = lp.id
          WHERE lp.school_id = ${request.schoolId}::uuid
          AND lp.class_level = ${cl}
          AND lp.subject_id = ${sid}::uuid
          AND lp.term_id = ${tid}::uuid
          GROUP BY lp.id, u.full_name, cs.name
          ORDER BY lp.week_number ASC, lp.created_at DESC
        ` as any[]
      } else if (cl) {
        rows = await tdb.query`
          SELECT lp.id, lp.title, lp.class_level, lp.class_arm, lp.week_number,
                 lp.status, lp.estimated_duration_mins, lp.published_at, lp.created_at,
                 u.full_name AS teacher_name,
                 cs.name AS subject_name,
                 COUNT(DISTINCT lr.id) AS resource_count,
                 COUNT(DISTINCT la.id) AS assignment_count,
                 COUNT(DISTINCT lq.id) AS quiz_count
          FROM lesson_plans lp
          LEFT JOIN users u ON u.id = lp.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
          LEFT JOIN lesson_resources lr ON lr.lesson_id = lp.id
          LEFT JOIN lesson_assignments la ON la.lesson_id = lp.id
          LEFT JOIN lesson_quizzes lq ON lq.lesson_id = lp.id
          WHERE lp.school_id = ${request.schoolId}::uuid
          AND lp.class_level = ${cl}
          GROUP BY lp.id, u.full_name, cs.name
          ORDER BY lp.week_number ASC, lp.created_at DESC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT lp.id, lp.title, lp.class_level, lp.class_arm, lp.week_number,
                 lp.status, lp.estimated_duration_mins, lp.published_at, lp.created_at,
                 u.full_name AS teacher_name,
                 cs.name AS subject_name,
                 COUNT(DISTINCT lr.id) AS resource_count,
                 COUNT(DISTINCT la.id) AS assignment_count,
                 COUNT(DISTINCT lq.id) AS quiz_count
          FROM lesson_plans lp
          LEFT JOIN users u ON u.id = lp.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
          LEFT JOIN lesson_resources lr ON lr.lesson_id = lp.id
          LEFT JOIN lesson_assignments la ON la.lesson_id = lp.id
          LEFT JOIN lesson_quizzes lq ON lq.lesson_id = lp.id
          WHERE lp.school_id = ${request.schoolId}::uuid
          GROUP BY lp.id, u.full_name, cs.name
          ORDER BY lp.created_at DESC
        ` as any[]
      }
      return reply.send({ lessons: rows })
    })

  // Get single lesson plan with all content
  app.get('/lessons/:id', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const lid = String(id)
      const tdb = tenantDb(request.schoolId)

      const lessonRows = await tdb.query`
        SELECT lp.*, u.full_name AS teacher_name, cs.name AS subject_name,
               s.name AS scheme_topic, t.name AS term_name
        FROM lesson_plans lp
        LEFT JOIN users u ON u.id = lp.teacher_id
        LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
        LEFT JOIN scheme_of_work s ON s.id = lp.scheme_id
        LEFT JOIN terms t ON t.id = lp.term_id
        WHERE lp.id = ${lid}::uuid AND lp.school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!lessonRows[0]) return reply.status(404).send({ error: 'Lesson not found' })

      const resources = await tdb.query`
        SELECT * FROM lesson_resources WHERE lesson_id = ${lid}::uuid
        ORDER BY sort_order ASC, created_at ASC
      ` as any[]

      const quizzes = await tdb.query`
        SELECT lq.*, e.title AS exam_title, e.duration_minutes
        FROM lesson_quizzes lq
        LEFT JOIN exams e ON e.id = lq.exam_id
        WHERE lq.lesson_id = ${lid}::uuid
        ORDER BY lq.sort_order ASC
      ` as any[]

      const assignments = await tdb.query`
        SELECT la.*,
               COUNT(asub.id) AS submission_count,
               COUNT(asub.id) FILTER (WHERE asub.status = 'graded') AS graded_count
        FROM lesson_assignments la
        LEFT JOIN assignment_submissions asub ON asub.assignment_id = la.id
        WHERE la.lesson_id = ${lid}::uuid
        GROUP BY la.id
        ORDER BY la.sort_order ASC
      ` as any[]

      const completions = await tdb.query`
        SELECT COUNT(*) AS total_students,
               COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
               COUNT(*) FILTER (WHERE started_at IS NOT NULL AND completed_at IS NULL) AS in_progress,
               ROUND(AVG(progress_pct), 1) AS avg_progress
        FROM lesson_completions
        WHERE lesson_id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]

      return reply.send({
        lesson: lessonRows[0],
        resources,
        quizzes,
        assignments,
        completions: completions[0],
      })
    })

  // Create lesson plan
  app.post('/lessons', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        title: z.string().min(1),
        classLevel: z.string().min(1),
        classArm: z.string().optional(),
        subjectId: z.string().uuid().optional(),
        schemeId: z.string().uuid().optional(),
        termId: z.string().uuid().optional(),
        weekNumber: z.number().int().min(1).max(15).optional(),
        objectives: z.array(z.string()).optional(),
        introduction: z.string().optional(),
        mainContent: z.string().optional(),
        conclusion: z.string().optional(),
        estimatedDurationMins: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const title = d.title
      const cl = d.classLevel
      const ca = d.classArm ?? null
      const sid = d.subjectId ?? null
      const scid = d.schemeId ?? null
      const tid = d.termId ?? null
      const wn = d.weekNumber ?? null
      const obj = d.objectives ?? []
      const intro = d.introduction ?? null
      const mc = d.mainContent ?? null
      const conc = d.conclusion ?? null
      const dur = d.estimatedDurationMins ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (sid && tid) {
        rows = await tdb.query`
          INSERT INTO lesson_plans (school_id, teacher_id, title, class_level, class_arm, subject_id, term_id, week_number, objectives, introduction, main_content, conclusion, estimated_duration_mins, status)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${title}, ${cl}, ${ca}, ${sid}::uuid, ${tid}::uuid, ${wn}, ${obj}, ${intro}, ${mc}, ${conc}, ${dur}, 'draft')
          RETURNING id, title, status, created_at
        ` as any[]
      } else if (sid) {
        rows = await tdb.query`
          INSERT INTO lesson_plans (school_id, teacher_id, title, class_level, class_arm, subject_id, week_number, objectives, introduction, main_content, conclusion, estimated_duration_mins, status)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${title}, ${cl}, ${ca}, ${sid}::uuid, ${wn}, ${obj}, ${intro}, ${mc}, ${conc}, ${dur}, 'draft')
          RETURNING id, title, status, created_at
        ` as any[]
      } else if (tid) {
        rows = await tdb.query`
          INSERT INTO lesson_plans (school_id, teacher_id, title, class_level, class_arm, term_id, week_number, objectives, introduction, main_content, conclusion, estimated_duration_mins, status)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${title}, ${cl}, ${ca}, ${tid}::uuid, ${wn}, ${obj}, ${intro}, ${mc}, ${conc}, ${dur}, 'draft')
          RETURNING id, title, status, created_at
        ` as any[]
      } else {
        rows = await tdb.query`
          INSERT INTO lesson_plans (school_id, teacher_id, title, class_level, class_arm, week_number, objectives, introduction, main_content, conclusion, estimated_duration_mins, status)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${title}, ${cl}, ${ca}, ${wn}, ${obj}, ${intro}, ${mc}, ${conc}, ${dur}, 'draft')
          RETURNING id, title, status, created_at
        ` as any[]
      }
      return reply.status(201).send({ lesson: rows[0] })
    })

  // Update lesson plan
  app.patch('/lessons/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        title: z.string().optional(),
        objectives: z.array(z.string()).optional(),
        introduction: z.string().optional(),
        mainContent: z.string().optional(),
        conclusion: z.string().optional(),
        estimatedDurationMins: z.number().optional(),
        status: z.enum(['draft','published','archived']).optional(),
        weekNumber: z.number().optional(),
        classArm: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const lid = String(id)
      const tdb = tenantDb(request.schoolId)

      if (d.title !== undefined) {
        const val = d.title
        await tdb.query`UPDATE lesson_plans SET title = ${val}, updated_at = now() WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.objectives !== undefined) {
        const val = d.objectives
        await tdb.query`UPDATE lesson_plans SET objectives = ${val}, updated_at = now() WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.introduction !== undefined) {
        const val = d.introduction
        await tdb.query`UPDATE lesson_plans SET introduction = ${val}, updated_at = now() WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.mainContent !== undefined) {
        const val = d.mainContent
        await tdb.query`UPDATE lesson_plans SET main_content = ${val}, updated_at = now() WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.conclusion !== undefined) {
        const val = d.conclusion
        await tdb.query`UPDATE lesson_plans SET conclusion = ${val}, updated_at = now() WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.status !== undefined) {
        const val = d.status
        const pub = val === 'published' ? 'now()' : null
        if (val === 'published') {
          await tdb.query`UPDATE lesson_plans SET status = ${val}, published_at = now(), updated_at = now() WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
        } else {
          await tdb.query`UPDATE lesson_plans SET status = ${val}, updated_at = now() WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
        }
      }
      return reply.send({ updated: true })
    })

  // Delete lesson plan
  app.delete('/lessons/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const lid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM lesson_plans WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── RESOURCES ─────────────────────────────────────────────────────────────

  app.post('/lessons/:id/resources', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        resourceType: z.enum(['file','video_link','video_upload','link','image']),
        title: z.string().min(1),
        description: z.string().optional(),
        url: z.string().min(1),
        fileSizeBytes: z.number().optional(),
        durationMins: z.number().optional(),
        sortOrder: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const lid = String(id)
      const rt = d.resourceType
      const ti = d.title
      const desc = d.description ?? null
      const url = d.url
      const fsb = d.fileSizeBytes ?? null
      const dm = d.durationMins ?? null
      const so = d.sortOrder ?? 0
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO lesson_resources (school_id, lesson_id, resource_type, title, description, url, file_size_bytes, duration_mins, sort_order)
        VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${rt}, ${ti}, ${desc}, ${url}, ${fsb}, ${dm}, ${so})
        RETURNING id, resource_type, title, url, created_at
      ` as any[]
      return reply.status(201).send({ resource: rows[0] })
    })

  app.delete('/lessons/:id/resources/:resourceId', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { resourceId } = request.params as any
      const rid = String(resourceId)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM lesson_resources WHERE id = ${rid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── QUIZZES ───────────────────────────────────────────────────────────────

  app.post('/lessons/:id/quizzes', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        examId: z.string().uuid().optional(),
        title: z.string().min(1),
        instructions: z.string().optional(),
        isRequired: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const lid = String(id)
      const eid = d.examId ?? null
      const ti = d.title
      const ins = d.instructions ?? null
      const ir = d.isRequired ?? false
      const so = d.sortOrder ?? 0
      const tdb = tenantDb(request.schoolId)
      let rows: any[]
      if (eid) {
        rows = await tdb.query`
          INSERT INTO lesson_quizzes (school_id, lesson_id, exam_id, title, instructions, is_required, sort_order)
          VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${eid}::uuid, ${ti}, ${ins}, ${ir}, ${so})
          RETURNING id, title, is_required
        ` as any[]
      } else {
        rows = await tdb.query`
          INSERT INTO lesson_quizzes (school_id, lesson_id, title, instructions, is_required, sort_order)
          VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${ti}, ${ins}, ${ir}, ${so})
          RETURNING id, title, is_required
        ` as any[]
      }
      return reply.status(201).send({ quiz: rows[0] })
    })

  app.delete('/lessons/:id/quizzes/:quizId', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { quizId } = request.params as any
      const qid = String(quizId)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM lesson_quizzes WHERE id = ${qid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── ASSIGNMENTS ───────────────────────────────────────────────────────────

  app.post('/lessons/:id/assignments', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        title: z.string().min(1),
        instructions: z.string().min(1),
        dueDate: z.string().optional(),
        maxScore: z.number().optional(),
        submissionType: z.enum(['text','file','both']).optional(),
        isRequired: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const lid = String(id)
      const ti = d.title
      const ins = d.instructions
      const dd = d.dueDate ?? null
      const ms = d.maxScore ?? 100
      const st = d.submissionType ?? 'both'
      const ir = d.isRequired ?? true
      const so = d.sortOrder ?? 0
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO lesson_assignments (school_id, lesson_id, title, instructions, due_date, max_score, submission_type, is_required, sort_order)
        VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${ti}, ${ins}, ${dd}::timestamptz, ${ms}, ${st}, ${ir}, ${so})
        RETURNING id, title, due_date, max_score, submission_type
      ` as any[]
      return reply.status(201).send({ assignment: rows[0] })
    })

  app.delete('/lessons/:id/assignments/:assignmentId', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { assignmentId } = request.params as any
      const aid = String(assignmentId)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM lesson_assignments WHERE id = ${aid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── ASSIGNMENT SUBMISSIONS ────────────────────────────────────────────────

  // Student submits assignment
  app.post('/lessons/assignments/:assignmentId/submit', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { assignmentId } = request.params as any
      const schema = z.object({
        textResponse: z.string().optional(),
        fileUrl: z.string().optional(),
        fileName: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const aid = String(assignmentId)
      const tr = d.textResponse ?? null
      const fu = d.fileUrl ?? null
      const fn = d.fileName ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        INSERT INTO assignment_submissions (school_id, assignment_id, student_id, text_response, file_url, file_name)
        VALUES (${request.schoolId}::uuid, ${aid}::uuid, ${uid}::uuid, ${tr}, ${fu}, ${fn})
        ON CONFLICT (school_id, assignment_id, student_id) DO UPDATE SET
          text_response = EXCLUDED.text_response,
          file_url = EXCLUDED.file_url,
          file_name = EXCLUDED.file_name,
          submitted_at = now(),
          status = 'submitted'
      `
      return reply.send({ submitted: true })
    })

  // Teacher grades submission
  app.patch('/lessons/submissions/:submissionId/grade', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { submissionId } = request.params as any
      const schema = z.object({
        score: z.number().min(0),
        feedback: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const subid = String(submissionId)
      const score = d.score
      const feedback = d.feedback ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE assignment_submissions
        SET score = ${score}, feedback = ${feedback},
            graded_by = ${uid}::uuid, graded_at = now(), status = 'graded'
        WHERE id = ${subid}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ graded: true })
    })

  // Get submissions for an assignment
  app.get('/lessons/assignments/:assignmentId/submissions', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { assignmentId } = request.params as any
      const aid = String(assignmentId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT asub.*, u.full_name AS student_name, u.class_level, u.class_arm
        FROM assignment_submissions asub
        JOIN users u ON u.id = asub.student_id
        WHERE asub.assignment_id = ${aid}::uuid AND asub.school_id = ${request.schoolId}::uuid
        ORDER BY asub.submitted_at DESC
      ` as any[]
      return reply.send({ submissions: rows })
    })

  // ── LESSON COMPLETION ─────────────────────────────────────────────────────

  // Student marks lesson as started/progressed
  app.post('/lessons/:id/progress', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        progressPct: z.number().min(0).max(100),
        resourcesViewed: z.number().optional(),
        quizCompleted: z.boolean().optional(),
        assignmentSubmitted: z.boolean().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const lid = String(id)
      const pp = d.progressPct
      const rv = d.resourcesViewed ?? 0
      const qc = d.quizCompleted ?? false
      const as2 = d.assignmentSubmitted ?? false
      const uid = request.user.id
      const completedAt = pp >= 100 ? 'now()' : null
      const tdb = tenantDb(request.schoolId)
      if (pp >= 100) {
        await tdb.query`
          INSERT INTO lesson_completions (school_id, lesson_id, student_id, progress_pct, resources_viewed, quiz_completed, assignment_submitted, completed_at)
          VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${uid}::uuid, ${pp}, ${rv}, ${qc}, ${as2}, now())
          ON CONFLICT (school_id, lesson_id, student_id) DO UPDATE SET
            progress_pct = EXCLUDED.progress_pct,
            resources_viewed = EXCLUDED.resources_viewed,
            quiz_completed = EXCLUDED.quiz_completed,
            assignment_submitted = EXCLUDED.assignment_submitted,
            completed_at = now()
        `
      } else {
        await tdb.query`
          INSERT INTO lesson_completions (school_id, lesson_id, student_id, progress_pct, resources_viewed, quiz_completed, assignment_submitted)
          VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${uid}::uuid, ${pp}, ${rv}, ${qc}, ${as2})
          ON CONFLICT (school_id, lesson_id, student_id) DO UPDATE SET
            progress_pct = EXCLUDED.progress_pct,
            resources_viewed = EXCLUDED.resources_viewed,
            quiz_completed = EXCLUDED.quiz_completed,
            assignment_submitted = EXCLUDED.assignment_submitted
        `
      }
      return reply.send({ saved: true })
    })

  // Get completion stats for a lesson (teacher view)
  app.get('/lessons/:id/completions', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const lid = String(id)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT lc.*, u.full_name AS student_name, u.class_level, u.class_arm, u.admission_no
        FROM lesson_completions lc
        JOIN users u ON u.id = lc.student_id
        WHERE lc.lesson_id = ${lid}::uuid AND lc.school_id = ${request.schoolId}::uuid
        ORDER BY lc.progress_pct DESC
      ` as any[]
      return reply.send({ completions: rows })
    })
}
