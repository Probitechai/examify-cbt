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
    })

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
      if (!['starter', 'growth', 'premium'].includes(tier)) {
        return reply.status(400).send({ error: 'Invalid tier' })
      }
      const rows = await db()`
        UPDATE schools SET subscription_tier = ${tier}
        WHERE id = ${id}::uuid
        RETURNING id, name, subscription_tier
      ` as any[]
      return reply.send({ school: rows[0] })
    })
}
