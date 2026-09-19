import type { FastifyInstance } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { sendEmail } from '../lib/email'
import { loginCredentialsEmail } from '../emails/templates'

export async function proprietorRoutes(app: FastifyInstance) {

  // ── List this school's admin accounts ─────────────────────────────────────
  app.get('/proprietor/admins', { preHandler: [authenticate, requireRole('proprietor')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const admins = await tdb.query`
        SELECT id, full_name, email, phone, is_active, created_at, last_login_at
        FROM users WHERE school_id = ${request.schoolId}::uuid AND role = 'school_admin'
        ORDER BY created_at ASC
      ` as any[]
      return reply.send({ admins })
    })

  // ── Create a new admin account for this school ────────────────────────────
  app.post('/proprietor/admins', { preHandler: [authenticate, requireRole('proprietor')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        fullName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const existing = await tdb.query`SELECT id FROM users WHERE email = ${d.email.toLowerCase()}` as any[]
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'This email is already in use.' })
      }

      const tempPassword = Math.random().toString(36).slice(-10)
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      const rows = await tdb.query`
        INSERT INTO users (school_id, role, full_name, email, phone, password_hash, is_active, must_change_password)
        VALUES (${request.schoolId}::uuid, 'school_admin'::user_role, ${d.fullName}, ${d.email.toLowerCase()}, ${d.phone ?? null}, ${passwordHash}, true, true)
        RETURNING id, full_name, email, phone
      ` as any[]

      const { subject, html } = loginCredentialsEmail({
        schoolName: request.school.name,
        fullName: d.fullName,
        email: d.email.toLowerCase(),
        password: tempPassword,
        loginUrl: 'https://examify-cbt-web.vercel.app/login',
        role: 'school_admin',
      })
      sendEmail({ to: d.email.toLowerCase(), subject, html }).catch(err =>
        console.error('Failed to send admin credentials email:', err.message)
      )

      return reply.status(201).send({ admin: rows[0], tempPassword })
    })

  // ── Activate/deactivate an admin account ──────────────────────────────────
  app.patch('/proprietor/admins/:id/toggle', { preHandler: [authenticate, requireRole('proprietor')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)

      const targetRows = await tdb.query`
        SELECT is_active FROM users WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'school_admin'
      ` as any[]
      if (!targetRows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })

      if (targetRows[0].is_active) {
        const activeCount = await tdb.query`
          SELECT COUNT(*) AS count FROM users
          WHERE school_id = ${request.schoolId}::uuid AND role = 'school_admin' AND is_active = true
        ` as any[]
        if (Number(activeCount[0].count) <= 1) {
          return reply.status(400).send({ error: 'LAST_ADMIN', message: 'Cannot deactivate the last remaining active admin for this school.' })
        }
      }

      const rows = await tdb.query`
        UPDATE users SET is_active = NOT is_active
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'school_admin'
        RETURNING id, full_name, is_active
      ` as any[]
      return reply.send({ admin: rows[0] })
    })

  // ── Reset an admin's password ──────────────────────────────────────────────
  app.patch('/proprietor/admins/:id/reset-password', { preHandler: [authenticate, requireRole('proprietor')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)

      const targetRows = await tdb.query`
        SELECT full_name, email FROM users
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'school_admin'
      ` as any[]
      const target = targetRows[0]
      if (!target) return reply.status(404).send({ error: 'NOT_FOUND' })

      const tempPassword = Math.random().toString(36).slice(-10)
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      await tdb.query`
        UPDATE users SET password_hash = ${passwordHash}, must_change_password = true
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `

      const { subject, html } = loginCredentialsEmail({
        schoolName: request.school.name,
        fullName: target.full_name,
        email: target.email,
        password: tempPassword,
        loginUrl: 'https://examify-cbt-web.vercel.app/login',
        role: 'school_admin',
      })
      sendEmail({ to: target.email, subject, html }).catch(err =>
        console.error('Failed to send reset-password email:', err.message)
      )

      return reply.send({ reset: true, tempPassword })
    })

  // ── Permanently delete an admin account ────────────────────────────────────
  app.delete('/proprietor/admins/:id', { preHandler: [authenticate, requireRole('proprietor')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)

      const targetRows = await tdb.query`
        SELECT id FROM users WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'school_admin'
      ` as any[]
      if (!targetRows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })

      const activeCount = await tdb.query`
        SELECT COUNT(*) AS count FROM users
        WHERE school_id = ${request.schoolId}::uuid AND role = 'school_admin' AND is_active = true
      ` as any[]
      if (Number(activeCount[0].count) <= 1) {
        return reply.status(400).send({ error: 'LAST_ADMIN', message: 'Cannot delete the last remaining active admin for this school.' })
      }

      try {
        await tdb.query`DELETE FROM users WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
        return reply.send({ deleted: true })
      } catch (err: any) {
        return reply.status(400).send({
          error: 'DELETE_BLOCKED',
          message: 'This admin has existing records linked to their account, so they cannot be permanently deleted. Please deactivate instead.',
        })
      }
    })

  app.get('/proprietor/dashboard', { preHandler: [authenticate, requireRole('proprietor')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)

      // ── Snapshot: enrollment by class level ──────────────────────────────
      const enrollmentRows = await tdb.query`
        SELECT class_level, COUNT(*) AS count
        FROM users
        WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND is_active = true
        GROUP BY class_level
        ORDER BY class_level
      ` as any[]
      const totalStudents = enrollmentRows.reduce((s: number, r: any) => s + Number(r.count), 0)

      // ── Snapshot: staff headcount ─────────────────────────────────────────
      const staffRows = await tdb.query`
        SELECT COUNT(*) AS count
        FROM users
        WHERE school_id = ${request.schoolId}::uuid AND role = 'teacher' AND is_active = true
      ` as any[]

      // ── Snapshot: subscription ────────────────────────────────────────────
      const schoolRows = await tdb.query`
        SELECT subscription_tier, is_active, created_at
        FROM schools WHERE id = ${request.schoolId}::uuid
      ` as any[]

      // ── Last 5 terms, oldest to newest, for the trend charts ─────────────
      const termRows = await tdb.query`
        SELECT t.id, t.name, t.term_number, s.name AS session_name, t.start_date
        FROM terms t
        JOIN academic_sessions s ON s.id = t.session_id
        WHERE s.school_id = ${request.schoolId}::uuid
        ORDER BY t.start_date DESC
        LIMIT 5
      ` as any[]
      const terms = termRows.reverse()

      const trends: any[] = []
      for (const term of terms) {
        // Fee collection for this term, across the whole school
        const feeRows = await tdb.query`
          WITH student_fees AS (
            SELECT u.id AS student_id, fs.id AS fee_id, fs.amount
            FROM users u
            JOIN fee_structures fs ON fs.class_level = u.class_level
              AND fs.term_id = ${term.id}::uuid AND fs.school_id = ${request.schoolId}::uuid
            WHERE u.school_id = ${request.schoolId}::uuid AND u.role = 'student' AND u.is_active = true
          ),
          payments AS (
            SELECT fp.student_id, fp.fee_structure_id, SUM(fp.amount_paid) AS paid
            FROM fee_payments fp
            WHERE fp.school_id = ${request.schoolId}::uuid
            GROUP BY fp.student_id, fp.fee_structure_id
          )
          SELECT
            COALESCE(SUM(sf.amount), 0) AS total_expected,
            COALESCE(SUM(p.paid), 0) AS total_collected
          FROM student_fees sf
          LEFT JOIN payments p ON p.student_id = sf.student_id AND p.fee_structure_id = sf.fee_id
        ` as any[]

        // Academic performance for this term
        const perfRows = await tdb.query`
          SELECT
            ROUND(AVG(total_score), 1) AS avg_score,
            ROUND(COUNT(*) FILTER (WHERE grade != 'F')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS pass_rate
          FROM student_results
          WHERE term_id = ${term.id}::uuid AND school_id = ${request.schoolId}::uuid
        ` as any[]

        // Attendance rate for this term
        const attRows = await tdb.query`
          SELECT ROUND(COUNT(*) FILTER (WHERE status = 'present')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS attendance_rate
          FROM attendance_records
          WHERE term_id = ${term.id}::uuid AND school_id = ${request.schoolId}::uuid
        ` as any[]

        trends.push({
          termId: term.id,
          termLabel: `${term.name} (${term.session_name})`,
          feesExpected: Number(feeRows[0]?.total_expected ?? 0),
          feesCollected: Number(feeRows[0]?.total_collected ?? 0),
          avgScore: perfRows[0]?.avg_score != null ? Number(perfRows[0].avg_score) : null,
          passRate: perfRows[0]?.pass_rate != null ? Number(perfRows[0].pass_rate) : null,
          attendanceRate: attRows[0]?.attendance_rate != null ? Number(attRows[0].attendance_rate) : null,
        })
      }

      return reply.send({
        snapshot: {
          totalStudents,
          enrollmentByClass: enrollmentRows.map((r: any) => ({ classLevel: r.class_level, count: Number(r.count) })),
          totalTeachers: Number(staffRows[0]?.count ?? 0),
          subscriptionTier: schoolRows[0]?.subscription_tier ?? 'basic',
          schoolActive: schoolRows[0]?.is_active ?? true,
          schoolSince: schoolRows[0]?.created_at ?? null,
        },
        trends,
      })
    })
}