import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { asJson } from '../lib/json'
import { authenticate, requireRole } from '../middleware/auth'
import { QUESTION_TYPES, acceptedAnswers } from '../lib/grading'
import { asSections, levelsFor } from '../lib/classLevels'

// short_answer and fill_blank: correctAnswer holds the accepted answers, separated by "|".
// essay: no correct answer; explanation holds the marking guide the teacher sees.
const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES).default('mcq'),
  subject: z.string().trim().min(1, 'Enter the subject.').max(120),
  classLevel: z.string().trim().min(1, 'Choose the class.'),
  topic: z.string().trim().max(200).optional().nullable(),
  questionText: z.string().trim().min(1, 'Type the question.').max(5000),
  options: z.array(z.object({ key: z.string(), text: z.string().trim().max(1000) })).max(6).optional().nullable(),
  correctAnswer: z.string().max(2000).optional().default(''),
  explanation: z.string().trim().max(3000).optional().nullable(),
  marks: z.number().positive('Marks must be more than 0.').max(100).default(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
}).superRefine((d, ctx) => {
  const need = (message: string, path = 'correctAnswer') => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] })
  if (d.type === 'mcq') {
    if (!d.options || d.options.filter(o => o.text).length < 2) need('A multiple-choice question needs at least two options.', 'options')
    else if (!d.options.some(o => o.key === d.correctAnswer)) need('Choose which option is correct.')
  }
  if (d.type === 'true_false' && !['True', 'False'].includes(d.correctAnswer)) need('Choose True or False.')
  if ((d.type === 'short_answer' || d.type === 'fill_blank') && !acceptedAnswers(d.correctAnswer).length) need('Enter the correct answer.')
  if (d.type === 'fill_blank' && !/_{3,}/.test(d.questionText)) need('Mark the blank in the question with ___ (three underscores).', 'questionText')
})
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the question details.'

export async function questionRoutes(app: FastifyInstance) {
  const STAFF = [authenticate, requireRole('school_admin', 'teacher')]
  const uuid = z.string().uuid()

  // Tidy a validated question before saving
  function normalise(d: z.infer<typeof questionSchema>) {
    if (d.type === 'short_answer' || d.type === 'fill_blank') d.correctAnswer = d.correctAnswer.split('|').map(x => x.trim()).filter(Boolean).join('|')
    if (d.type === 'essay') { d.correctAnswer = ''; d.options = undefined }
    if (d.type === 'short_answer' || d.type === 'fill_blank') d.options = undefined
    if (d.type === 'true_false') d.options = [{ key: 'True', text: 'True' }, { key: 'False', text: 'False' }]
    if (d.type === 'mcq' && d.options) d.options = d.options.filter(o => o.text)
    return d
  }

  // The school's classes, so "jss1" or "primary 3" in an import becomes "JSS1" / "Primary 3"
  async function schoolLevels(tdb: any, schoolId: string): Promise<string[]> {
    const [s] = await tdb.query`SELECT sections FROM schools WHERE id = ${schoolId}::uuid` as any[]
    return levelsFor(asSections(s?.sections))
  }
  const matchLevel = (levels: string[], v: string) => levels.find(l => l.toLowerCase().replace(/\s+/g, '') === String(v ?? '').toLowerCase().replace(/\s+/g, '')) ?? null

  // A question is "in use" once students have started an exam containing it.
  // Its answer, options, type and marks then can't change (it would change their marks).
  async function inUse(tdb: any, schoolId: string, id: string): Promise<boolean> {
    const [r] = await tdb.query`
      SELECT EXISTS (
        SELECT 1 FROM exams e JOIN exam_sessions es ON es.exam_id = e.id
        WHERE e.school_id = ${schoolId}::uuid AND ${id}::uuid = ANY(e.question_ids)
      ) AS used
    ` as any[]
    return !!r?.used
  }

  async function ownQuestion(request: any, reply: any, id: string) {
    if (!uuid.safeParse(id).success) { reply.status(404).send({ error: 'NOT_FOUND' }); return null }
    const tdb = tenantDb(request.schoolId)
    const [q] = await tdb.query`
      SELECT * FROM questions WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND is_active = true
    ` as any[]
    if (!q) { reply.status(404).send({ error: 'NOT_FOUND', message: 'Question not found.' }); return null }
    if (request.user.role === 'teacher' && q.created_by !== request.user.id) {
      reply.status(403).send({ error: 'NOT_OWNER', message: 'You can only change questions you added. Use Duplicate to make your own copy.' }); return null
    }
    return { tdb, q }
  }

  // ── Search the question bank ──────────────────────────────────────────────
  // ?subject= &classLevel= &type= &q=(text or topic) &mine=1 &limit= &offset=
  app.get('/questions', { preHandler: STAFF }, async (request: any, reply: any) => {
    const qs = request.query as any
    const subject = qs.subject || null, classLevel = qs.classLevel || null
    const type = QUESTION_TYPES.includes(qs.type) ? qs.type : null
    const text = qs.q ? `%${String(qs.q).trim().replace(/[%_\\]/g, '\\$&')}%` : null
    const mine = qs.mine === '1' || qs.mine === 'true' ? request.user.id : null
    const limit = Math.min(Math.max(parseInt(qs.limit) || 50, 1), 500)
    const offset = Math.max(parseInt(qs.offset) || 0, 0)
    const tdb = tenantDb(request.schoolId)
    const rows = await tdb.query`
      SELECT q.id, q.type, q.subject, q.class_level, q.topic, q.question_text, q.options, q.correct_answer,
             q.explanation, q.marks, q.difficulty, q.created_by, u.full_name AS created_by_name, q.created_at,
             COUNT(*) OVER () AS total
      FROM questions q JOIN users u ON u.id = q.created_by
      WHERE q.school_id = ${request.schoolId}::uuid AND q.is_active = true
        AND (${subject}::text IS NULL OR q.subject = ${subject})
        AND (${classLevel}::text IS NULL OR q.class_level = ${classLevel})
        AND (${type}::text IS NULL OR q.type = ${type})
        AND (${text}::text IS NULL OR q.question_text ILIKE ${text} OR q.topic ILIKE ${text})
        AND (${mine}::uuid IS NULL OR q.created_by = ${mine}::uuid)
      ORDER BY q.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    ` as any[]
    const subjects = await tdb.query`
      SELECT DISTINCT subject FROM questions WHERE school_id = ${request.schoolId}::uuid AND is_active = true ORDER BY subject
    ` as any[]
    return reply.send({
      questions: rows.map(({ total, ...r }: any) => ({ ...r, options: asJson(r.options, null), canEdit: request.user.role === 'school_admin' || r.created_by === request.user.id })),
      total: Number(rows[0]?.total ?? 0), limit, offset,
      subjects: subjects.map((r: any) => r.subject),
    })
  })

  // ── One question (for editing) ────────────────────────────────────────────
  app.get('/questions/:id', { preHandler: STAFF }, async (request: any, reply: any) => {
    const { id } = request.params as any
    if (!uuid.safeParse(id).success) return reply.status(404).send({ error: 'NOT_FOUND' })
    const tdb = tenantDb(request.schoolId)
    const [q] = await tdb.query`
      SELECT q.*, u.full_name AS created_by_name FROM questions q JOIN users u ON u.id = q.created_by
      WHERE q.id = ${id}::uuid AND q.school_id = ${request.schoolId}::uuid AND q.is_active = true
    ` as any[]
    if (!q) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Question not found.' })
    return reply.send({
      question: { ...q, options: asJson(q.options, null) },
      canEdit: request.user.role === 'school_admin' || q.created_by === request.user.id,
      inUse: await inUse(tdb, request.schoolId, id),
    })
  })

  app.post('/questions', { preHandler: STAFF }, async (request: any, reply: any) => {
    const body = questionSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: firstIssue(body.error), issues: body.error.flatten() })
    const d = normalise(body.data)
    const tdb = tenantDb(request.schoolId)
    const levels = await schoolLevels(tdb, request.schoolId)
    const level = matchLevel(levels, d.classLevel)
    if (!level) return reply.status(400).send({ error: 'UNKNOWN_CLASS', message: `${d.classLevel} isn’t one of this school’s classes.` })
    const rows = await tdb.query`
      INSERT INTO questions (school_id, created_by, type, subject, class_level, topic,
        question_text, options, correct_answer, explanation, marks, difficulty)
      VALUES (${request.schoolId}, ${request.user.id}, ${d.type}, ${d.subject}, ${level},
        ${d.topic || null}, ${d.questionText},
        ${d.options ? db().json(d.options) : null}::jsonb,
        ${d.correctAnswer}, ${d.explanation || null}, ${d.marks}, ${d.difficulty ?? null})
      RETURNING id
    ` as any[]
    return reply.status(201).send({ questionId: rows[0].id })
  })

  // ── Edit (your own; School Admin any) ─────────────────────────────────────
  app.put('/questions/:id', { preHandler: STAFF }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const own = await ownQuestion(request, reply, id); if (!own) return
    const { tdb, q } = own
    const body = questionSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: firstIssue(body.error), issues: body.error.flatten() })
    const d = normalise(body.data)
    const level = matchLevel(await schoolLevels(tdb, request.schoolId), d.classLevel)
    if (!level) return reply.status(400).send({ error: 'UNKNOWN_CLASS', message: `${d.classLevel} isn’t one of this school’s classes.` })
    const sameMarking = d.type === q.type && Number(d.marks) === Number(q.marks)
      && String(d.correctAnswer ?? '') === String(q.correct_answer ?? '')
      && JSON.stringify(d.options ?? null) === JSON.stringify(asJson(q.options, null))
    if (!sameMarking && await inUse(tdb, request.schoolId, id)) {
      return reply.status(409).send({ error: 'IN_USE', message: 'Students have already sat an exam with this question, so its answer, options, type and marks can’t change (it would change their marks). You can still fix the wording, topic and explanation, or use Duplicate to make a changed copy.' })
    }
    await tdb.query`
      UPDATE questions SET type = ${d.type}, subject = ${d.subject}, class_level = ${level}, topic = ${d.topic || null},
        question_text = ${d.questionText}, options = ${d.options ? db().json(d.options) : null}::jsonb,
        correct_answer = ${d.correctAnswer}, explanation = ${d.explanation || null}, marks = ${d.marks},
        difficulty = ${d.difficulty ?? null}, updated_at = now()
      WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
    `
    return reply.send({ updated: true })
  })

  // ── Duplicate (any question in the school → your own copy) ────────────────
  app.post('/questions/:id/duplicate', { preHandler: STAFF }, async (request: any, reply: any) => {
    const { id } = request.params as any
    if (!uuid.safeParse(id).success) return reply.status(404).send({ error: 'NOT_FOUND' })
    const tdb = tenantDb(request.schoolId)
    const rows = await tdb.query`
      INSERT INTO questions (school_id, created_by, type, subject, class_level, topic, question_text, image_url,
        options, correct_answer, explanation, marks, difficulty)
      SELECT school_id, ${request.user.id}::uuid, type, subject, class_level, topic, question_text, image_url,
        options, correct_answer, explanation, marks, difficulty
      FROM questions WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND is_active = true
      RETURNING id
    ` as any[]
    if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Question not found.' })
    return reply.status(201).send({ questionId: rows[0].id })
  })

  // ── Remove from the bank (your own; School Admin any) ─────────────────────
  // Exams that already include it keep it; it just stops appearing in the bank.
  app.delete('/questions/:id', { preHandler: STAFF }, async (request: any, reply: any) => {
    const { id } = request.params as any
    const own = await ownQuestion(request, reply, id); if (!own) return
    await own.tdb.query`UPDATE questions SET is_active = false, updated_at = now() WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
    return reply.send({ deleted: true })
  })

  // ── Import from a spreadsheet (CSV rows, parsed in the browser) ───────────
  // Columns: type, subject, class, topic, question, option_a … option_e, answer, marks, difficulty, explanation
  // dryRun: check every row and report; otherwise import. Nothing is imported if any row has a problem.
  app.post('/questions/import', { preHandler: STAFF }, async (request: any, reply: any) => {
    const body = z.object({ rows: z.array(z.record(z.any())).min(1, 'The file has no questions.').max(1000, 'Import at most 1,000 questions at a time.'), dryRun: z.boolean().optional().default(false) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: firstIssue(body.error) })
    const tdb = tenantDb(request.schoolId)
    const levels = await schoolLevels(tdb, request.schoolId)
    const existing = await tdb.query`
      SELECT lower(regexp_replace(trim(question_text), '[[:space:]]+', ' ', 'g')) || '|' || lower(subject) || '|' || class_level AS k
      FROM questions WHERE school_id = ${request.schoolId}::uuid AND is_active = true
    ` as any[]
    const seen = new Set(existing.map((r: any) => r.k))
    const TYPE_WORDS: Record<string, string> = {
      mcq: 'mcq', 'multiple choice': 'mcq', 'multiple-choice': 'mcq', objective: 'mcq',
      true_false: 'true_false', 'true/false': 'true_false', 'true false': 'true_false', tf: 'true_false',
      short_answer: 'short_answer', 'short answer': 'short_answer',
      fill_blank: 'fill_blank', 'fill in the blank': 'fill_blank', 'fill in blank': 'fill_blank', 'fill-in-the-blank': 'fill_blank', blank: 'fill_blank',
      essay: 'essay', theory: 'essay',
    }
    const errors: { row: number; message: string }[] = []
    const duplicates: number[] = []
    const ready: any[] = []
    body.data.rows.forEach((raw, i) => {
      const rowNo = i + 2   // row 1 is the header
      const r: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) r[k.toLowerCase().trim().replace(/[\s-]+/g, '_')] = String(v ?? '').trim()
      if (!Object.values(r).some(Boolean)) return                       // blank line
      const type = TYPE_WORDS[(r.type || 'mcq').toLowerCase()]
      if (!type) { errors.push({ row: rowNo, message: `Unknown type “${r.type}”. Use mcq, true_false, short_answer, fill_blank or essay.` }); return }
      const level = matchLevel(levels, r.class || r.class_level)
      if (!level) { errors.push({ row: rowNo, message: (r.class || r.class_level) ? `“${r.class || r.class_level}” isn’t one of this school’s classes.` : 'Class is missing.' }); return }
      let options: { key: string; text: string }[] | undefined
      let answer = r.answer ?? ''
      if (type === 'mcq') {
        options = ['a', 'b', 'c', 'd', 'e'].map(l => ({ key: l.toUpperCase(), text: r[`option_${l}`] ?? '' })).filter(o => o.text)
        options = options.map((o, j) => ({ key: String.fromCharCode(65 + j), text: o.text }))     // no gaps
        const byLetter = /^[a-e]$/i.test(answer) ? answer.toUpperCase() : null
        const byText = options.find(o => o.text.toLowerCase() === answer.toLowerCase())?.key ?? null
        answer = byLetter ?? byText ?? answer
      }
      if (type === 'true_false') answer = /^(t|true|yes)$/i.test(answer) ? 'True' : /^(f|false|no)$/i.test(answer) ? 'False' : answer
      const marks = r.marks ? Number(r.marks) : 1
      const difficulty = (r.difficulty || '').toLowerCase() || undefined
      const parsed = questionSchema.safeParse({
        type, subject: r.subject, classLevel: level, topic: r.topic || undefined, questionText: r.question || r.question_text,
        options, correctAnswer: answer, explanation: r.explanation || r.marking_guide || undefined,
        marks: Number.isFinite(marks) ? marks : -1, difficulty: ['easy', 'medium', 'hard'].includes(difficulty ?? '') ? difficulty : undefined,
      })
      if (!parsed.success) { errors.push({ row: rowNo, message: firstIssue(parsed.error) }); return }
      const d = normalise(parsed.data)
      const k = `${d.questionText.toLowerCase().replace(/\s+/g, ' ')}|${d.subject.toLowerCase()}|${level}`
      if (seen.has(k)) { duplicates.push(rowNo); return }
      seen.add(k)
      ready.push({ ...d, classLevel: level })
    })
    const summary = { rows: body.data.rows.length, toImport: ready.length, duplicates, errors }
    if (body.data.dryRun || errors.length) {
      return reply.status(errors.length && !body.data.dryRun ? 400 : 200).send({ ...summary, imported: 0,
        ...(errors.length && !body.data.dryRun ? { error: 'IMPORT_ERRORS', message: 'Nothing was imported. Fix the rows listed and upload the file again.' } : {}) })
    }
    await tdb.transaction(async (tx: any) => {
      for (const d of ready) {
        await tx`
          INSERT INTO questions (school_id, created_by, type, subject, class_level, topic, question_text, options,
            correct_answer, explanation, marks, difficulty)
          VALUES (${request.schoolId}::uuid, ${request.user.id}::uuid, ${d.type}, ${d.subject}, ${d.classLevel}, ${d.topic || null},
            ${d.questionText}, ${d.options ? db().json(d.options) : null}::jsonb, ${d.correctAnswer}, ${d.explanation || null},
            ${d.marks}, ${d.difficulty ?? null})
        `
      }
    })
    return reply.send({ ...summary, imported: ready.length })
  })
}
