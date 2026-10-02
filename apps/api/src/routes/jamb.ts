import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { gateRoutes } from '../middleware/tier'
import { authenticate } from '../middleware/auth'
// jamb_subjects, jamb_topics, jamb_past_questions, jamb_topic_notes are GLOBAL (shared by all schools).
// jamb_student_profiles, jamb_topic_progress, jamb_quiz_sessions, jamb_ai_questions, jamb_ai_usage are tenant-scoped.
// The shared question bank is managed only by super_admin (see routes/superadmin.ts).

const ANTHROPIC_URL = process.env.ANTHROPIC_API_URL ?? 'https://api.anthropic.com/v1/messages'
const AI_MODEL = process.env.JAMB_AI_MODEL ?? 'claude-haiku-4-5-20251001'
const AI_DAILY_LIMIT = Number(process.env.JAMB_AI_DAILY_LIMIT ?? 20)   // AI quizzes + new notes per student per day
const AI_QUIZ_SIZE = 10

// postgres.js can hand back uuid[] columns as '{a,b}' text depending on the query path
function uuidList(v: any): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return v.replace(/^\{|\}$/g, '').split(',').map(x => x.trim()).filter(Boolean)
  return []
}

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
  gateRoutes(app, 'jambPrep')
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

  // ═══════════════════════════════════════════════════════════════════════════
  // MOCK EXAMS — server picks past questions, keeps the clock and marks the paper
  // ═══════════════════════════════════════════════════════════════════════════
  const MOCK = {
    full: { english: 60, other: 40, minutes: 120, label: 'Full UTME mock' },
    short: { english: 15, other: 10, minutes: 30, label: 'Quick mock' },
  } as const
  const GRACE_MS = 60 * 1000   // late autosaves/submits accepted within a minute of the deadline

  async function mySubjects(request: any): Promise<any[]> {
    const tdb = tenantDb(request.schoolId)
    const prof = await tdb.query`
      SELECT selected_subjects FROM jamb_student_profiles
      WHERE student_id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid
    ` as any[]
    const ids: string[] = uuidList(prof[0]?.selected_subjects)
    if (ids.length === 0) return []
    return await db()`
      SELECT js.id, js.name, js.is_compulsory,
             (SELECT COUNT(*) FROM jamb_past_questions q WHERE q.subject_id = js.id) AS available
      FROM jamb_subjects js WHERE js.id = ANY(${ids}::uuid[])
      ORDER BY js.is_compulsory DESC, js.name
    ` as any[]
  }

  const needed = (mode: 'full' | 'short', s: any) => (s.is_compulsory ? MOCK[mode].english : MOCK[mode].other)

  // Mark a paper and close it. Uses only answers already stored on the attempt.
  async function finalize(tdb: any, attempt: any) {
    const qmap: Record<string, string[]> = attempt.question_ids
    const all = Object.values(qmap).flat()
    const key = await db()`SELECT id, correct_option FROM jamb_past_questions WHERE id = ANY(${all}::uuid[])` as any[]
    const correctOf: Record<string, string> = {}
    for (const k of key) correctOf[k.id] = k.correct_option
    const subs = await db()`SELECT id, name FROM jamb_subjects WHERE id = ANY(${uuidList(attempt.subjects)}::uuid[])` as any[]
    const nameOf: Record<string, string> = {}
    for (const x of subs) nameOf[x.id] = x.name
    const answers = attempt.answers ?? {}

    let correct = 0, total = 0, utme = 0
    const bySubject = Object.entries(qmap).map(([sid, ids]) => {
      const c = ids.filter(id => answers[id] && answers[id] === correctOf[id]).length
      const t = ids.length
      const score = t > 0 ? Math.round((c / t) * 100) : 0
      correct += c; total += t; utme += score
      return { subjectId: sid, name: nameOf[sid] ?? '', correct: c, total: t, answered: ids.filter(id => answers[id]).length, score }
    })
    const rows = await tdb.query`
      UPDATE jamb_mock_attempts
      SET submitted_at = now(), correct = ${correct}, total = ${total},
          score_by_subject = ${db().json(bySubject)}, utme_score = ${utme}
      WHERE id = ${attempt.id}::uuid AND submitted_at IS NULL
      RETURNING *
    ` as any[]
    return rows[0] ?? attempt
  }

  async function loadAttempt(request: any, id: string) {
    const tdb = tenantDb(request.schoolId)
    const rows = await tdb.query`
      SELECT * FROM jamb_mock_attempts
      WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND student_id = ${request.user.id}::uuid
    ` as any[]
    let a = rows[0] ?? null
    // Out of time and never submitted: mark it now with what was saved
    if (a && !a.submitted_at && Date.now() > new Date(a.ends_at).getTime() + GRACE_MS) a = await finalize(tdb, a)
    return a
  }

  // Paper for sitting the exam (no answers or explanations)
  async function paperView(a: any) {
    const qmap: Record<string, string[]> = a.question_ids
    const all = Object.values(qmap).flat()
    const qs = await db()`
      SELECT id, question, option_a, option_b, option_c, option_d FROM jamb_past_questions WHERE id = ANY(${all}::uuid[])
    ` as any[]
    const byId: Record<string, any> = {}
    for (const q of qs) byId[q.id] = q
    const subs = await db()`SELECT id, name, is_compulsory FROM jamb_subjects WHERE id = ANY(${uuidList(a.subjects)}::uuid[])` as any[]
    const compulsory = new Set(subs.filter((x: any) => x.is_compulsory).map((x: any) => x.id))
    const ordered = Object.entries(qmap).sort(([x], [y]) => Number(compulsory.has(y)) - Number(compulsory.has(x)))
    return {
      id: a.id, mode: a.mode, status: 'in_progress',
      startedAt: a.started_at, endsAt: a.ends_at, serverNow: new Date().toISOString(),
      answers: a.answers ?? {},
      subjects: ordered.map(([sid, ids]) => {
        const sj = subs.find((x: any) => x.id === sid)
        return { id: sid, name: sj?.name ?? '', questions: ids.map(id => byId[id]).filter(Boolean) }
      }),
    }
  }

  // Marked paper for review
  async function reviewView(a: any) {
    const qmap: Record<string, string[]> = a.question_ids
    const all = Object.values(qmap).flat()
    const qs = await db()`
      SELECT id, question, option_a, option_b, option_c, option_d, correct_option, explanation, year
      FROM jamb_past_questions WHERE id = ANY(${all}::uuid[])
    ` as any[]
    const byId: Record<string, any> = {}
    for (const q of qs) byId[q.id] = q
    const scores: any[] = a.score_by_subject ?? []
    return {
      id: a.id, mode: a.mode, status: 'submitted',
      startedAt: a.started_at, submittedAt: a.submitted_at,
      utmeScore: a.utme_score, correct: a.correct, total: a.total,
      subjects: scores.map(sc => ({
        ...sc,
        questions: (qmap[sc.subjectId] ?? []).map(id => ({ ...byId[id], yourAnswer: (a.answers ?? {})[id] ?? null })).filter((q: any) => q.id),
      })),
    }
  }

  app.get('/jamb/mock/status', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const subjects = await mySubjects(request)
      const tdb = tenantDb(request.schoolId)
      const open = await tdb.query`
        SELECT id FROM jamb_mock_attempts
        WHERE school_id = ${request.schoolId}::uuid AND student_id = ${request.user.id}::uuid AND submitted_at IS NULL
      ` as any[]
      let openAttempt = null
      if (open[0]) {
        const a = await loadAttempt(request, open[0].id)
        if (a && !a.submitted_at) openAttempt = { id: a.id, mode: a.mode, endsAt: a.ends_at }
      }
      const history = await tdb.query`
        SELECT id, mode, started_at, submitted_at, utme_score, correct, total, score_by_subject
        FROM jamb_mock_attempts
        WHERE school_id = ${request.schoolId}::uuid AND student_id = ${request.user.id}::uuid AND submitted_at IS NOT NULL
        ORDER BY submitted_at DESC LIMIT 20
      ` as any[]
      const modes = (['full', 'short'] as const).map(m => ({
        mode: m, label: MOCK[m].label, minutes: MOCK[m].minutes,
        questions: subjects.reduce((n, sj) => n + needed(m, sj), 0),
        available: subjects.length === 4 && subjects.every(sj => Number(sj.available) >= needed(m, sj)),
      }))
      return reply.send({
        subjects: subjects.map(sj => ({ id: sj.id, name: sj.name, available: Number(sj.available), neededFull: needed('full', sj), neededShort: needed('short', sj) })),
        modes, openAttempt, history,
      })
    })

  app.post('/jamb/mock/start', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const body = z.object({ mode: z.enum(['full', 'short']) }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const mode = body.data.mode
      const tdb = tenantDb(request.schoolId)

      // Resume an unfinished mock instead of starting another
      const open = await tdb.query`
        SELECT id FROM jamb_mock_attempts
        WHERE school_id = ${request.schoolId}::uuid AND student_id = ${request.user.id}::uuid AND submitted_at IS NULL
      ` as any[]
      if (open[0]) {
        const a = await loadAttempt(request, open[0].id)
        if (a && !a.submitted_at) return reply.send({ resumed: true, attempt: await paperView(a) })
      }

      const subjects = await mySubjects(request)
      if (subjects.length !== 4) return reply.status(400).send({ error: 'SUBJECTS_NOT_SET', message: 'Choose your four JAMB subjects first.' })
      const short = subjects.filter(sj => Number(sj.available) < needed(mode, sj))
      if (short.length) {
        return reply.status(409).send({
          error: 'NOT_ENOUGH_QUESTIONS',
          message: `There aren't enough past questions yet for a ${MOCK[mode].label.toLowerCase()} in ${short.map(x => x.name).join(', ')}.`,
        })
      }

      const qmap: Record<string, string[]> = {}
      for (const sj of subjects) {
        const rows = await db()`
          SELECT id FROM jamb_past_questions WHERE subject_id = ${sj.id}::uuid ORDER BY RANDOM() LIMIT ${needed(mode, sj)}
        ` as any[]
        qmap[sj.id] = rows.map((r: any) => r.id)
      }
      const endsAt = new Date(Date.now() + MOCK[mode].minutes * 60 * 1000)
      let created: any[] = []
      try {
        created = await tdb.query`
          INSERT INTO jamb_mock_attempts (school_id, student_id, mode, subjects, question_ids, ends_at)
          VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${mode}, ${subjects.map(x => x.id)}::uuid[],
                  ${db().json(qmap)}, ${endsAt})
          RETURNING *
        ` as any[]
      } catch {
        return reply.status(409).send({ error: 'MOCK_IN_PROGRESS', message: 'You already have a mock in progress.' })
      }
      return reply.status(201).send({ resumed: false, attempt: await paperView(created[0]) })
    })

  app.get('/jamb/mock/:id', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const a = await loadAttempt(request, String((request.params as any).id))
      if (!a) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ attempt: a.submitted_at ? await reviewView(a) : await paperView(a) })
    })

  const answersSchema = z.record(z.string().uuid(), z.enum(['a', 'b', 'c', 'd']))

  // Autosave (merges). Only questions on this paper are kept.
  app.patch('/jamb/mock/:id/answers', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const body = z.object({ answers: answersSchema }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const a = await loadAttempt(request, String((request.params as any).id))
      if (!a) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (a.submitted_at) return reply.status(410).send({ error: 'TIME_UP', message: 'This mock has ended.' })
      const onPaper = new Set(Object.values(a.question_ids as Record<string, string[]>).flat())
      const merged = { ...(a.answers ?? {}) }
      for (const [qid, opt] of Object.entries(body.data.answers)) if (onPaper.has(qid)) merged[qid] = opt
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE jamb_mock_attempts SET answers = ${db().json(merged)}
        WHERE id = ${a.id}::uuid AND submitted_at IS NULL
      `
      return reply.send({ saved: true, answered: Object.keys(merged).length })
    })

  app.post('/jamb/mock/:id/submit', { preHandler: STUDENT },
    async (request: any, reply: any) => {
      const body = z.object({ answers: answersSchema.optional() }).safeParse(request.body ?? {})
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      let a = await loadAttempt(request, String((request.params as any).id))
      if (!a) return reply.status(404).send({ error: 'NOT_FOUND' })
      const tdb = tenantDb(request.schoolId)
      if (!a.submitted_at) {
        if (body.data.answers) {
          const onPaper = new Set(Object.values(a.question_ids as Record<string, string[]>).flat())
          const merged = { ...(a.answers ?? {}) }
          for (const [qid, opt] of Object.entries(body.data.answers)) if (onPaper.has(qid)) merged[qid] = opt
          a = { ...a, answers: merged }
          await tdb.query`UPDATE jamb_mock_attempts SET answers = ${db().json(merged)} WHERE id = ${a.id}::uuid AND submitted_at IS NULL`
        }
        a = await finalize(tdb, a)
      }
      return reply.send({ attempt: await reviewView(a) })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // STAFF VIEW OF SS3 JAMB PROGRESS
  // Proprietor & School Admin: every SS3 student. Teacher: SS3 arms they are
  // assigned to (subject assignment or class teacher; a blank arm = all arms).
  // ═══════════════════════════════════════════════════════════════════════════
  async function staffScope(request: any, reply: FastifyReply): Promise<{ all: boolean; arms: string[] } | null> {
    const role = request.user?.role
    if (role === 'proprietor' || role === 'school_admin') return { all: true, arms: [] }
    if (role !== 'teacher') { reply.status(403).send({ error: 'FORBIDDEN' }); return null }
    const tdb = tenantDb(request.schoolId)
    const rows = await tdb.query`
      SELECT class_arm FROM teacher_subject_assignments
      WHERE school_id = ${request.schoolId}::uuid AND teacher_id = ${request.user.id}::uuid AND upper(class_level) = 'SS3'
      UNION
      SELECT class_arm FROM class_teachers
      WHERE school_id = ${request.schoolId}::uuid AND teacher_id = ${request.user.id}::uuid AND upper(class_level) = 'SS3'
    ` as any[]
    if (rows.some((r: any) => !r.class_arm)) return { all: true, arms: [] }
    return { all: false, arms: rows.map((r: any) => r.class_arm) }
  }

  app.get('/jamb/cohort', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const scope = await staffScope(request, reply)
      if (!scope) return
      const tdb = tenantDb(request.schoolId)
      const all = scope.all
      const arms = scope.arms
      const students = await tdb.query`
        SELECT u.id, u.full_name, u.admission_no, u.class_arm,
               p.selected_subjects, p.total_xp, p.current_streak, p.longest_streak,
               GREATEST(p.last_study_date,
                        (SELECT MAX(m.submitted_at)::date FROM jamb_mock_attempts m
                          WHERE m.student_id = u.id AND m.school_id = u.school_id AND m.submitted_at IS NOT NULL)) AS last_study_date,
               p.total_questions_attempted, p.total_correct,
               (SELECT COUNT(*) FROM jamb_mock_attempts m WHERE m.student_id = u.id AND m.school_id = u.school_id AND m.submitted_at IS NOT NULL) AS mocks_taken,
               (SELECT MAX(utme_score) FROM jamb_mock_attempts m WHERE m.student_id = u.id AND m.school_id = u.school_id AND m.mode = 'full' AND m.submitted_at IS NOT NULL) AS best_full_mock,
               (SELECT utme_score FROM jamb_mock_attempts m WHERE m.student_id = u.id AND m.school_id = u.school_id AND m.submitted_at IS NOT NULL ORDER BY m.submitted_at DESC LIMIT 1) AS latest_mock,
               (SELECT mode FROM jamb_mock_attempts m WHERE m.student_id = u.id AND m.school_id = u.school_id AND m.submitted_at IS NOT NULL ORDER BY m.submitted_at DESC LIMIT 1) AS latest_mock_mode
        FROM users u
        LEFT JOIN jamb_student_profiles p ON p.student_id = u.id AND p.school_id = u.school_id
        WHERE u.school_id = ${request.schoolId}::uuid AND u.role = 'student' AND u.is_active = true
          AND upper(u.class_level) = 'SS3'
          AND (${all} OR u.class_arm = ANY(${arms}::text[]))
        ORDER BY u.class_arm, u.full_name
      ` as any[]

      const mastery = await tdb.query`
        SELECT jtp.student_id, jt.subject_id, ROUND(AVG(jtp.mastery_pct)) AS avg_mastery, COUNT(*) AS topics_practised
        FROM jamb_topic_progress jtp JOIN jamb_topics jt ON jt.id = jtp.topic_id
        WHERE jtp.school_id = ${request.schoolId}::uuid
        GROUP BY jtp.student_id, jt.subject_id
      ` as any[]
      const subjects = await db()`SELECT id, name FROM jamb_subjects` as any[]
      const nameOf: Record<string, string> = {}
      for (const x of subjects) nameOf[x.id] = x.name

      return reply.send({
        scope: all ? 'all' : 'assigned',
        arms,
        students: students.map((s: any) => ({
          id: s.id, fullName: s.full_name, admissionNo: s.admission_no, classArm: s.class_arm,
          started: uuidList(s.selected_subjects).length > 0,
          subjects: uuidList(s.selected_subjects).map((id: string) => {
            const m = mastery.find((x: any) => x.student_id === s.id && x.subject_id === id)
            return { id, name: nameOf[id] ?? '', mastery: m ? Number(m.avg_mastery) : null, topicsPractised: m ? Number(m.topics_practised) : 0 }
          }),
          xp: Number(s.total_xp ?? 0), streak: Number(s.current_streak ?? 0), lastStudied: s.last_study_date,
          questions: Number(s.total_questions_attempted ?? 0),
          accuracy: Number(s.total_questions_attempted ?? 0) > 0 ? Math.round(Number(s.total_correct) / Number(s.total_questions_attempted) * 100) : null,
          mocksTaken: Number(s.mocks_taken ?? 0),
          bestFullMock: s.best_full_mock === null ? null : Number(s.best_full_mock),
          latestMock: s.latest_mock === null ? null : Number(s.latest_mock), latestMockMode: s.latest_mock_mode,
        })),
      })
    })

  app.get('/jamb/cohort/:studentId', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const scope = await staffScope(request, reply)
      if (!scope) return
      const sid = String((request.params as any).studentId)
      const tdb = tenantDb(request.schoolId)
      const st = await tdb.query`
        SELECT id, full_name, admission_no, class_arm FROM users
        WHERE id = ${sid}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'student' AND upper(class_level) = 'SS3'
      ` as any[]
      if (!st[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (!scope.all && !scope.arms.includes(st[0].class_arm)) return reply.status(403).send({ error: 'NOT_YOUR_CLASS' })

      const topics = await tdb.query`
        SELECT js.name AS subject, jt.name AS topic, jtp.mastery_pct, jtp.questions_attempted, jtp.questions_correct, jtp.last_attempted_at
        FROM jamb_topic_progress jtp
        JOIN jamb_topics jt ON jt.id = jtp.topic_id
        JOIN jamb_subjects js ON js.id = jt.subject_id
        WHERE jtp.student_id = ${sid}::uuid AND jtp.school_id = ${request.schoolId}::uuid
        ORDER BY js.name, jtp.mastery_pct ASC
      ` as any[]
      const mocks = await tdb.query`
        SELECT id, mode, submitted_at, utme_score, correct, total, score_by_subject
        FROM jamb_mock_attempts
        WHERE student_id = ${sid}::uuid AND school_id = ${request.schoolId}::uuid AND submitted_at IS NOT NULL
        ORDER BY submitted_at DESC LIMIT 20
      ` as any[]
      const recent = await tdb.query`
        SELECT q.completed_at, q.session_type, q.score, q.total_questions, js.name AS subject, jt.name AS topic
        FROM jamb_quiz_sessions q
        LEFT JOIN jamb_subjects js ON js.id = q.subject_id
        LEFT JOIN jamb_topics jt ON jt.id = q.topic_id
        WHERE q.student_id = ${sid}::uuid AND q.school_id = ${request.schoolId}::uuid
        ORDER BY q.completed_at DESC LIMIT 15
      ` as any[]
      return reply.send({ student: st[0], topics, mocks, recent })
    })
}
