import type { FastifyInstance } from 'fastify'
import { db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function superAdminRoutes(app: FastifyInstance) {

  // ── Platform overview ─────────────────────────────────────────────────────
  app.get('/superadmin/overview', { preHandler: [authenticate, requireRole('super_admin')] },
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
  app.get('/superadmin/schools', { preHandler: [authenticate, requireRole('super_admin')] },
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

  // ── Activity over time (last 30 days) ────────────────────────────────────
  app.get('/superadmin/activity', { preHandler: [authenticate, requireRole('super_admin')] },
    async (request: any, reply: any) => {

      const dailyActivity = await db()`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS submissions
        FROM exam_sessions
        WHERE status = 'submitted'
        AND created_at >= now() - interval '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      ` as any[]

      const newSchools = await db()`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS count
        FROM schools
        WHERE created_at >= now() - interval '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      ` as any[]

      const newUsers = await db()`
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS count,
          role
        FROM users
        WHERE created_at >= now() - interval '30 days'
        AND role = 'student'
        GROUP BY DATE(created_at), role
        ORDER BY date ASC
      ` as any[]

      return reply.send({ dailyActivity, newSchools, newUsers })
    })

  // ── Toggle school active status ───────────────────────────────────────────
  app.patch('/superadmin/schools/:id/toggle', { preHandler: [authenticate, requireRole('super_admin')] },
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
  app.patch('/superadmin/schools/:id/tier', { preHandler: [authenticate, requireRole('super_admin')] },
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
