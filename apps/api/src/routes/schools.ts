import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function schoolRoutes(app: FastifyInstance) {

  // ── Get school settings ───────────────────────────────────────────────────
  app.get('/schools/settings', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const rows = await db()`
        SELECT id, name, subdomain, logo_url, email, phone, subscription_tier
        FROM schools WHERE id = ${request.schoolId}::uuid
      ` as any[]
      return reply.send(rows[0] ?? {})
    })

  // ── Update school settings (logo, etc.) ───────────────────────────────────
  app.patch('/schools/settings', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        logoUrl: z.string().url().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      if (d.logoUrl !== undefined) {
        await db()`UPDATE schools SET logo_url = ${d.logoUrl} WHERE id = ${request.schoolId}::uuid`
      }
      if (d.email !== undefined) {
        await db()`UPDATE schools SET email = ${d.email} WHERE id = ${request.schoolId}::uuid`
      }
      if (d.phone !== undefined) {
        await db()`UPDATE schools SET phone = ${d.phone} WHERE id = ${request.schoolId}::uuid`
      }
      return reply.send({ saved: true })
    })

  // ── Update student photo ──────────────────────────────────────────────────
  app.patch('/users/:id/photo', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({ photoUrl: z.string().url() })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      await db()`
        UPDATE users SET photo_url = ${body.data.photoUrl}
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ saved: true })
    })
}
