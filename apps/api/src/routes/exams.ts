import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function examRoutes(app: FastifyInstance) {

  // ── List exams (teacher/admin) ────────────────────────────────────────────
  app.get('/exams', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const result = await tdb.query`
        SELECT e.id, e.title, e.subject, e.class_level, e.duration_minutes,
               e.scheduled_at, e.ends_at, e.status, e.total_marks,
               array_length(e.question_ids, 1) AS question_count,
               u.full_name AS created_by_name
        FROM exams e JOIN users u ON u.id = e.created_by
        WHERE e.school_id = ${request.schoolId}::uuid
        ORDER BY e.scheduled_at DESC
      `
      return reply.send({ exams: result })
    })

  // ── Create exam ───────────────────────────────────────────────────────────
  app.post('/exams', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        title: z.string().min(1),
        subject: z.string(),
        classLevel: z.string(),
        classArms: z.array(z.string()).optional(),
        durationMinutes: z.number().int().min(5).max(360),
        totalMarks: z.number().positive(),
        passMark: z.number().positive(),
        questionIds: z.array(z.string().uuid()).min(1),
        scheduledAt: z.string(),
        endsAt: z.string(),
        randomiseQuestions: z.boolean().default(true),
        randomiseOptions: z.boolean().default(true),
        showResultAfter: z.boolean().default(true),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO exams (school_id, created_by, title, subject, class_level, class_arms,
          duration_minutes, total_marks, pass_mark, question_ids, scheduled_at, ends_at,
          randomise_questions, randomise_options, show_result_after)
        VALUES (${request.schoolId}, ${request.user.id}, ${d.title}, ${d.subject},
          ${d.classLevel}, ${d.classArms ?? null}, ${d.durationMinutes}, ${d.totalMarks},
          ${d.passMark}, ${d.questionIds}::uuid[], ${d.scheduledAt}, ${d.endsAt},
          ${d.randomiseQuestions}, ${d.randomiseOptions}, ${d.showResultAfter})
        RETURNING id
      ` as any[]
      return reply.status(201).send({ examId: rows[0].id })
    })

  // ── Available exams for student ───────────────────────────────────────────
  app.get('/exams/available', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const studentClass = request.user.classLevel ?? request.user.class_level ?? 'SS2'
      const result = await tdb.query`
        SELECT e.id, e.title, e.subject, e.duration_minutes,
               e.scheduled_at, e.ends_at, e.status,
               es.status AS session_status
        FROM exams e
        LEFT JOIN exam_sessions es ON es.exam_id = e.id AND es.student_id = ${request.user.id}
        WHERE e.status IN ('scheduled', 'active')
        AND (e.class_level = ${studentClass} OR e.class_level IS NULL)
        ORDER BY e.scheduled_at ASC
      `
      return reply.send({ exams: result })
    })

  // ── Start exam session ────────────────────────────────────────────────────
  app.post('/exams/:examId/start', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const examId = (request.params as any).examId
      const tdb = tenantDb(request.schoolId)

      const examRows = await tdb.query`
        SELECT id, status, duration_minutes, ends_at, question_ids, randomise_questions
        FROM exams WHERE id = ${examId}
      ` as any[]

      const exam = examRows[0]
      if (!exam) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (exam.status !== 'active') return reply.status(400).send({ error: 'EXAM_NOT_ACTIVE', message: 'This exam is not currently active.' })
      // if (new Date() > new Date(exam.ends_at)) return reply.status(410).send({ error: 'TIME_EXPIRED', message: 'This exam window has closed.' })

      const existingRows = await tdb.query`
        SELECT id, status FROM exam_sessions
        WHERE exam_id = ${examId} AND student_id = ${request.user.id}
        ORDER BY created_at DESC LIMIT 1
      ` as any[]

      const existing = existingRows[0]
      if (existing) {
        if (existing.status === 'submitted' || existing.status === 'timed_out') {
          return reply.status(400).send({ error: 'ALREADY_SUBMITTED', message: 'You have already completed this exam.' })
        }
        if (existing.status === 'in_progress') {
          return reply.send({ sessionId: existing.id, resumed: true })
        }
      }

      const questionOrder = exam.randomise_questions
        ? [...exam.question_ids].sort(() => Math.random() - 0.5)
        : exam.question_ids

      const serverDeadline = new Date(Date.now() + exam.duration_minutes * 60 * 1000)

      const insertRows = await tdb.query`
        INSERT INTO exam_sessions (school_id, exam_id, student_id, status, question_order, started_at, server_deadline)
        VALUES (${request.schoolId}, ${examId}, ${request.user.id}, 'in_progress',
                ${questionOrder}::uuid[], now(), ${serverDeadline.toISOString()})
        ON CONFLICT (exam_id, student_id) DO UPDATE
          SET status = 'in_progress',
              question_order = EXCLUDED.question_order,
              started_at = EXCLUDED.started_at,
              server_deadline = EXCLUDED.server_deadline,
              updated_at = now()
        RETURNING id
      ` as any[]

      return reply.status(201).send({ sessionId: insertRows[0].id, resumed: false })
    })

  // ── Get exam session + questions ──────────────────────────────────────────
  app.get('/exams/:examId/session', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const examId = (request.params as any).examId
      const tdb = tenantDb(request.schoolId)

      const sessionRows = await tdb.query`
        SELECT id, status, question_order, answers, started_at, server_deadline
        FROM exam_sessions
        WHERE exam_id = ${examId} AND student_id = ${request.user.id}
        ORDER BY created_at DESC LIMIT 1
      ` as any[]

      const session = sessionRows[0]
      if (!session) return reply.status(404).send({ error: 'SESSION_NOT_FOUND' })

      // if (new Date() > new Date(session.server_deadline) && session.status === 'in_progress') {
      //   await tdb.query`UPDATE exam_sessions SET status = 'timed_out', submitted_at = now() WHERE id = ${session.id}`
      //   return reply.status(410).send({ error: 'TIME_EXPIRED', message: 'Your exam time has expired.' })
      // }

      const questionRows = await tdb.query`
        SELECT id, question_text, image_url, options, marks, type
        FROM questions WHERE id = ANY(${session.question_order}::uuid[])
      ` as any[]

      const ordered = session.question_order
        .map((qId: string) => questionRows.find((q: any) => q.id === qId))
        .filter(Boolean)

      return reply.send({
        session: {
          id: session.id,
          status: session.status,
          serverDeadline: session.server_deadline,
          server_deadline: session.server_deadline,
          answers: session.answers,
        },
        questions: ordered,
        totalQuestions: ordered.length,
      })
    })

  // ── Save answers ──────────────────────────────────────────────────────────
  app.patch('/sessions/:sessionId/answers', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const sessionId = (request.params as any).sessionId
      const schema = z.object({ answers: z.record(z.string()) })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const tdb = tenantDb(request.schoolId)
      const sessionRows = await tdb.query`
        SELECT id, status, server_deadline FROM exam_sessions
        WHERE id = ${sessionId} AND student_id = ${request.user.id}
      ` as any[]

      const session = sessionRows[0]
      if (!session) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (session.status !== 'in_progress') return reply.status(400).send({ error: 'SESSION_NOT_ACTIVE' })

      await tdb.query`
        UPDATE exam_sessions
        SET answers = answers || ${JSON.stringify(body.data.answers)}::jsonb,
            updated_at = now()
        WHERE id = ${sessionId}
      `
      return reply.send({ saved: true })
    })

  // ── Submit exam ───────────────────────────────────────────────────────────
  app.post('/sessions/:sessionId/submit', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const sessionId = (request.params as any).sessionId
      const tdb = tenantDb(request.schoolId)

      const sessionRows = await tdb.query`
        SELECT id, exam_id, status, answers, question_order
        FROM exam_sessions
        WHERE student_id = ${request.user.id}
        AND status = 'in_progress'
        ORDER BY created_at DESC LIMIT 1
      ` as any[]

      const session = sessionRows[0]
      if (!session) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (session.status !== 'in_progress') return reply.status(400).send({ error: 'ALREADY_SUBMITTED' })

      const questionRows = await tdb.query`
        SELECT id, correct_answer, marks FROM questions
        WHERE id = ANY(${session.question_order}::uuid[])
      ` as any[]

      const examRows = await tdb.query`
        SELECT total_marks, pass_mark, show_result_after FROM exams
        WHERE id = ${session.exam_id}
      ` as any[]

      const exam = examRows[0]

      // Merge answers — handles array of snapshots or single object
      let finalAnswers: Record<string, string> = {}
      if (Array.isArray(session.answers)) {
        for (const snapshot of session.answers) {
          const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : (snapshot ?? {})
          Object.assign(finalAnswers, parsed)
        }
      } else if (typeof session.answers === 'string') {
        finalAnswers = JSON.parse(session.answers)
      } else {
        finalAnswers = session.answers ?? {}
      }

      let score = 0
      for (const q of questionRows) {
        const studentAnswer = (finalAnswers[q.id] ?? '').trim().toUpperCase()
        const correctAnswer = (q.correct_answer ?? '').trim().toUpperCase()
        if (studentAnswer && studentAnswer === correctAnswer) {
          score += Number(q.marks)
        }
      }

      const percentage = exam.total_marks > 0 ? (score / exam.total_marks) * 100 : 0
      const passed = percentage >= Number(exam.pass_mark)

      await tdb.query`
        UPDATE exam_sessions
        SET status = 'submitted',
            submitted_at = now(),
            score = ${score},
            percentage = ${percentage},
            passed = ${passed}
        WHERE id = ${session.id}
      `

      const result = exam.show_result_after
        ? { score, percentage: Math.round(percentage * 100) / 100, passed, totalMarks: exam.total_marks }
        : null

      return reply.send({ submitted: true, result })
    })

  // ── Exam results (teacher/admin) ──────────────────────────────────────────
  app.get('/exams/:examId/results', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const examId = (request.params as any).examId
      const tdb = tenantDb(request.schoolId)

      const results = await tdb.query`
        SELECT u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm,
               es.score, es.percentage, es.passed, es.status, es.submitted_at
        FROM exam_sessions es JOIN users u ON u.id = es.student_id
        WHERE es.exam_id = ${examId}
        ORDER BY es.percentage DESC NULLS LAST
      ` as any[]

      const stats = {
        total: results.length,
        submitted: results.filter((r: any) => r.status === 'submitted').length,
        passed: results.filter((r: any) => r.passed).length,
        avgScore: results.length
          ? Math.round(results.reduce((s: number, r: any) => s + (r.percentage ?? 0), 0) / results.length * 10) / 10
          : 0,
      }

      return reply.send({ results, stats })
    })
}
