import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

const questionSchema = z.object({
  type: z.enum(['mcq', 'true_false', 'short_answer']).default('mcq'),
  subject: z.string().min(1),
  classLevel: z.string().min(1),
  topic: z.string().optional(),
  questionText: z.string().min(1),
  options: z.array(z.object({ key: z.string(), text: z.string() })).optional(),
  correctAnswer: z.string().min(1),
  explanation: z.string().optional(),
  marks: z.number().positive().default(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
})

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
        WHERE q.is_active = true
        ORDER BY q.created_at DESC
        LIMIT 100
      `
      return reply.send({ questions })
    })

  app.post('/questions', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const body = questionSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO questions (school_id, created_by, type, subject, class_level, topic,
          question_text, options, correct_answer, explanation, marks, difficulty)
        VALUES (${request.schoolId}, ${request.user.id}, ${d.type}, ${d.subject}, ${d.classLevel},
          ${d.topic ?? null}, ${d.questionText},
          ${d.options ? JSON.stringify(d.options) : null}::jsonb,
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
