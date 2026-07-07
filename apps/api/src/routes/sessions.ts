import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function sessionRoutes(app: FastifyInstance) {

  // ── List academic sessions ────────────────────────────────────────────────
  app.get('/sessions', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const sessions = await tdb.query`
        SELECT s.id, s.name, s.is_active, s.created_at,
               COUNT(t.id) AS term_count
        FROM academic_sessions s
        LEFT JOIN terms t ON t.session_id = s.id
        WHERE s.school_id = ${request.schoolId}::uuid
        GROUP BY s.id
        ORDER BY s.created_at DESC
      ` as any[]
      return reply.send({ sessions })
    })

  // ── Create academic session ───────────────────────────────────────────────
  app.post('/sessions', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        name: z.string().min(1),
        isActive: z.boolean().default(false),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const tdb = tenantDb(request.schoolId)

      if (body.data.isActive) {
        await tdb.query`UPDATE academic_sessions SET is_active = false WHERE school_id = ${request.schoolId}::uuid`
      }

      const rows = await tdb.query`
        INSERT INTO academic_sessions (school_id, name, is_active)
        VALUES (${request.schoolId}::uuid, ${body.data.name}, ${body.data.isActive})
        RETURNING id, name, is_active, created_at
      ` as any[]

      return reply.status(201).send({ session: rows[0] })
    })

  // ── Set active session ────────────────────────────────────────────────────
  app.patch('/sessions/:id/activate', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`UPDATE academic_sessions SET is_active = false WHERE school_id = ${request.schoolId}::uuid`
      await tdb.query`UPDATE academic_sessions SET is_active = true WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ activated: true })
    })

  // ── Delete session ────────────────────────────────────────────────────────
  app.delete('/sessions/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM academic_sessions WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── List terms for a session ──────────────────────────────────────────────
  app.get('/sessions/:sessionId/terms', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { sessionId } = request.params as any
      const tdb = tenantDb(request.schoolId)
      const terms = await tdb.query`
        SELECT id, name, term_number, start_date, end_date, is_active, created_at
        FROM terms
        WHERE session_id = ${sessionId}::uuid
        AND school_id = ${request.schoolId}::uuid
        ORDER BY term_number ASC
      ` as any[]
      return reply.send({ terms })
    })

  // ── Create term ───────────────────────────────────────────────────────────
  app.post('/sessions/:sessionId/terms', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { sessionId } = request.params as any
      const schema = z.object({
        name: z.string().min(1),
        termNumber: z.number().int().min(1).max(3),
        startDate: z.string(),
        endDate: z.string(),
        isActive: z.boolean().default(false),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const tdb = tenantDb(request.schoolId)

      if (body.data.isActive) {
        await tdb.query`UPDATE terms SET is_active = false WHERE school_id = ${request.schoolId}::uuid`
      }

      const rows = await tdb.query`
        INSERT INTO terms (school_id, session_id, name, term_number, start_date, end_date, is_active)
        VALUES (${request.schoolId}::uuid, ${sessionId}::uuid, ${body.data.name},
                ${body.data.termNumber}, ${body.data.startDate}, ${body.data.endDate}, ${body.data.isActive})
        RETURNING id, name, term_number, start_date, end_date, is_active
      ` as any[]

      return reply.status(201).send({ term: rows[0] })
    })

  // ── Activate term ─────────────────────────────────────────────────────────
  app.patch('/terms/:id/activate', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`UPDATE terms SET is_active = false WHERE school_id = ${request.schoolId}::uuid`
      await tdb.query`UPDATE terms SET is_active = true WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ activated: true })
    })

  // ── Delete term ───────────────────────────────────────────────────────────
  app.delete('/terms/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM terms WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── Get active session + term ─────────────────────────────────────────────
  app.get('/sessions/active', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT s.id AS session_id, s.name AS session_name,
               t.id AS term_id, t.name AS term_name, t.term_number,
               t.start_date, t.end_date
        FROM academic_sessions s
        LEFT JOIN terms t ON t.session_id = s.id AND t.is_active = true
        WHERE s.school_id = ${request.schoolId}::uuid
        AND s.is_active = true
        LIMIT 1
      ` as any[]

      return reply.send({ active: rows[0] ?? null })
    })

  // ── Get/Save result config ────────────────────────────────────────────────
  app.get('/result-config', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT * FROM result_configs WHERE school_id = ${request.schoolId}::uuid
      ` as any[]

      if (!rows[0]) {
        return reply.send({
          config: {
            caWeight: 40, examWeight: 60, showPosition: true,
            gradeBoundaries: [
              { grade: 'A', min: 75, max: 100, remark: 'Excellent' },
              { grade: 'B', min: 65, max: 74, remark: 'Very Good' },
              { grade: 'C', min: 55, max: 64, remark: 'Good' },
              { grade: 'D', min: 45, max: 54, remark: 'Fair' },
              { grade: 'E', min: 40, max: 44, remark: 'Pass' },
              { grade: 'F', min: 0, max: 39, remark: 'Fail' },
            ]
          }
        })
      }

      return reply.send({
        config: {
          id: rows[0].id,
          caWeight: rows[0].ca_weight,
          examWeight: rows[0].exam_weight,
          showPosition: rows[0].show_position,
          gradeBoundaries: rows[0].grade_boundaries,
        }
      })
    })

  app.post('/result-config', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        caWeight: z.number().int().min(0).max(100),
        examWeight: z.number().int().min(0).max(100),
        showPosition: z.boolean().default(true),
        gradeBoundaries: z.array(z.object({
          grade: z.string(),
          min: z.number(),
          max: z.number(),
          remark: z.string(),
        })),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      await tdb.query`
        INSERT INTO result_configs (school_id, ca_weight, exam_weight, show_position, grade_boundaries)
        VALUES (${request.schoolId}::uuid, ${d.caWeight}, ${d.examWeight}, ${d.showPosition}, ${JSON.stringify(d.gradeBoundaries)}::jsonb)
        ON CONFLICT (school_id) DO UPDATE SET
          ca_weight = EXCLUDED.ca_weight,
          exam_weight = EXCLUDED.exam_weight,
          show_position = EXCLUDED.show_position,
          grade_boundaries = EXCLUDED.grade_boundaries
      `

      return reply.send({ saved: true })
    })
}