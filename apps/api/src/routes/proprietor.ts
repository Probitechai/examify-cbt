import type { FastifyInstance } from 'fastify'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function proprietorRoutes(app: FastifyInstance) {

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