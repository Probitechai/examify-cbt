import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function interactiveRoutes(app: FastifyInstance) {

  // ── FLASHCARDS ────────────────────────────────────────────────────────────

  app.get('/lessons/:lessonId/flashcards', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { lessonId } = request.params as any
      const lid = String(lessonId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT id, front, back, hint, sort_order
        FROM lesson_flashcards
        WHERE lesson_id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid
        ORDER BY sort_order ASC, created_at ASC
      ` as any[]
      return reply.send({ flashcards: rows })
    })

  app.post('/lessons/:lessonId/flashcards', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { lessonId } = request.params as any
      const schema = z.object({
        cards: z.array(z.object({
          front: z.string().min(1),
          back: z.string().min(1),
          hint: z.string().optional(),
        })).min(1),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const lid = String(lessonId)
      const tdb = tenantDb(request.schoolId)

      let saved = 0
      for (let i = 0; i < body.data.cards.length; i++) {
        const card = body.data.cards[i]
        const front = card.front
        const back = card.back
        const hint = card.hint ?? null
        const order = i
        await tdb.query`
          INSERT INTO lesson_flashcards (school_id, lesson_id, front, back, hint, sort_order)
          VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${front}, ${back}, ${hint}, ${order})
        `
        saved++
      }
      return reply.status(201).send({ saved })
    })

  app.delete('/lessons/flashcards/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const fid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM lesson_flashcards WHERE id = ${fid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── INLINE QUIZZES ────────────────────────────────────────────────────────

  app.get('/lessons/:lessonId/inline-quizzes', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { lessonId } = request.params as any
      const lid = String(lessonId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT id, question, option_a, option_b, option_c, option_d,
               correct_option, explanation, sort_order
        FROM lesson_inline_quizzes
        WHERE lesson_id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid
        ORDER BY sort_order ASC, created_at ASC
      ` as any[]
      return reply.send({ quizzes: rows })
    })

  app.post('/lessons/:lessonId/inline-quizzes', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { lessonId } = request.params as any
      const schema = z.object({
        question: z.string().min(1),
        optionA: z.string().min(1),
        optionB: z.string().min(1),
        optionC: z.string().optional(),
        optionD: z.string().optional(),
        correctOption: z.enum(['a', 'b', 'c', 'd']),
        explanation: z.string().optional(),
        sortOrder: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const lid = String(lessonId)
      const q = d.question
      const oa = d.optionA
      const ob = d.optionB
      const oc = d.optionC ?? null
      const od = d.optionD ?? null
      const co = d.correctOption
      const exp = d.explanation ?? null
      const so = d.sortOrder ?? 0
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO lesson_inline_quizzes (school_id, lesson_id, question, option_a, option_b, option_c, option_d, correct_option, explanation, sort_order)
        VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${q}, ${oa}, ${ob}, ${oc}, ${od}, ${co}, ${exp}, ${so})
        RETURNING id, question, sort_order
      ` as any[]
      return reply.status(201).send({ quiz: rows[0] })
    })

  app.delete('/lessons/inline-quizzes/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const qid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM lesson_inline_quizzes WHERE id = ${qid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })
}
