import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { QUESTION_TYPES, acceptedAnswers } from '../lib/grading'

// short_answer and fill_blank: correctAnswer holds the accepted answers, separated by "|".
// essay: no correct answer; explanation holds the marking guide the teacher sees.
const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES).default('mcq'),
  subject: z.string().min(1),
  classLevel: z.string().min(1),
  topic: z.string().optional(),
  questionText: z.string().min(1),
  options: z.array(z.object({ key: z.string(), text: z.string() })).optional(),
  correctAnswer: z.string().max(2000).optional().default(''),
  explanation: z.string().optional(),
  marks: z.number().positive().default(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
}).superRefine((d, ctx) => {
  const need = (message: string, path = 'correctAnswer') => ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [path] })
  if (d.type === 'mcq') {
    if (!d.options || d.options.length < 2) need('A multiple-choice question needs at least two options.', 'options')
    else if (!d.options.some(o => o.key === d.correctAnswer)) need('Choose which option is correct.')
  }
  if (d.type === 'true_false' && !['True', 'False'].includes(d.correctAnswer)) need('Choose True or False.')
  if ((d.type === 'short_answer' || d.type === 'fill_blank') && !acceptedAnswers(d.correctAnswer).length) need('Enter the correct answer.')
  if (d.type === 'fill_blank' && !/_{3,}/.test(d.questionText)) need('Mark the blank in the question with ___ (three underscores).', 'questionText')
})
const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the question details.'

export async function questionRoutes(app: FastifyInstance) {

  app.get('/questions', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const query = request.query as any
      const tdb = tenantDb(request.schoolId)
      const questions = await tdb.query`
        SELECT q.id, q.type, q.subject, q.class_level, q.topic,
               q.question_text, q.correct_answer, q.marks, q.difficulty,
               u.full_name AS created_by_name, q.created_at
        FROM questions q JOIN users u ON u.id = q.created_by
        WHERE q.school_id = ${request.schoolId}::uuid AND q.is_active = true
        ORDER BY q.created_at DESC
        LIMIT 100
      `
      return reply.send({ questions })
    })

  app.post('/questions', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const body = questionSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: firstIssue(body.error), issues: body.error.flatten() })

      const d = body.data
      // Keep accepted answers tidy: "Abuja | FCT Abuja" → "Abuja|FCT Abuja"
      if (d.type === 'short_answer' || d.type === 'fill_blank') d.correctAnswer = d.correctAnswer.split('|').map(x => x.trim()).filter(Boolean).join('|')
      if (d.type === 'essay') { d.correctAnswer = ''; d.options = undefined }
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO questions (school_id, created_by, type, subject, class_level, topic,
          question_text, options, correct_answer, explanation, marks, difficulty)
        VALUES (${request.schoolId}, ${request.user.id}, ${d.type}, ${d.subject}, ${d.classLevel},
          ${d.topic ?? null}, ${d.questionText},
          ${d.options ? db().json(d.options) : null}::jsonb,
          ${d.correctAnswer}, ${d.explanation ?? null}, ${d.marks}, ${d.difficulty ?? null})
        RETURNING id
      ` as any[]
      return reply.status(201).send({ questionId: rows[0].id })
    })

  app.delete('/questions/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`UPDATE questions SET is_active = false WHERE id = ${id}`
      return reply.send({ deleted: true })
    })
}
