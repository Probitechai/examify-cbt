import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { authenticate } from '../middleware/auth'
// jamb_subjects, jamb_topics, jamb_past_questions, jamb_topic_notes are GLOBAL (shared by all schools).
// jamb_student_profiles, jamb_topic_progress, jamb_quiz_sessions, jamb_ai_questions, jamb_ai_usage are tenant-scoped.
// The shared question bank is managed only by super_admin (see routes/superadmin.ts).

const ANTHROPIC_URL = process.env.ANTHROPIC_API_URL ?? 'https://api.anthropic.com/v1/messages'
const AI_MODEL = process.env.JAMB_AI_MODEL ?? 'claude-haiku-4-5-20251001'
const AI_DAILY_LIMIT = Number(process.env.JAMB_AI_DAILY_LIMIT ?? 20)   // AI quizzes + new notes per student per day
const AI_QUIZ_SIZE = 10

// ── Access guards ───────────────────────────────────────────────────────────
async function studentClassLevel(request: any): Promise<string> {
  const tdb = tenantDb(request.schoolId)
  const rows = await tdb.query`
    SELECT class_level FROM users
    WHERE id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid AND is_active = true
  ` as any[]
  return String(rows[0]?.class_level ?? '').toUpperCase()
}

// Student-only features: active SS3 students
async function requireSS3Student(request: any, reply: FastifyReply) {
  if (request.user?.role !== 'student' || (await studentClassLevel(request)) !== 'SS3') {
    return reply.status(403).send({ error: 'SS3_ONLY', message: 'JAMB Prep is only available to SS3 students.' })
  }
}

// Browsing the syllabus: SS3 students, plus staff
async function requireSS3OrStaff(request: any, reply: FastifyReply) {
  if (['school_admin', 'teacher', 'proprietor'].includes(request.user?.role)) return
  return requireSS3Student(request, reply)
}

// ── AI helpers ──────────────────────────────────────────────────────────────
async function callClaude(prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw Object.assign(new Error('AI not configured'), { code: 'AI_NOT_CONFIGURED' })
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? `AI request failed (${res.status})`), { code: 'AI_FAILED' })
  return data.content?.[0]?.text ?? ''
}

async function aiCallsToday(request: any): Promise<number> {
  const tdb = tenantDb(request.schoolId)
  const rows = await tdb.query`
    SELECT COUNT(*) AS n FROM jamb_ai_usage
    WHERE school_id = ${request.schoolId}::uuid AND student_id = ${request.user.id}::uuid
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
  ` as any[]
  return Number(rows[0]?.n ?? 0)
}

async function recordAiCall(request: any, kind: 'quiz' | 'summary') {
  const tdb = tenantDb(request.schoolId)
  await tdb.query`
    INSERT INTO jamb_ai_usage (school_id, student_id, kind)
    VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${kind})
  `
}

function limitReached(reply: FastifyReply) {
  return reply.status(429).send({
    error: 'AI_DAILY_LIMIT',
    message: `You've used today's ${AI_DAILY_LIMIT} AI sessions. Try Past Questions, or come back tomorrow.`,
    limit: AI_DAILY_LIMIT,
  })
}

// Look up a topic and its subject from the shared syllabus (never trust names sent by the browser)
async function topicWithSubject(topicId: string) {
  const rows = await db()`
    SELECT jt.id AS topic_id, jt.name AS topic_name, js.id AS subject_id, js.name AS subject_name
    FROM jamb_topics jt JOIN jamb_subjects js ON js.id = jt.subject_id
    WHERE jt.id = ${topicId}::uuid
  ` as any[]
  return rows[0] ?? null
}

export async function jambRoutes(app: FastifyInstance) {
  const SYLLABUS = [authenticate, requireSS3OrStaff]
  const STUDENT = [authenticate, requireSS3Student]

  // ── Subjects with topic counts ────────────────────────────────────────────
  app.get('/jamb/subjects', { preHandler: SYLLABUS },
    async (_request: any, reply: any) => {
      const rows = await db()`
        SELECT js.*, COUNT(jt.id) AS topic_count
        FROM jamb_subjects js
        LEFT JOIN jamb_topics jt ON jt.subject_id = js.id
        GROUP BY js.id
        ORDER BY js.is_compulsory DESC, js.name ASC
      ` as any[]
      return reply.send({ subjects: rows })
    })

  // ── Topics for a subject ──────────────────────────────────────────────────
  app.get('/jamb/subjects/:subjectId/topics', { preHandler: SYLLABUS },
    async (request: any, reply: any) => {
      const sid = String((request.params as any).subjectId)
      const rows = await db()`
        SELECT jt.*, COUNT(jpq.id) AS question_count,
               EXISTS (SELECT 1 FROM jamb_topic_notes n WHERE n.topic_id = jt.id) AS has_notes
        FROM jamb_topics jt
        LEFT JOIN jamb_past_questions jpq ON jpq.topic_id = jt.id
        WHERE jt.subject_id = ${sid}::uuid
        GROUP BY jt.id
        ORDER BY jt.sort_order ASC
      ` as any[]
      return reply.send({ topics: rows })
    })

  // ── Student profile ───────────────────────────────────────────────────────
  app.get('/jamb/profile', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT * FROM jamb_student_profiles
        WHERE student_id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      const used = await aiCallsToday(request)
      const today = await tdb.query`
        SELECT COALESCE(SUM(total_questions), 0) AS n FROM jamb_quiz_sessions
        WHERE school_id = ${request.schoolId}::uuid AND student_id = ${request.user.id}::uuid
          AND completed_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'
      ` as any[]
      return reply.send({
        profile: rows[0] ?? null,
        answeredToday: Number(today[0]?.n ?? 0),
        ai: { usedToday: used, dailyLimit: AI_DAILY_LIMIT },
      })
    })

  app.post('/jamb/profile', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const schema = z.object({
        selectedSubjects: z.array(z.string().uuid()).min(1).max(4),
        targetScore: z.number().min(0).max(400).default(280),
        examDate: z.string().optional(),
        dailyGoalQuestions: z.number().min(5).max(100).default(20),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data

      // Subjects must exist and must include the compulsory subject (Use of English)
      const subs = await db()`
        SELECT id, is_compulsory FROM jamb_subjects WHERE id = ANY(${d.selectedSubjects}::uuid[])
      ` as any[]
      if (subs.length !== d.selectedSubjects.length) return reply.status(400).send({ error: 'UNKNOWN_SUBJECT' })
      const compulsory = await db()`SELECT id FROM jamb_subjects WHERE is_compulsory = true` as any[]
      const missing = compulsory.filter((c: any) => !d.selectedSubjects.includes(c.id))
      if (missing.length > 0) return reply.status(400).send({ error: 'COMPULSORY_SUBJECT_MISSING', message: 'English Language must be one of your subjects.' })

      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO jamb_student_profiles (school_id, student_id, selected_subjects, target_score, exam_date, daily_goal_questions)
        VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${d.selectedSubjects}::uuid[], ${d.targetScore}, ${d.examDate ?? null}, ${d.dailyGoalQuestions})
        ON CONFLICT (school_id, student_id) DO UPDATE SET
          selected_subjects = ${d.selectedSubjects}::uuid[],
          target_score = ${d.targetScore},
          exam_date = ${d.examDate ?? null},
          daily_goal_questions = ${d.dailyGoalQuestions},
          updated_at = now()
        RETURNING *
      ` as any[]
      return reply.send({ profile: rows[0] })
    })

  // ── Topic mastery ─────────────────────────────────────────────────────────
  app.get('/jamb/progress', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT jtp.*, jt.name AS topic_name, js.id AS subject_id, js.name AS subject_name, js.color AS subject_color
        FROM jamb_topic_progress jtp
        JOIN jamb_topics jt ON jt.id = jtp.topic_id
        JOIN jamb_subjects js ON js.id = jt.subject_id
        WHERE jtp.student_id = ${request.user.id}::uuid AND jtp.school_id = ${request.schoolId}::uuid
        ORDER BY jtp.mastery_pct DESC
      ` as any[]
      return reply.send({ progress: rows })
    })

  // ── Past questions for a topic / subject / year ───────────────────────────
  app.get('/jamb/questions', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const { subjectId, topicId, year, limit } = request.query as any
      const lim = Math.min(Math.max(Number(limit ?? 20), 1), 50)

      let rows: any[] = []
      if (topicId) {
        rows = await db()`
          SELECT id, question, option_a, option_b, option_c, option_d, correct_option, explanation, year, difficulty_level
          FROM jamb_past_questions
          WHERE topic_id = ${String(topicId)}::uuid
          ORDER BY RANDOM() LIMIT ${lim}
        ` as any[]
      } else if (subjectId && year) {
        rows = await db()`
          SELECT id, question, option_a, option_b, option_c, option_d, correct_option, explanation, year, difficulty_level
          FROM jamb_past_questions
          WHERE subject_id = ${String(subjectId)}::uuid AND year = ${Number(year)}
          ORDER BY RANDOM() LIMIT ${lim}
        ` as any[]
      } else if (subjectId) {
        rows = await db()`
          SELECT id, question, option_a, option_b, option_c, option_d, correct_option, explanation, year, difficulty_level
          FROM jamb_past_questions
          WHERE subject_id = ${String(subjectId)}::uuid
          ORDER BY RANDOM() LIMIT ${lim}
        ` as any[]
      }
      // Answers are sent for instant feedback in practice; the SCORE is still worked out by the server
      return reply.send({ questions: rows.map(q => ({ ...q, source: 'past' })) })
    })

  // ── Save a quiz: the server marks the answers ─────────────────────────────
  app.post('/jamb/sessions', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectId: z.string().uuid(),
        topicId: z.string().uuid().optional(),
        sessionType: z.enum(['practice', 'past_questions', 'ai_generated', 'mock_exam']),
        answers: z.record(z.string().uuid(), z.enum(['a', 'b', 'c', 'd'])),
        timeTakenSecs: z.number().int().min(0).max(6 * 3600).optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
      const d = body.data
      const ids = Object.keys(d.answers)
      if (ids.length === 0) return reply.status(400).send({ error: 'NO_ANSWERS' })
      if (ids.length > 200) return reply.status(400).send({ error: 'TOO_MANY_ANSWERS' })

      const tdb = tenantDb(request.schoolId)

      // Correct options come from the database, never from the browser
      const past = await db()`
        SELECT id, correct_option FROM jamb_past_questions WHERE id = ANY(${ids}::uuid[])
      ` as any[]
      const ai = await tdb.query`
        SELECT id, correct_option FROM jamb_ai_questions
        WHERE id = ANY(${ids}::uuid[]) AND school_id = ${request.schoolId}::uuid AND student_id = ${request.user.id}::uuid
      ` as any[]
      const key: Record<string, string> = {}
      for (const r of past) key[r.id] = r.correct_option
      for (const r of ai) key[r.id] = r.correct_option

      const marked = ids.filter(id => key[id]).map(id => ({ id, answer: d.answers[id], correct: d.answers[id] === key[id] }))
      const total = marked.length
      if (total === 0) return reply.status(400).send({ error: 'UNKNOWN_QUESTIONS' })
      const score = marked.filter(m => m.correct).length
      const pct = Math.round((score / total) * 100)
      let bonus = 0
      if (pct >= 80) bonus = 50
      else if (pct >= 60) bonus = 25
      const xp = score * 10 + bonus
      const tid = d.topicId ?? null

      await tdb.transaction(async (tx: any) => {
        await tx`
          INSERT INTO jamb_quiz_sessions (school_id, student_id, subject_id, topic_id, session_type, questions, answers, score, total_questions, time_taken_secs, xp_earned, completed_at)
          VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${d.subjectId}::uuid, ${tid}::uuid, ${d.sessionType},
                  ${tx.json(marked)}, ${tx.json(d.answers)}, ${score}, ${total}, ${d.timeTakenSecs ?? null}, ${xp}, now())
        `
        if (tid) {
          await tx`
            INSERT INTO jamb_topic_progress (school_id, student_id, topic_id, questions_attempted, questions_correct, mastery_pct, last_attempted_at)
            VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${tid}::uuid, ${total}, ${score}, ${pct}, now())
            ON CONFLICT (school_id, student_id, topic_id) DO UPDATE SET
              questions_attempted = jamb_topic_progress.questions_attempted + ${total},
              questions_correct = jamb_topic_progress.questions_correct + ${score},
              mastery_pct = LEAST(100, ROUND(((jamb_topic_progress.questions_correct + ${score})::numeric / NULLIF(jamb_topic_progress.questions_attempted + ${total}, 0)) * 100)),
              last_attempted_at = now(),
              updated_at = now()
          `
        }
        await tx`
          UPDATE jamb_student_profiles SET
            total_questions_attempted = total_questions_attempted + ${total},
            total_correct = total_correct + ${score},
            total_xp = total_xp + ${xp},
            current_streak = CASE
              WHEN last_study_date = CURRENT_DATE - 1 THEN current_streak + 1
              WHEN last_study_date = CURRENT_DATE THEN current_streak
              ELSE 1
            END,
            longest_streak = GREATEST(longest_streak, CASE
              WHEN last_study_date = CURRENT_DATE - 1 THEN current_streak + 1
              WHEN last_study_date = CURRENT_DATE THEN current_streak
              ELSE 1
            END),
            last_study_date = CURRENT_DATE,
            updated_at = now()
          WHERE student_id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid
        `
      })

      return reply.send({ saved: true, score, total, pct, xpEarned: xp })
    })

  // ── AI study notes (generated once per topic, then shared) ────────────────
  app.post('/jamb/ai/summary', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const body = z.object({ topicId: z.string().uuid() }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const t = await topicWithSubject(body.data.topicId)
      if (!t) return reply.status(404).send({ error: 'TOPIC_NOT_FOUND' })

      const cached = await db()`SELECT content FROM jamb_topic_notes WHERE topic_id = ${t.topic_id}::uuid` as any[]
      if (cached[0]) return reply.send({ summary: cached[0].content, cached: true })

      if ((await aiCallsToday(request)) >= AI_DAILY_LIMIT) return limitReached(reply)
      try {
        const text = await callClaude(
          `Write a concise, student-friendly study summary for JAMB exam preparation on "${t.topic_name}" in ${t.subject_name}. ` +
          `Structure it with: 1) Key Concepts (bullet points), 2) Important Formulas or Rules (if applicable), 3) Common JAMB Question Patterns, 4) Quick Tips to Remember. ` +
          `Keep it under 400 words. Use simple language suitable for a Nigerian SS3 student.`, 1000)
        if (!text.trim()) return reply.status(502).send({ error: 'AI_EMPTY', message: 'Could not generate notes. Please try again.' })
        await recordAiCall(request, 'summary')
        await db()`
          INSERT INTO jamb_topic_notes (topic_id, content, model) VALUES (${t.topic_id}::uuid, ${text}, ${AI_MODEL})
          ON CONFLICT (topic_id) DO NOTHING
        `
        return reply.send({ summary: text, cached: false })
      } catch (e: any) {
        const status = e.code === 'AI_NOT_CONFIGURED' ? 503 : 502
        return reply.status(status).send({ error: e.code ?? 'AI_FAILED', message: 'Study notes are unavailable right now. Please try again later.' })
      }
    })

  // ── AI practice quiz (questions stored so the server can mark them) ───────
  app.post('/jamb/ai/quiz', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const body = z.object({ topicId: z.string().uuid() }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const t = await topicWithSubject(body.data.topicId)
      if (!t) return reply.status(404).send({ error: 'TOPIC_NOT_FOUND' })
      if ((await aiCallsToday(request)) >= AI_DAILY_LIMIT) return limitReached(reply)

      let text = ''
      try {
        text = await callClaude(
          `Generate exactly ${AI_QUIZ_SIZE} multiple choice questions for JAMB exam preparation on the topic "${t.topic_name}" in ${t.subject_name}. ` +
          `Return ONLY a JSON array with no markdown, no explanation, no backticks. Each object must have: question (string), option_a, option_b, option_c, option_d (strings), ` +
          `correct_option ("a"|"b"|"c"|"d"), explanation (string, 1-2 sentences). Questions should vary in difficulty. Make them realistic JAMB-style questions.`, 6000)
      } catch (e: any) {
        const status = e.code === 'AI_NOT_CONFIGURED' ? 503 : 502
        return reply.status(status).send({ error: e.code ?? 'AI_FAILED', message: 'AI practice is unavailable right now. Please try again later.' })
      }

      let clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const arrayMatch = clean.match(/\[[\s\S]*\]/)
      if (arrayMatch) clean = arrayMatch[0]
      let parsed: any[] = []
      try { parsed = JSON.parse(clean) } catch { parsed = [] }
      if (!Array.isArray(parsed)) parsed = []

      // Keep only well-formed questions
      const str = (v: any) => typeof v === 'string' && v.trim().length > 0
      const good = parsed.filter(q => q && str(q.question) && str(q.option_a) && str(q.option_b) && str(q.option_c) && str(q.option_d)
        && ['a', 'b', 'c', 'd'].includes(String(q.correct_option).toLowerCase())).slice(0, AI_QUIZ_SIZE)
      if (good.length < 3) {
        console.error('[JAMB AI Quiz] unusable response:', text.slice(0, 200))
        return reply.status(502).send({ error: 'AI_BAD_RESPONSE', message: 'Could not generate questions. Please try again.' })
      }

      const tdb = tenantDb(request.schoolId)
      const saved: any[] = []
      await tdb.transaction(async (tx: any) => {
        for (const q of good) {
          const rows = await tx`
            INSERT INTO jamb_ai_questions (school_id, student_id, subject_id, topic_id, question, option_a, option_b, option_c, option_d, correct_option, explanation)
            VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${t.subject_id}::uuid, ${t.topic_id}::uuid,
                    ${q.question}, ${q.option_a}, ${q.option_b}, ${q.option_c}, ${q.option_d},
                    ${String(q.correct_option).toLowerCase()}, ${str(q.explanation) ? q.explanation : null})
            RETURNING id, question, option_a, option_b, option_c, option_d, correct_option, explanation
          ` as any[]
          saved.push({ ...rows[0], source: 'ai' })
        }
        await tx`
          INSERT INTO jamb_ai_usage (school_id, student_id, kind)
          VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, 'quiz')
        `
      })
      return reply.send({ questions: saved })
    })
}
