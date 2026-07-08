import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function announcementRoutes(app: FastifyInstance) {

  // ── List announcements ────────────────────────────────────────────────────
  app.get('/announcements', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const role = request.user.role

      // Filter by audience — show announcements targeted at this user's role
      // 'all' announcements always show to everyone
      let announcements: any[]

      if (role === 'school_admin') {
        announcements = await tdb.query`
          SELECT a.id, a.title, a.body, a.audience, a.created_at,
                 u.full_name AS posted_by_name
          FROM announcements a
          JOIN users u ON u.id = a.posted_by
          WHERE a.school_id = ${request.schoolId}::uuid
          ORDER BY a.created_at DESC
          LIMIT 50
        ` as any[]
      } else if (role === 'parent') {
        announcements = await tdb.query`
          SELECT a.id, a.title, a.body, a.audience, a.created_at,
                 u.full_name AS posted_by_name
          FROM announcements a
          JOIN users u ON u.id = a.posted_by
          WHERE a.school_id = ${request.schoolId}::uuid
          AND a.audience IN ('all', 'parents')
          ORDER BY a.created_at DESC
          LIMIT 50
        ` as any[]
      } else if (role === 'teacher') {
        announcements = await tdb.query`
          SELECT a.id, a.title, a.body, a.audience, a.created_at,
                 u.full_name AS posted_by_name
          FROM announcements a
          JOIN users u ON u.id = a.posted_by
          WHERE a.school_id = ${request.schoolId}::uuid
          AND a.audience IN ('all', 'teachers')
          ORDER BY a.created_at DESC
          LIMIT 50
        ` as any[]
      } else {
        announcements = await tdb.query`
          SELECT a.id, a.title, a.body, a.audience, a.created_at,
                 u.full_name AS posted_by_name
          FROM announcements a
          JOIN users u ON u.id = a.posted_by
          WHERE a.school_id = ${request.schoolId}::uuid
          AND a.audience IN ('all', 'students')
          ORDER BY a.created_at DESC
          LIMIT 50
        ` as any[]
      }

      return reply.send({ announcements })
    })

  // ── Create announcement ───────────────────────────────────────────────────
  app.post('/announcements', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        title: z.string().min(1).max(200),
        body: z.string().min(1),
        audience: z.enum(['all', 'parents', 'teachers', 'students']),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const rows = await tdb.query`
        INSERT INTO announcements (school_id, title, body, audience, posted_by)
        VALUES (${request.schoolId}::uuid, ${d.title}, ${d.body}, ${d.audience}, ${request.user.id}::uuid)
        RETURNING id, title, body, audience, created_at
      ` as any[]

      return reply.status(201).send({ announcement: rows[0] })
    })

  // ── Delete announcement ───────────────────────────────────────────────────
  app.delete('/announcements/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM announcements
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })
}
