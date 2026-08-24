import type { FastifyInstance } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db, tenantDb } from '../db/client'
import { authenticate } from '../middleware/auth'
import * as crypto from 'crypto'
import { sendEmail } from '../lib/email'

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

    // Super admins can log in from any school subdomain
    const superAdminRows = await db()`
      SELECT id, school_id, role, email, full_name, password_hash, is_active, class_level, class_arm, must_change_password
      FROM users
      WHERE email = ${email.toLowerCase()}
      AND role = 'super_admin'
    ` as any[]

    const rows = superAdminRows.length > 0 ? superAdminRows : await tdb.query`
      SELECT id, school_id, role, email, full_name, password_hash, is_active, class_level, class_arm, must_change_password
      FROM users
      WHERE email = ${email.toLowerCase()}
      AND school_id = ${request.schoolId}::uuid
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

    // Include schoolSubdomain in JWT so frontend never needs localStorage
    const token = (app as any).jwt.sign(
      {
        id: user.id,
        schoolId: user.school_id,
        schoolSubdomain: request.school.subdomain,
        role: user.role,
        email: user.email,
        fullName: user.full_name,
        classLevel: user.class_level,
        classArm: user.class_arm,
        mustChangePassword: user.must_change_password,
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
         mustChangePassword: user.must_change_password,
        school: {
          id: request.school.id,
          name: request.school.name,
          subdomain: request.school.subdomain,
        },
      },
    })
  })

  const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

app.post('/auth/forgot-password', async (request: any, reply: any) => {
  const body = forgotPasswordSchema.safeParse(request.body)
  if (!body.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
  }
  const { email } = body.data

  // Always return the same generic response, whether or not the email exists —
  // prevents this endpoint from being used to discover valid accounts.
  const genericResponse = { message: 'If that email is registered, a password reset link has been sent.' }

  try {
    const tdb = tenantDb(request.schoolId)
    const rows = await tdb.query`
      SELECT id, full_name FROM users
      WHERE email = ${email.toLowerCase()} AND school_id = ${request.schoolId}::uuid
    ` as any[]

    const user = rows[0]
    if (!user) {
      return reply.send(genericResponse)
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db()`
      UPDATE users
      SET reset_token_hash = ${tokenHash}, reset_token_expires_at = ${expiresAt.toISOString()}
      WHERE id = ${user.id}
    `

    const resetUrl = `https://${request.school.subdomain}.examify.ng/reset-password?token=${rawToken}`

    await sendEmail({
      to: email,
      subject: 'Reset your Examify password',
      html: `
        <p>Hi ${user.full_name},</p>
        <p>We received a request to reset your Examify password. Click the link below to set a new one:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      `,
    })

    return reply.send(genericResponse)
  } catch (err: any) {
    console.error('Forgot password error:', err.message)
    return reply.send(genericResponse) // still generic, even on internal error
  }
})

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

app.post('/auth/reset-password', async (request: any, reply: any) => {
  const body = resetPasswordSchema.safeParse(request.body)
  if (!body.success) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })
  }
  const { token, newPassword } = body.data

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  const tdb = tenantDb(request.schoolId)
  const rows = await tdb.query`
    SELECT id, reset_token_expires_at FROM users
    WHERE reset_token_hash = ${tokenHash} AND school_id = ${request.schoolId}::uuid
  ` as any[]

  const user = rows[0]
  if (!user || !user.reset_token_expires_at || new Date(user.reset_token_expires_at) < new Date()) {
    return reply.status(400).send({ error: 'INVALID_OR_EXPIRED_TOKEN', message: 'This reset link is invalid or has expired.' })
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await db()`
    UPDATE users
    SET password_hash = ${passwordHash}, reset_token_hash = NULL, reset_token_expires_at = NULL, must_change_password = false
    WHERE id = ${user.id}
  `

  return reply.send({ success: true })
})
  app.patch('/auth/change-password', { preHandler: [authenticate] }, async (request: any, reply: any) => {
  const { newPassword } = request.body
  if (!newPassword || newPassword.length < 8) {
    return reply.status(400).send({ error: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' })
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)

  await db()`
    UPDATE users
    SET password_hash = ${passwordHash}, must_change_password = false
    WHERE id = ${request.user.id}
  `

  return reply.send({ success: true })
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
      SELECT id, role, email, full_name, phone, admission_no, class_level, class_arm, must_change_password
      FROM users WHERE id = ${request.user.id}
      AND school_id = ${request.schoolId}::uuid
    ` as any[]
    return reply.send({
      user: {
        ...rows[0],
        mustChangePassword: rows[0].must_change_password,
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
