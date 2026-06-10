import type { FastifyInstance } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function userRoutes(app: FastifyInstance) {

  app.get('/users', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const users = await tdb.query`
        SELECT id, role, email, full_name, phone, admission_no,
               class_level, class_arm, is_active, last_login_at, created_at
        FROM users
        WHERE school_id = ${request.schoolId}::uuid
        ORDER BY role, full_name
      `
      return reply.send({ users })
    })

  app.post('/users', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        role: z.enum(['school_admin', 'teacher', 'student', 'parent']),
        email: z.string().email(),
        fullName: z.string().min(1),
        password: z.string().min(6),
        admissionNo: z.string().optional(),
        classLevel: z.string().optional(),
        classArm: z.string().optional(),
      })

      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      const passwordHash = await bcrypt.hash(d.password, 12)
      const tdb = tenantDb(request.schoolId)

      const rows = await tdb.query`
        INSERT INTO users (school_id, role, email, full_name, password_hash, admission_no, class_level, class_arm)
        VALUES (${request.schoolId}::uuid, ${d.role}::user_role, ${d.email.toLowerCase()}, ${d.fullName},
                ${passwordHash}, ${d.admissionNo ?? null}, ${d.classLevel ?? null}, ${d.classArm ?? null})
        RETURNING id
      ` as any[]
      return reply.status(201).send({ userId: rows[0].id })
    })

  app.post('/users/bulk', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        students: z.array(z.object({
          fullName: z.string().min(1),
          email: z.string().email(),
          admissionNo: z.string().optional(),
          classLevel: z.string(),
          classArm: z.string(),
          password: z.string().default('Student@1234'),
        }))
      })

      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const tdb = tenantDb(request.schoolId)
      let imported = 0
      const errors: string[] = []

      for (const s of body.data.students) {
        try {
          const passwordHash = await bcrypt.hash(s.password, 12)
          await tdb.query`
            INSERT INTO users (school_id, role, email, full_name, password_hash, admission_no, class_level, class_arm)
            VALUES (${request.schoolId}::uuid, 'student'::user_role, ${s.email.toLowerCase()}, ${s.fullName},
                    ${passwordHash}, ${s.admissionNo ?? null}, ${s.classLevel}, ${s.classArm})
            ON CONFLICT (school_id, email) DO NOTHING
          `
          imported++
        } catch (err: any) {
          errors.push(`${s.email}: ${err.message}`)
        }
      }

      return reply.send({ imported, errors })
    })

  app.patch('/users/:id/status', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const { isActive } = request.body as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE users SET is_active = ${isActive}
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ updated: true })
    })
}
