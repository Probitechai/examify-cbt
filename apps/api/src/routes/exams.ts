import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { asJson, mergeAnswers } from '../lib/json'
import { markPaper, type ManualMark } from '../lib/grading'
import { shuffleOptions, withLabels } from '../lib/shuffle'
import { authenticate, requireRole } from '../middleware/auth'
import { sendEmail, sendBulkEmails } from '../lib/email'
import { resultReadyEmail, examReminderEmail } from '../emails/templates'

async function isTeacherAssignedToSubject(tdb: any, schoolId: string, teacherId: string, classLevel: string, subject: string): Promise<{ blanket: boolean; arms: string[] }> {
  const rows = await tdb.query`
    SELECT class_arm FROM teacher_subject_assignments
    WHERE school_id = ${schoolId}::uuid AND teacher_id = ${teacherId}::uuid
    AND class_level = ${classLevel} AND subject = ${subject}
  ` as any[]
  return {
    blanket: rows.some((r: any) => !r.class_arm),
    arms: rows.map((r: any) => r.class_arm).filter(Boolean) as string[],
  }
}

async function isExamOwnedByTeacher(tdb: any, schoolId: string, teacherId: string, examId: string): Promise<boolean> {
  const rows = await tdb.query`
    SELECT 1 FROM exams WHERE id = ${examId}::uuid AND school_id = ${schoolId}::uuid AND created_by = ${teacherId}::uuid
  ` as any[]
  return rows.length > 0
}

// ── Leaving the exam screen ──────────────────────────────────────────────────
// Each time a student leaves (another tab or app, or minimised) is stored
// with server times. A time away still open when the exam ends is closed then.
const MAX_FOCUS_EVENTS = 500

async function closeAway(tdb: any, sessionId: string) {
  const rows = await tdb.query`
    UPDATE exam_focus_events
    SET returned_at = now(),
        seconds_away = LEAST(GREATEST(0, EXTRACT(EPOCH FROM now() - left_at))::int, 86400)
    WHERE session_id = ${sessionId}::uuid AND returned_at IS NULL
    RETURNING seconds_away
  ` as any[]
  const add = rows.reduce((t: number, r: any) => t + Number(r.seconds_away ?? 0), 0)
  if (add) await tdb.query`UPDATE exam_sessions SET time_away_seconds = time_away_seconds + ${add} WHERE id = ${sessionId}::uuid`
}

// Result-ready email (fire and forget)
function sendResultEmail(tdb: any, schoolName: string, examId: string, studentId: string,
  score: number, totalMarks: number, percentage: number, passed: boolean) {
  ;(async () => {
    try {
      const [examInfo] = await tdb.query`SELECT title, subject FROM exams WHERE id = ${examId}::uuid` as any[]
      const [userInfo] = await tdb.query`SELECT email, full_name FROM users WHERE id = ${studentId}::uuid` as any[]
      if (!examInfo || !userInfo) return
      const { subject, html } = resultReadyEmail({
        schoolName, fullName: userInfo.full_name, examTitle: examInfo.title, subject: examInfo.subject,
        score, totalMarks, percentage, passed, loginUrl: 'https://examify-cbt-web.vercel.app/login',
      })
      await sendEmail({ to: userInfo.email, subject, html })
    } catch (err: any) {
      console.error('Failed to send result email:', err.message)
    }
  })()
}

export async function examRoutes(app: FastifyInstance) {

  // ── List exams (teacher/admin) ────────────────────────────────────────────
  app.get('/exams', { preHandler: [authenticate, requireRole('school_admin', 'teacher', 'proprietor')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      let result: any[]
      if (request.user.role === 'teacher') {
        result = await tdb.query`
          SELECT e.id, e.title, e.subject, e.class_level, e.duration_minutes,
                 e.scheduled_at, e.ends_at, e.status, e.total_marks,
                 array_length(e.question_ids, 1) AS question_count,
                 u.full_name AS created_by_name
          FROM exams e
          JOIN users u ON u.id = e.created_by
          WHERE e.school_id = ${request.schoolId}::uuid AND e.created_by = ${request.user.id}::uuid
          ORDER BY e.scheduled_at DESC
        ` as any[]
      } else {
        result = await tdb.query`
          SELECT e.id, e.title, e.subject, e.class_level, e.duration_minutes,
                 e.scheduled_at, e.ends_at, e.status, e.total_marks,
                 array_length(e.question_ids, 1) AS question_count,
                 u.full_name AS created_by_name
          FROM exams e
          JOIN users u ON u.id = e.created_by
          WHERE e.school_id = ${request.schoolId}::uuid
          ORDER BY e.scheduled_at DESC
        ` as any[]
      }
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
      // Normalize "all" sentinel value to null — null means unrestricted (all class arms)
      const normalizedClassArms = (d.classArms && d.classArms.length === 1 && d.classArms[0] === 'all')
        ? null
        : (d.classArms ?? null)
      const tdb = tenantDb(request.schoolId)

      if (request.user.role === 'teacher') {
        const scope = await isTeacherAssignedToSubject(tdb, request.schoolId, request.user.id, d.classLevel, d.subject)
        if (!scope.blanket && scope.arms.length === 0) {
          return reply.status(403).send({ error: 'NOT_ASSIGNED', message: 'You are not assigned to teach this subject for this class.' })
        }
        if (!scope.blanket) {
          const requestedArms = normalizedClassArms ?? []
          const disallowed = requestedArms.filter((a: string) => !scope.arms.includes(a))
          if (normalizedClassArms === null || disallowed.length > 0) {
            return reply.status(403).send({ error: 'ARM_NOT_ASSIGNED', message: 'You can only create this exam for the specific arm(s) you are assigned to.' })
          }
        }
      }
      const rows = await tdb.query`
        INSERT INTO exams (school_id, created_by, title, subject, class_level, class_arms,
          duration_minutes, total_marks, pass_mark, question_ids, scheduled_at, ends_at,
          randomise_questions, randomise_options, show_result_after, status)
        VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${d.title}, ${d.subject},
          ${d.classLevel}, ${normalizedClassArms}, ${d.durationMinutes}, ${d.totalMarks},
          ${d.passMark}, ${d.questionIds}::uuid[], ${d.scheduledAt}, ${d.endsAt},
          ${d.randomiseQuestions}, ${d.randomiseOptions}, ${d.showResultAfter}, 'active')
        RETURNING id
      ` as any[]
      return reply.status(201).send({ examId: rows[0].id })
    })

  // ── Delete exam ───────────────────────────────────────────────────────────
  app.delete('/exams/:examId', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const examId = (request.params as any).examId
      const tdb = tenantDb(request.schoolId)
      if (request.user.role === 'teacher') {
        const owns = await isExamOwnedByTeacher(tdb, request.schoolId, request.user.id, examId)
        if (!owns) return reply.status(403).send({ error: 'NOT_OWNER', message: 'You can only cancel your own exams.' })
      }
      await tdb.query`
        UPDATE exams SET status = 'cancelled'
        WHERE id = ${examId}::uuid
        AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })

  // ── Available exams for student ───────────────────────────────────────────
  app.get('/exams/available', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const studentClass = request.user.classLevel ?? request.user.class_level ?? 'SS2'
      const result = await tdb.query`
        SELECT e.id, e.title, e.subject, e.duration_minutes,
               e.scheduled_at, e.ends_at, e.status,
               es.status AS session_status,
               es.passed, es.score, es.percentage
        FROM exams e
        LEFT JOIN exam_sessions es ON es.exam_id = e.id AND es.student_id = ${request.user.id}::uuid
        WHERE e.school_id = ${request.schoolId}::uuid
        AND e.status IN ('scheduled', 'active')
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
        FROM exams
        WHERE id = ${examId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const exam = examRows[0]
      if (!exam) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (exam.status !== 'active') return reply.status(400).send({ error: 'EXAM_NOT_ACTIVE', message: 'This exam is not currently active.' })
      if (new Date() > new Date(exam.ends_at)) return reply.status(410).send({ error: 'TIME_EXPIRED', message: 'This exam window has closed.' })

      const existingRows = await tdb.query`
        SELECT id, status FROM exam_sessions
        WHERE exam_id = ${examId}::uuid AND student_id = ${request.user.id}::uuid
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
        VALUES (${request.schoolId}::uuid, ${examId}::uuid, ${request.user.id}::uuid, 'in_progress',
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
        SELECT id, status, question_order, answers, started_at, server_deadline, tab_switches, time_away_seconds,
               marking_status, manual_marks
        FROM exam_sessions
        WHERE exam_id = ${examId}::uuid
        AND student_id = ${request.user.id}::uuid
        ORDER BY created_at DESC LIMIT 1
      ` as any[]

      const session = sessionRows[0]
      if (!session) return reply.status(404).send({ error: 'SESSION_NOT_FOUND' })

      if (new Date() > new Date(session.server_deadline) && session.status === 'in_progress') {
        await tdb.query`UPDATE exam_sessions SET status = 'timed_out', submitted_at = now() WHERE id = ${session.id}::uuid`
        await closeAway(tdb, session.id)
        return reply.status(410).send({ error: 'TIME_EXPIRED', message: 'Your exam time has expired.' })
      }

      const questionRows = await tdb.query`
        SELECT id, question_text, image_url, options, marks, type, correct_answer
        FROM questions
        WHERE id = ANY(${session.question_order}::uuid[])
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const isFinished = session.status === 'submitted' || session.status === 'timed_out'
      const [examRow] = await tdb.query`SELECT randomise_options FROM exams WHERE id = ${examId}::uuid` as any[]
      const shuffle = !!examRow?.randomise_options

      // MCQ options in this student's order when the exam randomises them (True/False stays True, False)
      const ordered = session.question_order
        .map((qId: string) => questionRows.find((q: any) => q.id === qId))
        .filter(Boolean)
        .map((q: any) => {
          const opts = asJson<any[] | null>(q.options, null)
          if (!Array.isArray(opts) || !opts.length || q.type !== 'mcq') return { ...q, options: opts }
          return { ...q, options: shuffle ? shuffleOptions(opts, `${session.id}:${q.id}`) : withLabels(opts) }
        })
        .map((q: any) => isFinished ? q : { ...q, correct_answer: undefined })

      return reply.send({
        session: {
          id: session.id,
          status: session.status,
          serverDeadline: session.server_deadline,
          server_deadline: session.server_deadline,
          answers: mergeAnswers(session.answers),
          tabSwitches: Number(session.tab_switches ?? 0),
          markingStatus: isFinished ? session.marking_status : undefined,
          essayMarks: isFinished && session.marking_status === 'complete'
            ? Object.fromEntries(Object.entries(asJson<Record<string, ManualMark>>(session.manual_marks, {}))
                .map(([k, v]) => [k, { marks: v.marks, comment: v.comment ?? null }]))
            : undefined,
          timeAwaySeconds: Number(session.time_away_seconds ?? 0),
        },
        questions: ordered,
        totalQuestions: ordered.length,
      })
    })

  // ── Save answers ──────────────────────────────────────────────────────────
  app.patch('/sessions/:sessionId/answers', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const sessionId = (request.params as any).sessionId
      const schema = z.object({ answers: z.record(z.string().max(20000)), tabSwitches: z.number().int().min(0).max(10000).optional() })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const tdb = tenantDb(request.schoolId)
      const sessionRows = await tdb.query`
        SELECT id, status, server_deadline, answers FROM exam_sessions
        WHERE id = ${sessionId}::uuid
        AND student_id = ${request.user.id}::uuid
      ` as any[]

      const session = sessionRows[0]
      if (!session) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (session.status !== 'in_progress') return reply.status(400).send({ error: 'SESSION_NOT_ACTIVE' })
      if (new Date() > new Date(session.server_deadline)) return reply.status(410).send({ error: 'TIME_EXPIRED' })

      const current = session.answers
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        await tdb.query`
          UPDATE exam_sessions
          SET answers = answers || ${db().json(body.data.answers)},
              updated_at = now()
          WHERE id = ${sessionId}::uuid
        `
      } else {
        // Session saved by the old code (array of snapshots): rewrite it as one object
        const merged = { ...mergeAnswers(current), ...body.data.answers }
        await tdb.query`
          UPDATE exam_sessions
          SET answers = ${db().json(merged)},
              updated_at = now()
          WHERE id = ${sessionId}::uuid
        `
      }
      if (body.data.tabSwitches) {
        await tdb.query`UPDATE exam_sessions SET tab_switches = GREATEST(tab_switches, ${body.data.tabSwitches}) WHERE id = ${sessionId}::uuid`
      }
      return reply.send({ saved: true })
    })

  // ── Student left or came back to the exam screen ─────────────────────────
  app.post('/sessions/:sessionId/focus', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const sessionId = (request.params as any).sessionId
      const body = z.object({
        event: z.enum(['left', 'returned']),
        clientCount: z.number().int().min(0).max(10000).optional(),
      }).safeParse(request.body)
      if (!body.success || !z.string().uuid().safeParse(sessionId).success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const tdb = tenantDb(request.schoolId)
      const [session] = await tdb.query`
        SELECT id, status FROM exam_sessions
        WHERE id = ${sessionId}::uuid AND student_id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!session) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (session.status !== 'in_progress') return reply.status(400).send({ error: 'SESSION_NOT_ACTIVE' })

      if (body.data.event === 'left') {
        const [open] = await tdb.query`SELECT 1 FROM exam_focus_events WHERE session_id = ${sessionId}::uuid AND returned_at IS NULL LIMIT 1` as any[]
        if (!open) {
          const [{ n }] = await tdb.query`SELECT COUNT(*)::int AS n FROM exam_focus_events WHERE session_id = ${sessionId}::uuid` as any[]
          if (n < MAX_FOCUS_EVENTS) {
            await tdb.query`INSERT INTO exam_focus_events (school_id, session_id) VALUES (${request.schoolId}::uuid, ${sessionId}::uuid)`
          }
          await tdb.query`UPDATE exam_sessions SET tab_switches = tab_switches + 1, updated_at = now() WHERE id = ${sessionId}::uuid`
        }
      } else {
        await closeAway(tdb, sessionId)
      }
      if (body.data.clientCount) {
        await tdb.query`UPDATE exam_sessions SET tab_switches = GREATEST(tab_switches, ${body.data.clientCount}) WHERE id = ${sessionId}::uuid`
      }
      const [r] = await tdb.query`SELECT tab_switches, time_away_seconds FROM exam_sessions WHERE id = ${sessionId}::uuid` as any[]
      return reply.send({ tabSwitches: Number(r.tab_switches), timeAwaySeconds: Number(r.time_away_seconds) })
    })

  // ── When a student left the exam screen (staff) ──────────────────────────
  app.get('/sessions/:sessionId/focus-events', { preHandler: [authenticate, requireRole('school_admin', 'teacher', 'proprietor')] },
    async (request: any, reply: any) => {
      const sessionId = (request.params as any).sessionId
      if (!z.string().uuid().safeParse(sessionId).success) return reply.status(404).send({ error: 'NOT_FOUND' })
      const tdb = tenantDb(request.schoolId)
      const [session] = await tdb.query`
        SELECT es.id, es.exam_id, es.tab_switches, es.time_away_seconds, es.started_at, es.submitted_at, u.full_name AS student_name
        FROM exam_sessions es JOIN users u ON u.id = es.student_id
        WHERE es.id = ${sessionId}::uuid AND es.school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!session) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (request.user.role === 'teacher' && !(await isExamOwnedByTeacher(tdb, request.schoolId, request.user.id, session.exam_id))) {
        return reply.status(403).send({ error: 'NOT_OWNER', message: 'You can only view results for your own exams.' })
      }
      const events = await tdb.query`
        SELECT left_at, returned_at, seconds_away FROM exam_focus_events
        WHERE session_id = ${sessionId}::uuid ORDER BY left_at
      ` as any[]
      return reply.send({
        studentName: session.student_name, startedAt: session.started_at, submittedAt: session.submitted_at,
        tabSwitches: Number(session.tab_switches), timeAwaySeconds: Number(session.time_away_seconds), events,
      })
    })

  // ── Submit exam ───────────────────────────────────────────────────────────
  app.post('/sessions/:sessionId/submit', { preHandler: [authenticate, requireRole('student')] },
    async (request: any, reply: any) => {
      const sessionId = (request.params as any).sessionId
      if (!z.string().uuid().safeParse(sessionId).success) return reply.status(404).send({ error: 'NOT_FOUND' })
      // The student's latest answers come with the submission, so nothing is lost
      // if the last automatic save didn't get through
      const body = z.object({ answers: z.record(z.string().max(20000)).optional() }).safeParse(request.body ?? {})
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const tdb = tenantDb(request.schoolId)

      // Submit exactly the session asked for, and only the student's own
      const sessionRows = await tdb.query`
        SELECT id, exam_id, status, answers, question_order,
               now() <= server_deadline + interval '2 minutes' AS within_time
        FROM exam_sessions
        WHERE id = ${sessionId}::uuid
        AND student_id = ${request.user.id}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const session = sessionRows[0]
      if (!session) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (session.status !== 'in_progress') return reply.status(400).send({ error: 'ALREADY_SUBMITTED', message: 'This exam has already been submitted.' })

      const questionRows = await tdb.query`
        SELECT id, type, correct_answer, marks FROM questions
        WHERE id = ANY(${session.question_order}::uuid[])
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const examRows = await tdb.query`
        SELECT total_marks, pass_mark, show_result_after FROM exams
        WHERE id = ${session.exam_id}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const exam = examRows[0]

      // Answers sent with the submission count if it arrives by the deadline
      // (a 2-minute allowance covers a slow connection at the end)
      const finalAnswers = {
        ...mergeAnswers(session.answers),
        ...(session.within_time && body.data.answers ? body.data.answers : {}),
      }

      // Objective questions are marked now; essays wait for a teacher, and until
      // then the session has no final score (it's kept out of pass rates and the gradebook)
      const paper = markPaper(questionRows, finalAnswers)
      const pending = paper.score === null
      const score = pending ? null : paper.score!
      const percentage = score === null ? null : exam.total_marks > 0 ? (score / exam.total_marks) * 100 : 0
      const passed = percentage === null ? null : percentage >= Number(exam.pass_mark)

      // Only one submission wins, even if the button is pressed twice
      const done = await tdb.query`
        UPDATE exam_sessions
        SET status = 'submitted', submitted_at = now(), answers = ${db().json(finalAnswers)},
            score = ${score}, percentage = ${percentage}, passed = ${passed},
            auto_score = ${paper.auto}, marking_status = ${pending ? 'pending' : 'complete'}
        WHERE id = ${session.id}::uuid AND status = 'in_progress'
        RETURNING id
      ` as any[]
      if (!done[0]) return reply.status(400).send({ error: 'ALREADY_SUBMITTED', message: 'This exam has already been submitted.' })
      await closeAway(tdb, session.id)

      const result = !exam.show_result_after ? null
        : pending ? { pending: true, autoScore: paper.auto, essaysToMark: paper.waiting.length, totalMarks: exam.total_marks }
        : { score, percentage: Math.round(percentage! * 100) / 100, passed, totalMarks: exam.total_marks }

      // The result email goes when there is a final result the school chose to show
      if (exam.show_result_after && !pending) {
        sendResultEmail(tdb, request.school.name, session.exam_id, request.user.id, score!, Number(exam.total_marks), percentage!, passed!)
      }

      return reply.send({ submitted: true, result })
    })

  // ── Essay marking (teacher who set the exam, School Admin) ───────────────
  async function markingContext(request: any, reply: any) {
    const sessionId = (request.params as any).sessionId
    if (!z.string().uuid().safeParse(sessionId).success) { reply.status(404).send({ error: 'NOT_FOUND' }); return null }
    const tdb = tenantDb(request.schoolId)
    const [session] = await tdb.query`
      SELECT es.id, es.exam_id, es.status, es.answers, es.question_order, es.manual_marks, es.marking_status,
             es.auto_score, es.student_id, u.full_name AS student_name, u.class_level, u.class_arm,
             e.title, e.total_marks, e.pass_mark, e.show_result_after
      FROM exam_sessions es JOIN users u ON u.id = es.student_id JOIN exams e ON e.id = es.exam_id
      WHERE es.id = ${sessionId}::uuid AND es.school_id = ${request.schoolId}::uuid
    ` as any[]
    if (!session) { reply.status(404).send({ error: 'NOT_FOUND' }); return null }
    if (request.user.role === 'teacher' && !(await isExamOwnedByTeacher(tdb, request.schoolId, request.user.id, session.exam_id))) {
      reply.status(403).send({ error: 'NOT_OWNER', message: 'You can only mark your own exams.' }); return null
    }
    if (session.status !== 'submitted') { reply.status(400).send({ error: 'NOT_SUBMITTED', message: 'This exam hasn’t been submitted yet.' }); return null }
    const questions = await tdb.query`
      SELECT id, type, question_text, correct_answer, marks, explanation FROM questions
      WHERE id = ANY(${session.question_order}::uuid[]) AND school_id = ${request.schoolId}::uuid
    ` as any[]
    return { tdb, session, questions, answers: mergeAnswers(session.answers), manual: asJson<Record<string, ManualMark>>(session.manual_marks, {}) }
  }

  app.get('/sessions/:sessionId/marking', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const ctx = await markingContext(request, reply); if (!ctx) return
      const { session, questions, answers, manual } = ctx
      const order: string[] = session.question_order
      const essays = order.map(id => questions.find((q: any) => q.id === id)).filter((q: any) => q && q.type === 'essay')
      return reply.send({
        student: { name: session.student_name, classLevel: session.class_level, classArm: session.class_arm },
        exam: { title: session.title, totalMarks: Number(session.total_marks), passMark: Number(session.pass_mark) },
        autoScore: Number(session.auto_score ?? 0),
        markingStatus: session.marking_status,
        essays: essays.map((q: any) => ({
          questionId: q.id, number: order.indexOf(q.id) + 1, questionText: q.question_text, maxMarks: Number(q.marks),
          guide: q.explanation ?? null, answer: answers[q.id] ?? '',
          given: manual[q.id] ? { marks: Number(manual[q.id].marks), comment: manual[q.id].comment ?? null } : null,
        })),
      })
    })

  app.post('/sessions/:sessionId/marking', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const body = z.object({
        marks: z.record(z.object({ marks: z.number().min(0), comment: z.string().trim().max(1000).optional().nullable() })),
      }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Give each answer a mark of 0 or more.' })
      const ctx = await markingContext(request, reply); if (!ctx) return
      const { tdb, session, questions, answers, manual } = ctx
      const byId = new Map(questions.map((q: any) => [q.id, q]))
      for (const [qid, m] of Object.entries(body.data.marks)) {
        const q: any = byId.get(qid)
        if (!q || q.type !== 'essay') return reply.status(400).send({ error: 'NOT_AN_ESSAY', message: 'Only essay answers are marked by hand.' })
        if (m.marks > Number(q.marks)) return reply.status(400).send({ error: 'TOO_MANY_MARKS', message: `Question ${session.question_order.indexOf(qid) + 1} is out of ${Number(q.marks)}.` })
        if (Math.round(m.marks * 2) !== m.marks * 2) return reply.status(400).send({ error: 'BAD_MARK', message: 'Marks can be whole or half marks.' })
        manual[qid] = { marks: m.marks, comment: m.comment || null, by: request.user.id, at: new Date().toISOString() }
      }
      const paper = markPaper(questions, answers, manual)
      const complete = paper.score === null ? false : true
      const score = paper.score
      const percentage = score === null ? null : Number(session.total_marks) > 0 ? (score / Number(session.total_marks)) * 100 : 0
      const passed = percentage === null ? null : percentage >= Number(session.pass_mark)
      const wasComplete = session.marking_status === 'complete'
      await tdb.query`
        UPDATE exam_sessions
        SET manual_marks = ${db().json(manual)}, auto_score = ${paper.auto},
            marking_status = ${complete ? 'complete' : 'pending'},
            score = ${score}, percentage = ${percentage}, passed = ${passed},
            marked_by = ${complete ? request.user.id : null}, marked_at = ${complete ? new Date() : null}, updated_at = now()
        WHERE id = ${session.id}::uuid
      `
      if (complete && !wasComplete && session.show_result_after) {
        sendResultEmail(tdb, request.school.name, session.exam_id, session.student_id, score!, Number(session.total_marks), percentage!, passed!)
      }
      return reply.send({
        markingStatus: complete ? 'complete' : 'pending', stillToMark: paper.waiting.length,
        score, percentage: percentage === null ? null : Math.round(percentage * 10) / 10, passed,
      })
    })

  // ── Exam results (teacher/admin) ──────────────────────────────────────────
  app.get('/exams/:examId/results', { preHandler: [authenticate, requireRole('school_admin', 'teacher', 'proprietor')] },
    async (request: any, reply: any) => {
      const examId = (request.params as any).examId
      const tdb = tenantDb(request.schoolId)

      if (request.user.role === 'teacher') {
        const owns = await isExamOwnedByTeacher(tdb, request.schoolId, request.user.id, examId)
        if (!owns) return reply.status(403).send({ error: 'NOT_OWNER', message: 'You can only view results for your own exams.' })
      }

      const results = await tdb.query`
        SELECT u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm,
               es.score, es.percentage, es.passed, es.status, es.submitted_at,
               es.id AS session_id, es.tab_switches, es.time_away_seconds, es.marking_status, es.auto_score,
               (es.manual_marks <> '{}'::jsonb) AS has_essay_marks
        FROM exam_sessions es
        JOIN users u ON u.id = es.student_id
        WHERE es.exam_id = ${examId}::uuid
        AND es.school_id = ${request.schoolId}::uuid
        ORDER BY es.percentage DESC NULLS LAST
      ` as any[]

      // Papers with essays still to mark have no final score yet and are left out of the pass rate and average
      const final = results.filter((r: any) => r.status === 'submitted' && r.marking_status !== 'pending')
      const stats = {
        total: results.length,
        submitted: final.length,
        toMark: results.filter((r: any) => r.marking_status === 'pending').length,
        passed: final.filter((r: any) => r.passed).length,
        avgScore: final.length
          ? Math.round(final.reduce((s: number, r: any) => s + Number(r.percentage ?? 0), 0) / final.length * 10) / 10
          : 0,
      }

     return reply.send({ results, stats })
    })

  // ── Send exam reminder (manual trigger) ─────────────────────────────────────
  app.post('/exams/:examId/remind', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const examId = (request.params as any).examId
      const tdb = tenantDb(request.schoolId)

      if (request.user.role === 'teacher') {
        const owns = await isExamOwnedByTeacher(tdb, request.schoolId, request.user.id, examId)
        if (!owns) return reply.status(403).send({ error: 'NOT_OWNER', message: 'You can only send reminders for your own exams.' })
      }

      const examRows = await tdb.query`
        SELECT id, title, subject, class_level, class_arms, scheduled_at, duration_minutes, status
        FROM exams
        WHERE id = ${examId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const exam = examRows[0]
      if (!exam) return reply.status(404).send({ error: 'NOT_FOUND' })

      const studentRows = await tdb.query`
        SELECT u.id, u.email, u.full_name
        FROM users u
        LEFT JOIN exam_sessions es ON es.exam_id = ${examId}::uuid AND es.student_id = u.id
        WHERE u.school_id = ${request.schoolId}::uuid
        AND u.role = 'student'
        AND u.is_active = true
        AND u.class_level = ${exam.class_level}
        AND (
          ${exam.class_arms === null} = true
          OR u.class_arm = ANY(${exam.class_arms}::text[])
        )
        AND (es.id IS NULL OR es.status NOT IN ('submitted', 'in_progress', 'timed_out'))
      ` as any[]

      if (studentRows.length === 0) {
        return reply.send({ sent: 0, message: 'No eligible students to remind — everyone has already started or submitted.' })
      }

      const emails = studentRows.map((s: any) => {
        const { subject, html } = examReminderEmail({
          schoolName: request.school.name,
          fullName: s.full_name,
          examTitle: exam.title,
          subject: exam.subject,
          scheduledAt: exam.scheduled_at,
          durationMinutes: exam.duration_minutes,
          loginUrl: 'https://examify-cbt-web.vercel.app/login',
        })
        return { to: s.email, subject, html }
      })

      const result = await sendBulkEmails(emails)

      return reply.send({
        sent: result.sent,
        failed: result.failed,
        total: studentRows.length,
        message: `Reminder sent to ${result.sent} of ${studentRows.length} student(s).`,
      })
    })

  // ── Cron: Auto-send exam reminders 24hrs before start ───────────────────────
  app.post('/cron/send-reminders', async (request: any, reply: any) => {
    const providedSecret = request.headers['x-cron-secret']
    if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
      return reply.status(401).send({ error: 'UNAUTHORIZED' })
    }

    try {
      const examRows = await db()`
        SELECT e.id, e.title, e.subject, e.class_level, e.class_arms,
               e.scheduled_at, e.duration_minutes, e.school_id, e.reminder_sent_at,
               s.name AS school_name
        FROM exams e
        JOIN schools s ON s.id = e.school_id
        WHERE e.status IN ('scheduled', 'active')
        AND e.reminder_sent_at IS NULL
        AND e.scheduled_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
      ` as any[]

      let totalSent = 0
      let examsProcessed = 0

      for (const exam of examRows) {
        const tdb = tenantDb(exam.school_id)

        const studentRows = await tdb.query`
          SELECT u.id, u.email, u.full_name
          FROM users u
          LEFT JOIN exam_sessions es ON es.exam_id = ${exam.id}::uuid AND es.student_id = u.id
          WHERE u.school_id = ${exam.school_id}::uuid
          AND u.role = 'student'
          AND u.is_active = true
          AND u.class_level = ${exam.class_level}
          AND (
            ${exam.class_arms === null} = true
            OR u.class_arm = ANY(${exam.class_arms}::text[])
          )
          AND (es.id IS NULL OR es.status NOT IN ('submitted', 'in_progress', 'timed_out'))
        ` as any[]

        if (studentRows.length > 0) {
          const emails = studentRows.map((s: any) => {
            const { subject, html } = examReminderEmail({
              schoolName: exam.school_name,
              fullName: s.full_name,
              examTitle: exam.title,
              subject: exam.subject,
              scheduledAt: exam.scheduled_at,
              durationMinutes: exam.duration_minutes,
              loginUrl: 'https://examify-cbt-web.vercel.app/login',
            })
            return { to: s.email, subject, html }
          })

          const result = await sendBulkEmails(emails)
          totalSent += result.sent
        }

        await db()`UPDATE exams SET reminder_sent_at = now() WHERE id = ${exam.id}`
        examsProcessed++
      }

      return reply.send({
        examsProcessed,
        totalSent,
        message: `Processed ${examsProcessed} exam(s), sent ${totalSent} reminder(s).`,
      })
    } catch (err: any) {
      console.error('[CRON] send-reminders error:', err.message)
      return reply.status(500).send({ error: 'SERVER_ERROR', message: err.message })
    }
  })
}