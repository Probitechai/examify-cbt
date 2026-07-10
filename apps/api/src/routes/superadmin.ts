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
          COUNT(*) FILTER (WHERE subscription_tier = 'starter') AS starter_schools,
          COUNT(*) FILTER (WHERE subscription_tier = 'growth') AS growth_schools,
          COUNT(*) FILTER (WHERE subscription_tier = 'premium') AS premium_schools
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
