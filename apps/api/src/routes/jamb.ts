import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
// Note: jamb_subjects and jamb_topics are global tables, jamb_student_profiles etc are tenant-scoped

export async function jambRoutes(app: FastifyInstance) {

  // GET ALL JAMB SUBJECTS WITH TOPIC COUNTS
  app.get('/jamb/subjects', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const rows = await db()`
        SELECT js.*, COUNT(jt.id) AS topic_count
        FROM jamb_subjects js
        LEFT JOIN jamb_topics jt ON jt.subject_id = js.id
        GROUP BY js.id
        ORDER BY js.is_compulsory DESC, js.name ASC
      ` as any[]
      return reply.send({ subjects: rows })
    })

  // GET TOPICS FOR A SUBJECT
  app.get('/jamb/subjects/:subjectId/topics', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { subjectId } = request.params as any
      const sid = String(subjectId)
      const rows = await db()`
        SELECT jt.*, COUNT(jpq.id) AS question_count
        FROM jamb_topics jt
        LEFT JOIN jamb_past_questions jpq ON jpq.topic_id = jt.id
        WHERE jt.subject_id = ${sid}::uuid
        GROUP BY jt.id
        ORDER BY jt.sort_order ASC
      ` as any[]
      return reply.send({ topics: rows })
    })

  // GET STUDENT PROFILE
  app.get('/jamb/profile', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT * FROM jamb_student_profiles
        WHERE student_id = ${uid}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      return reply.send({ profile: rows[0] ?? null })
    })

  // CREATE/UPDATE STUDENT PROFILE
  app.post('/jamb/profile', { preHandler: [authenticate] },
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
      const uid = request.user.id
      const subs = d.selectedSubjects
      const ts = d.targetScore
      const ed = d.examDate ?? null
      const dg = d.dailyGoalQuestions
      const tdb = tenantDb(request.schoolId)

      const rows = await tdb.query`
        INSERT INTO jamb_student_profiles (school_id, student_id, selected_subjects, target_score, exam_date, daily_goal_questions)
        VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${subs}::uuid[], ${ts}, ${ed}, ${dg})
        ON CONFLICT (school_id, student_id) DO UPDATE SET
          selected_subjects = ${subs}::uuid[],
          target_score = ${ts},
          exam_date = ${ed},
          daily_goal_questions = ${dg},
          updated_at = now()
        RETURNING *
      ` as any[]
      return reply.send({ profile: rows[0] })
    })

  // GET TOPIC PROGRESS FOR STUDENT
  app.get('/jamb/progress', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT jtp.*, jt.name AS topic_name, js.name AS subject_name, js.color AS subject_color
        FROM jamb_topic_progress jtp
        JOIN jamb_topics jt ON jt.id = jtp.topic_id
        JOIN jamb_subjects js ON js.id = jt.subject_id
        WHERE jtp.student_id = ${uid}::uuid AND jtp.school_id = ${request.schoolId}::uuid
        ORDER BY jtp.mastery_pct DESC
      ` as any[]
      return reply.send({ progress: rows })
    })

  // GET PAST QUESTIONS FOR A TOPIC/SUBJECT
  app.get('/jamb/questions', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { subjectId, topicId, year, limit } = request.query as any
      const lim = Math.min(Number(limit ?? 20), 50)

      let rows: any[]
      if (topicId) {
        const tid = String(topicId)
        rows = await db()`
          SELECT id, question, option_a, option_b, option_c, option_d, correct_option, explanation, year, difficulty_level
          FROM jamb_past_questions
          WHERE topic_id = ${tid}::uuid
          ORDER BY RANDOM()
          LIMIT ${lim}
        ` as any[]
      } else if (subjectId && year) {
        const sid = String(subjectId)
        const yr = Number(year)
        rows = await db()`
          SELECT id, question, option_a, option_b, option_c, option_d, correct_option, explanation, year, difficulty_level
          FROM jamb_past_questions
          WHERE subject_id = ${sid}::uuid AND year = ${yr}
          ORDER BY RANDOM()
          LIMIT ${lim}
        ` as any[]
      } else if (subjectId) {
        const sid = String(subjectId)
        rows = await db()`
          SELECT id, question, option_a, option_b, option_c, option_d, correct_option, explanation, year, difficulty_level
          FROM jamb_past_questions
          WHERE subject_id = ${sid}::uuid
          ORDER BY RANDOM()
          LIMIT ${lim}
        ` as any[]
      } else {
        rows = []
      }
      return reply.send({ questions: rows })
    })

  // SAVE QUIZ SESSION + UPDATE PROGRESS
  app.post('/jamb/sessions', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectId: z.string().uuid(),
        topicId: z.string().uuid().optional(),
        sessionType: z.enum(['practice', 'past_questions', 'ai_generated', 'mock_exam']),
        questions: z.array(z.any()),
        answers: z.record(z.string()),
        score: z.number(),
        totalQuestions: z.number(),
        timeTakenSecs: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const uid = request.user.id
      const sid = d.subjectId
      const tid = d.topicId ?? null
      const st = d.sessionType
      const qs = JSON.stringify(d.questions)
      const ans = JSON.stringify(d.answers)
      const score = d.score
      const total = d.totalQuestions
      const time = d.timeTakenSecs ?? null
      const pct = total > 0 ? Math.round((score / total) * 100) : 0
      const xp = Math.round(score * 10 + (pct >= 80 ? 50 : pct >= 60 ? 25 : 0))
      const tdb = tenantDb(request.schoolId)

      // Save session
      await tdb.query`
        INSERT INTO jamb_quiz_sessions (school_id, student_id, subject_id, topic_id, session_type, questions, answers, score, total_questions, time_taken_secs, xp_earned, completed_at)
        VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${sid}::uuid, ${tid ? `${tid}::uuid` : null}, ${st}, ${qs}::jsonb, ${ans}::jsonb, ${score}, ${total}, ${time}, ${xp}, now())
      `

      // Update topic progress
      if (tid) {
        await tdb.query`
          INSERT INTO jamb_topic_progress (school_id, student_id, topic_id, questions_attempted, questions_correct, mastery_pct, last_attempted_at)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${tid}::uuid, ${total}, ${score}, ${pct}, now())
          ON CONFLICT (school_id, student_id, topic_id) DO UPDATE SET
            questions_attempted = jamb_topic_progress.questions_attempted + ${total},
            questions_correct = jamb_topic_progress.questions_correct + ${score},
            mastery_pct = LEAST(100, ROUND(((jamb_topic_progress.questions_correct + ${score})::numeric / NULLIF(jamb_topic_progress.questions_attempted + ${total}, 0)) * 100)),
            last_attempted_at = now(),
            updated_at = now()
        `
      }

      // Update student profile stats + streak
      await tdb.query`
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
            ELSE 1
          END),
          last_study_date = CURRENT_DATE,
          updated_at = now()
        WHERE student_id = ${uid}::uuid AND school_id = ${request.schoolId}::uuid
      `

      return reply.send({ saved: true, xpEarned: xp, pct })
    })

  // AI TOPIC SUMMARY
  app.post('/jamb/ai/summary', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectName: z.string(),
        topicName: z.string(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { subjectName, topicName } = body.data
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
      if (!ANTHROPIC_API_KEY) return reply.status(500).send({ error: 'AI not configured' })

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Write a concise, student-friendly study summary for JAMB exam preparation on "${topicName}" in ${subjectName}. Structure it with: 1) Key Concepts (bullet points), 2) Important Formulas or Rules (if applicable), 3) Common JAMB Question Patterns, 4) Quick Tips to Remember. Keep it under 400 words. Use simple language suitable for a Nigerian SS3 student.`
          }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text ?? 'Could not generate summary.'
      return reply.send({ summary: text })
    })

  // AI QUIZ GENERATION
  app.post('/jamb/ai/quiz', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectName: z.string(),
        topicName: z.string(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { subjectName, topicName } = body.data
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
      if (!ANTHROPIC_API_KEY) return reply.status(500).send({ error: 'AI not configured' })

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Generate exactly 10 multiple choice questions for JAMB exam preparation on the topic "${topicName}" in ${subjectName}. Return ONLY a JSON array with no markdown, no explanation, no backticks. Each object must have: question (string), option_a, option_b, option_c, option_d (strings), correct_option ("a"|"b"|"c"|"d"), explanation (string, 1-2 sentences). Questions should vary in difficulty. Make them realistic JAMB-style questions.`
          }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text ?? '[]'
      const clean = text.replace(/```json|```/g, '').trim()
      try {
        const questions = JSON.parse(clean)
        return reply.send({ questions })
      } catch {
        return reply.status(500).send({ error: 'Failed to parse AI response' })
      }
    })

  // ADD PAST QUESTION (admin)
  app.post('/jamb/questions', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectId: z.string().uuid(),
        topicId: z.string().uuid().optional(),
        year: z.number().int().min(2000).max(2030),
        question: z.string().min(1),
        optionA: z.string().min(1),
        optionB: z.string().min(1),
        optionC: z.string().min(1),
        optionD: z.string().min(1),
        correctOption: z.enum(['a', 'b', 'c', 'd']),
        explanation: z.string().optional(),
        difficultyLevel: z.enum(['easy', 'medium', 'hard']).default('medium'),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const subid = d.subjectId
      const tid = d.topicId ?? null
      const yr = d.year
      const q = d.question
      const oa = d.optionA
      const ob = d.optionB
      const oc = d.optionC
      const od = d.optionD
      const co = d.correctOption
      const exp = d.explanation ?? null
      const dl = d.difficultyLevel

      if (tid) {
        await db()`
          INSERT INTO jamb_past_questions (subject_id, topic_id, year, question, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty_level)
          VALUES (${subid}::uuid, ${tid}::uuid, ${yr}, ${q}, ${oa}, ${ob}, ${oc}, ${od}, ${co}, ${exp}, ${dl})
        `
      } else {
        await db()`
          INSERT INTO jamb_past_questions (subject_id, year, question, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty_level)
          VALUES (${subid}::uuid, ${yr}, ${q}, ${oa}, ${ob}, ${oc}, ${od}, ${co}, ${exp}, ${dl})
        `
      }
      return reply.status(201).send({ saved: true })
    })
    // AI TOPIC SUMMARY
  app.post('/jamb/ai/summary', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectName: z.string(),
        topicName: z.string(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { subjectName, topicName } = body.data
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
      if (!ANTHROPIC_API_KEY) return reply.status(500).send({ error: 'AI not configured' })
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: `Write a concise, student-friendly study summary for JAMB exam preparation on "${topicName}" in ${subjectName}. Structure it with: 1) Key Concepts (bullet points), 2) Important Formulas or Rules (if applicable), 3) Common JAMB Question Patterns, 4) Quick Tips to Remember. Keep it under 400 words. Use simple language suitable for a Nigerian SS3 student.` }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text ?? 'Could not generate summary.'
      return reply.send({ summary: text })
    })

  // AI QUIZ GENERATION
  app.post('/jamb/ai/quiz', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectName: z.string(),
        topicName: z.string(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { subjectName, topicName } = body.data
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
      if (!ANTHROPIC_API_KEY) return reply.status(500).send({ error: 'AI not configured' })
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content: `Generate exactly 10 multiple choice questions for JAMB exam preparation on the topic "${topicName}" in ${subjectName}. Return ONLY a JSON array with no markdown, no explanation, no backticks. Each object must have: question (string), option_a, option_b, option_c, option_d (strings), correct_option ("a"|"b"|"c"|"d"), explanation (string, 1-2 sentences). Questions should vary in difficulty. Make them realistic JAMB-style questions.` }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text ?? '[]'
      const clean = text.replace(/```json|```/g, '').trim()
      try {
        const questions = JSON.parse(clean)
        return reply.send({ questions })
      } catch {
        return reply.status(500).send({ error: 'Failed to parse AI response' })
      }
    })
}
