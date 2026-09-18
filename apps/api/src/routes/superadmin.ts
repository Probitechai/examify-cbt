import type { FastifyInstance } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function superAdminRoutes(app: FastifyInstance) {

  // ── Super admin login (bypasses tenant middleware) ────────────────────────
  app.post('/superadmin/login', async (request: any, reply: any) => {
    const { email, password } = request.body as any
    if (!email || !password) return reply.status(400).send({ error: 'Email and password required' })

    const rows = await db()`
      SELECT id, school_id, role, email, full_name, password_hash, is_active
      FROM users
      WHERE email = ${email.toLowerCase()}
      AND role = 'super_admin'
      LIMIT 1
    ` as any[]

    const user = rows[0]
    if (!user || !user.is_active) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' })
    }

    await db()`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`

    const token = (app as any).jwt.sign(
      {
        id: user.id,
        schoolId: user.school_id,
        schoolSubdomain: 'platform',
        role: user.role,
        email: user.email,
        fullName: user.full_name,
      },
      { expiresIn: '12h' }
    )

    return reply.send({ token, user: { id: user.id, role: user.role, email: user.email, fullName: user.full_name } })
  })

  // ── Auth middleware for super admin routes ────────────────────────────────
  async function superAuth(request: any, reply: any) {
    try {
      await request.jwtVerify()
      if (request.user.role !== 'super_admin') {
        return reply.status(403).send({ error: 'FORBIDDEN' })
      }
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED' })
    }
  }

  // ── Platform overview ─────────────────────────────────────────────────────
  app.get('/superadmin/overview', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const schoolStats = await db()`
        SELECT
          COUNT(*) AS total_schools,
          COUNT(*) FILTER (WHERE is_active = true) AS active_schools,
          COUNT(*) FILTER (WHERE is_active = false) AS inactive_schools,
          COUNT(*) FILTER (WHERE subscription_tier = 'basic') AS basic_schools,
COUNT(*) FILTER (WHERE subscription_tier = 'standard') AS standard_schools,
COUNT(*) FILTER (WHERE subscription_tier = 'premium') AS premium_schools,
COUNT(*) FILTER (WHERE subscription_tier = 'enterprise') AS enterprise_schools
        FROM schools
      ` as any[]

      const userStats = await db()`
        SELECT
          COUNT(*) FILTER (WHERE role = 'student') AS total_students,
          COUNT(*) FILTER (WHERE role = 'teacher') AS total_teachers,
          COUNT(*) FILTER (WHERE role = 'parent') AS total_parents,
          COUNT(*) FILTER (WHERE role = 'school_admin') AS total_admins
        FROM users
        WHERE role != 'super_admin'
      ` as any[]

      const examStats = await db()`
        SELECT
          COUNT(*) AS total_exams,
          COUNT(*) FILTER (WHERE status = 'active') AS active_exams,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS exams_last_30_days
        FROM exams
      ` as any[]

      const sessionStats = await db()`
        SELECT
          COUNT(*) AS total_sessions,
          COUNT(*) FILTER (WHERE status = 'submitted') AS completed_sessions,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_sessions,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS sessions_last_30_days
        FROM exam_sessions
      ` as any[]

      const resultStats = await db()`
        SELECT
          COUNT(*) AS total_results,
          COUNT(*) FILTER (WHERE approved_at IS NOT NULL) AS approved_results,
          AVG(total_score) AS avg_score
        FROM student_results
      ` as any[]

      return reply.send({
        schools: schoolStats[0],
        users: userStats[0],
        exams: examStats[0],
        sessions: sessionStats[0],
        results: resultStats[0],
      })
    }   
  )



    
    // ── Create new school (onboarding) ─────────────────────────────────────────
app.post('/superadmin/schools', { preHandler: [superAuth] },
  async (request: any, reply: any) => {
    const { name, subdomain, email, phone, subscription_tier, admin_name, admin_email } = request.body

    if (!name || !subdomain || !email || !subscription_tier || !admin_name || !admin_email) {
      return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'name, subdomain, email, subscription_tier, admin_name, and admin_email are required.' })
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return reply.status(400).send({ error: 'INVALID_SUBDOMAIN', message: 'Subdomain can only contain lowercase letters, numbers, and hyphens.' })
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'School email is not a valid email address.' })
    }
    if (!emailPattern.test(admin_email)) {
      return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Admin email is not a valid email address.' })
    }

    const existing = await db()`
      SELECT id FROM schools WHERE subdomain = ${subdomain}
    ` as any[]

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'SUBDOMAIN_TAKEN', message: 'This subdomain is already in use.' })
    }

    const tempPassword = Math.random().toString(36).slice(-10)
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    try {
      const result = await db().begin(async (tx: any) => {
        const schoolRows = await tx`
          INSERT INTO schools (name, subdomain, email, phone, subscription_tier, is_active)
          VALUES (${name}, ${subdomain}, ${email}, ${phone ?? null}, ${subscription_tier}, true)
          RETURNING id, name, subdomain, subscription_tier
        `
        const school = schoolRows[0]

        const adminRows = await tx`
          INSERT INTO users (school_id, full_name, email, password_hash, role, is_active,must_change_password)
          VALUES (${school.id}, ${admin_name}, ${admin_email}, ${passwordHash}, 'school_admin', true, true)
          RETURNING id, full_name, email
        `
        return { school, admin: adminRows[0] }
      })

      // TODO: send welcome email via Resend with login URL + tempPassword

      return reply.status(201).send({
        school: result.school,
        admin: { id: result.admin.id, name: result.admin.full_name, email: result.admin.email },
        tempPassword, // remove from response once email sending is wired up
      })
    } catch (err: any) {
      return reply.status(500).send({ error: 'CREATION_FAILED', message: 'Failed to create school and admin.', detail: err.message })
    }
  })

  // ── Per-school breakdown ──────────────────────────────────────────────────
  app.get('/superadmin/schools', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const schools = await db()`
        SELECT
          s.id, s.name, s.subdomain, s.is_active, s.subscription_tier,
          s.created_at,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'student') AS student_count,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'teacher') AS teacher_count,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'parent') AS parent_count,
          COUNT(DISTINCT e.id) AS exam_count,
          COUNT(DISTINCT es.id) FILTER (WHERE es.status = 'submitted') AS submissions_count,
          MAX(es.created_at) AS last_activity
        FROM schools s
        LEFT JOIN users u ON u.school_id = s.id AND u.role != 'super_admin'
        LEFT JOIN exams e ON e.school_id = s.id
        LEFT JOIN exam_sessions es ON es.school_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC
      ` as any[]

      return reply.send({ schools })
    })

  // ── Toggle school active status ───────────────────────────────────────────
  app.patch('/superadmin/schools/:id/toggle', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const rows = await db()`
        UPDATE schools SET is_active = NOT is_active
        WHERE id = ${id}::uuid
        RETURNING id, name, is_active
      ` as any[]
      return reply.send({ school: rows[0] })
    })

  // ── Update school subscription tier ──────────────────────────────────────
  app.patch('/superadmin/schools/:id/tier', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const { tier } = request.body as any
      if (!['basic', 'standard', 'premium', 'enterprise'].includes(tier)) {
        return reply.status(400).send({ error: 'Invalid tier' })
      }
      const rows = await db()`
        UPDATE schools SET subscription_tier = ${tier}
        WHERE id = ${id}::uuid
        RETURNING id, name, subscription_tier
      ` as any[]
      return reply.send({ school: rows[0] })
    })

  // ── List proprietor accounts for a specific school ────────────────────────
  app.get('/superadmin/schools/:id/proprietors', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const rows = await db()`
        SELECT id, full_name, email, phone, is_active, created_at, last_login_at
        FROM users WHERE school_id = ${id}::uuid AND role = 'proprietor'
        ORDER BY created_at ASC
      ` as any[]
      return reply.send({ proprietors: rows })
    })

  // ── Create a proprietor account for a specific school ─────────────────────
  app.post('/superadmin/schools/:id/proprietors', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const { full_name, email, phone } = request.body as any
      if (!full_name || !email) {
        return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'full_name and email are required.' })
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Not a valid email address.' })
      }
      const schoolRows = await db()`SELECT id FROM schools WHERE id = ${id}::uuid` as any[]
      if (!schoolRows[0]) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })

      const existing = await db()`SELECT id FROM users WHERE email = ${email.toLowerCase()}` as any[]
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'This email is already in use.' })
      }

      const tempPassword = Math.random().toString(36).slice(-10)
      const passwordHash = await bcrypt.hash(tempPassword, 10)
      const rows = await db()`
        INSERT INTO users (school_id, full_name, email, phone, password_hash, role, is_active, must_change_password)
        VALUES (${id}::uuid, ${full_name}, ${email.toLowerCase()}, ${phone ?? null}, ${passwordHash}, 'proprietor', true, true)
        RETURNING id, full_name, email, phone
      ` as any[]
      return reply.status(201).send({ proprietor: rows[0], tempPassword })
    })

  // ── Deactivate/reactivate a proprietor account ────────────────────────────
  app.patch('/superadmin/proprietors/:proprietorId/toggle', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { proprietorId } = request.params as any
      const rows = await db()`
        UPDATE users SET is_active = NOT is_active
        WHERE id = ${proprietorId}::uuid AND role = 'proprietor'
        RETURNING id, full_name, is_active
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ proprietor: rows[0] })
    })

  // ── Permanently delete a proprietor account ───────────────────────────────
  app.delete('/superadmin/proprietors/:proprietorId', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { proprietorId } = request.params as any
      const rows = await db()`
        DELETE FROM users WHERE id = ${proprietorId}::uuid AND role = 'proprietor'
        RETURNING id, full_name
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ deleted: true, proprietor: rows[0] })
    })
      // ── Change own password (superadmin) ──────────────────────────────────────
  app.patch('/superadmin/change-password', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { currentPassword, newPassword } = request.body as any
      if (!currentPassword || !newPassword || newPassword.length < 8) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Current password and a new password (min 8 characters) are required.' })
      }
      const rows = await db()`
        SELECT id, password_hash FROM users WHERE id = ${request.user.id}::uuid AND role = 'super_admin'
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })

      const bcrypt = await import('bcryptjs')
      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash)
      if (!valid) return reply.status(401).send({ error: 'INVALID_PASSWORD', message: 'Current password is incorrect.' })

      const newHash = await bcrypt.hash(newPassword, 12)
      await db()`
        UPDATE users SET password_hash = ${newHash} WHERE id = ${request.user.id}::uuid
      `
      return reply.send({ updated: true })
    })
      // ── List all superadmin accounts ────────────────────────────────────────
  app.get('/superadmin/admins', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const admins = await db()`
        SELECT id, full_name, email, is_active, created_at, last_login_at
        FROM users WHERE role = 'super_admin'
        ORDER BY created_at ASC
      ` as any[]
      return reply.send({ admins })
    })

  // ── Create a new superadmin account ─────────────────────────────────────
  app.post('/superadmin/admins', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { full_name, email } = request.body as any
      if (!full_name || !email) {
        return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'full_name and email are required.' })
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Not a valid email address.' })
      }
      const existing = await db()`SELECT id FROM users WHERE email = ${email.toLowerCase()}` as any[]
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'This email is already in use.' })
      }
      const tempPassword = Math.random().toString(36).slice(-10)
      const passwordHash = await bcrypt.hash(tempPassword, 10)
      const rows = await db()`
        INSERT INTO users (school_id, full_name, email, password_hash, role, is_active)
        SELECT id, ${full_name}, ${email.toLowerCase()}, ${passwordHash}, 'super_admin', true
        FROM schools WHERE subdomain = 'greensprings'
        RETURNING id, full_name, email
      ` as any[]
      return reply.status(201).send({ admin: rows[0], tempPassword })
    })

  // ── Deactivate/reactivate a superadmin account ──────────────────────────
  app.patch('/superadmin/admins/:id/toggle', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      if (id === request.user.id) {
        return reply.status(400).send({ error: 'CANNOT_DEACTIVATE_SELF', message: 'You cannot deactivate your own account.' })
      }
      const rows = await db()`
        UPDATE users SET is_active = NOT is_active
        WHERE id = ${id}::uuid AND role = 'super_admin'
        RETURNING id, full_name, is_active
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ admin: rows[0] })
    })

  // ── Permanently delete a superadmin account ─────────────────────────────
  app.delete('/superadmin/admins/:id', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      if (id === request.user.id) {
        return reply.status(400).send({ error: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account.' })
      }
      const activeCount = await db()`
        SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND is_active = true
      ` as any[]
      if (Number(activeCount[0].count) <= 1) {
        return reply.status(400).send({ error: 'LAST_ADMIN', message: 'Cannot delete the last remaining active superadmin.' })
      }
      const rows = await db()`
        DELETE FROM users WHERE id = ${id}::uuid AND role = 'super_admin'
        RETURNING id, full_name
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ deleted: true, admin: rows[0] })
    })
      // ── Platform analytics: growth, activity trends, academic performance ────
  app.get('/superadmin/analytics', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const schoolGrowth = await db()`
        SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
        FROM schools
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month ASC
      ` as any[]

      const activityTrend = await db()`
        SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
        FROM exam_sessions
        WHERE status = 'submitted'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month ASC
      ` as any[]

      const schoolPerformance = await db()`
        SELECT s.id, s.name,
          COUNT(sr.id) AS total_results,
          ROUND(AVG(sr.total_score), 1) AS avg_score,
          ROUND(COUNT(sr.id) FILTER (WHERE sr.grade != 'F')::numeric / NULLIF(COUNT(sr.id), 0) * 100, 1) AS pass_rate
        FROM schools s
        LEFT JOIN student_results sr ON sr.school_id = s.id
        GROUP BY s.id, s.name
        ORDER BY avg_score DESC NULLS LAST
      ` as any[]

      return reply.send({ schoolGrowth, activityTrend, schoolPerformance })
    })
}
