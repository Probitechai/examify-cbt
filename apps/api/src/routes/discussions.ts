import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function discussionRoutes(app: FastifyInstance) {

  // GET DISCUSSIONS FOR A LESSON
  app.get('/lessons/:lessonId/discussions', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { lessonId } = request.params as any
      const lid = String(lessonId)
      const tdb = tenantDb(request.schoolId)

      // Get top-level questions
      const questions = await tdb.query`
        SELECT ld.*, u.full_name AS user_name, u.role AS user_role
        FROM lesson_discussions ld
        JOIN users u ON u.id = ld.user_id
        WHERE ld.lesson_id = ${lid}::uuid
        AND ld.school_id = ${request.schoolId}::uuid
        AND ld.parent_id IS NULL
        ORDER BY ld.is_pinned DESC, ld.created_at ASC
      ` as any[]

      // Get all replies
      const replies = await tdb.query`
        SELECT ld.*, u.full_name AS user_name, u.role AS user_role
        FROM lesson_discussions ld
        JOIN users u ON u.id = ld.user_id
        WHERE ld.lesson_id = ${lid}::uuid
        AND ld.school_id = ${request.schoolId}::uuid
        AND ld.parent_id IS NOT NULL
        ORDER BY ld.created_at ASC
      ` as any[]

      // Attach replies to questions
      const result = questions.map((q: any) => ({
        ...q,
        replies: replies.filter((r: any) => r.parent_id === q.id)
      }))

      return reply.send({ discussions: result })
    })

  // POST A QUESTION OR REPLY
  app.post('/lessons/:lessonId/discussions', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { lessonId } = request.params as any
      const schema = z.object({
        content: z.string().min(1),
        parentId: z.string().uuid().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const lid = String(lessonId)
      const content = body.data.content
      const parentId = body.data.parentId ?? null
      const uid = request.user.id
      const role = request.user.role
      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (parentId) {
        rows = await tdb.query`
          INSERT INTO lesson_discussions (school_id, lesson_id, parent_id, user_id, user_role, content)
          VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${parentId}::uuid, ${uid}::uuid, ${role}, ${content})
          RETURNING id, content, created_at
        ` as any[]

        // Mark parent question as answered
        await tdb.query`
          UPDATE lesson_discussions SET is_answered = true
          WHERE id = ${parentId}::uuid AND school_id = ${request.schoolId}::uuid
        `
      } else {
        rows = await tdb.query`
          INSERT INTO lesson_discussions (school_id, lesson_id, user_id, user_role, content)
          VALUES (${request.schoolId}::uuid, ${lid}::uuid, ${uid}::uuid, ${role}, ${content})
          RETURNING id, content, created_at
        ` as any[]
      }

      return reply.status(201).send({ discussion: rows[0] })
    })

  // PIN/UNPIN A QUESTION (teacher/admin only)
  app.patch('/lessons/discussions/:id/pin', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const did = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE lesson_discussions SET is_pinned = NOT is_pinned
        WHERE id = ${did}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ updated: true })
    })

  // DELETE A DISCUSSION
  app.delete('/lessons/discussions/:id', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const did = String(id)
      const uid = request.user.id
      const role = request.user.role
      const tdb = tenantDb(request.schoolId)

      // Only owner or admin/teacher can delete
      if (role === 'school_admin' || role === 'teacher') {
        await tdb.query`DELETE FROM lesson_discussions WHERE id = ${did}::uuid AND school_id = ${request.schoolId}::uuid`
      } else {
        await tdb.query`DELETE FROM lesson_discussions WHERE id = ${did}::uuid AND school_id = ${request.schoolId}::uuid AND user_id = ${uid}::uuid`
      }
      return reply.send({ deleted: true })
    })
}
