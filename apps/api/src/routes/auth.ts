import type { FastifyInstance } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db, tenantDb } from '../db/client'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {

  app.post('/auth/login', async (request: any, reply: any) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
    }

    const { email, password } = body.data
    const tdb = tenantDb(request.schoolId)

    const rows = await tdb.query`
      SELECT id, school_id, role, email, full_name, password_hash, is_active, class_level, class_arm
      FROM users
      WHERE email = ${email.toLowerCase()}
    ` as any[]

    const user = rows[0]

    if (!user || !user.is_active) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' })
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash)
    if (!passwordValid) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' })
    }

    await db()`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`

    const token = (app as any).jwt.sign(
  {
    id: user.id,
    schoolId: user.school_id,
    role: user.role,
    email: user.email,
    fullName: user.full_name,
    classLevel: user.class_level,
    classArm: user.class_arm,
  },
  { expiresIn: '12h' }
)

    return reply.send({
      token,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        fullName: user.full_name,
        classLevel: user.class_level,
        classArm: user.class_arm,
        school: {
          id: request.school.id,
          name: request.school.name,
          subdomain: request.school.subdomain,
        },
      },
    })
  })

  app.get('/auth/me', {
  preHandler: [
    async (req: any, rep: any) => {
      try {
        await req.jwtVerify()
      } catch {
        return rep.status(401).send({ error: 'UNAUTHORIZED' })
      }
    }
  ]
}, async (request: any, reply: any) => {
  const tdb = tenantDb(request.schoolId)
  const rows = await tdb.query`
    SELECT id, role, email, full_name, phone, admission_no, class_level, class_arm
    FROM users WHERE id = ${request.user.id}
  ` as any[]
  return reply.send({
    user: {
      ...rows[0],
      school: {
        id: request.school.id,
        name: request.school.name,
        subdomain: request.school.subdomain,
      }
    }
  })
})

  app.post('/auth/change-password', {
    preHandler: [
      async (req: any, rep: any) => {
        try { await req.jwtVerify() } catch { return rep.status(401).send({ error: 'UNAUTHORIZED' }) }
      }
    ]
  }, async (request: any, reply: any) => {
    const schema = z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

    const rows = await db()`SELECT password_hash FROM users WHERE id = ${request.user.id}` as any[]
    const valid = await bcrypt.compare(body.data.currentPassword, rows[0].password_hash)
    if (!valid) return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' })

    const newHash = await bcrypt.hash(body.data.newPassword, 12)
    await db()`UPDATE users SET password_hash = ${newHash} WHERE id = ${request.user.id}`
    return reply.send({ success: true })
  })
}
