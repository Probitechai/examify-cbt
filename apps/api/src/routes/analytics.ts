import type { FastifyInstance } from 'fastify'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { gateRoutes } from '../middleware/tier'

// ── School analytics (Premium) ───────────────────────────────────────────────
// One request returns everything the Analytics page shows for a term:
//   headline figures, each class, each subject, the last six terms as a trend,
//   and the students to praise or to follow up.
// Definitions (kept the same everywhere on the page):
//   average score  mean of the subject totals (CA + exam, out of 100)
//   pass rate      share of subject results not graded F (the school's own grade bands)
//   attendance     (present + late) ÷ (days marked − excused)
//   fees           expected = each student's bill; collected = successful payments
//                  not reversed; outstanding = expected − collected − approved waivers
// Results are grouped by the student's current class, so a class filter on an
// earlier term follows the same children back in time.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const num = (v: any) => (v == null ? null : Math.round(Number(v) * 10) / 10)
const pct = (a: any, b: any) => (Number(b) > 0 ? Math.round((Number(a) / Number(b)) * 1000) / 10 : null)

export async function analyticsRoutes(app: FastifyInstance) {
  gateRoutes(app, 'analytics')

  app.get('/analytics/school', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const q = request.query as any
      const tdb = tenantDb(request.schoolId)
      const sid = request.schoolId
      const cl: string | null = q.classLevel ? String(q.classLevel) : null

      // Terms, oldest first
      const terms = await tdb.query`
        SELECT t.id, t.name, t.term_number, t.is_active, s.name AS session_name
        FROM terms t JOIN academic_sessions s ON s.id = t.session_id
        WHERE s.school_id = ${sid}::uuid
        ORDER BY s.name, t.term_number, t.created_at
      ` as any[]
      if (!terms.length) return reply.send({ term: null, terms: [], empty: true })

      let idx = terms.length - 1
      if (q.termId) {
        if (!UUID.test(String(q.termId))) return reply.status(400).send({ error: 'termId is invalid' })
        idx = terms.findIndex((t: any) => t.id === q.termId)
        if (idx < 0) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Term not found.' })
      } else {
        const active = terms.map((t: any) => t.is_active).lastIndexOf(true)
        if (active >= 0) idx = active
      }
      const term = terms[idx]
      const prev = idx > 0 ? terms[idx - 1] : null
      const window = terms.slice(Math.max(0, idx - 5), idx + 1)
      const windowIds = window.map((t: any) => t.id)
      const label = (t: any) => `${t.name} ${t.session_name}`

      // ── Results: per student per term (window), then per class and subject for this term
      const perStudent = await tdb.query`
        SELECT sr.term_id, sr.student_id, u.full_name, u.class_level, u.class_arm,
               AVG(sr.total_score) AS average, COUNT(*) AS subjects,
               COUNT(*) FILTER (WHERE sr.grade IS DISTINCT FROM 'F') AS passed
        FROM student_results sr JOIN users u ON u.id = sr.student_id
        WHERE sr.school_id = ${sid}::uuid AND sr.term_id = ANY(${windowIds}::uuid[])
          AND sr.total_score IS NOT NULL AND (${cl}::text IS NULL OR u.class_level = ${cl})
        GROUP BY sr.term_id, sr.student_id, u.full_name, u.class_level, u.class_arm
      ` as any[]

      const bySubject = await tdb.query`
        SELECT sr.subject, COUNT(*) AS results, AVG(sr.total_score) AS average,
               COUNT(*) FILTER (WHERE sr.grade IS DISTINCT FROM 'F') AS passed,
               MAX(sr.total_score) AS highest, MIN(sr.total_score) AS lowest
        FROM student_results sr JOIN users u ON u.id = sr.student_id
        WHERE sr.school_id = ${sid}::uuid AND sr.term_id = ${term.id}::uuid
          AND sr.total_score IS NOT NULL AND (${cl}::text IS NULL OR u.class_level = ${cl})
        GROUP BY sr.subject
        ORDER BY AVG(sr.total_score) DESC
      ` as any[]

      // ── Attendance per student per term (window)
      const attendance = await tdb.query`
        SELECT ar.term_id, ar.student_id, u.class_level,
               COUNT(*) FILTER (WHERE ar.status IN ('present', 'late')) AS attended,
               COUNT(*) FILTER (WHERE ar.status <> 'excused') AS counted
        FROM attendance_records ar JOIN users u ON u.id = ar.student_id
        WHERE ar.school_id = ${sid}::uuid AND ar.term_id = ANY(${windowIds}::uuid[])
          AND (${cl}::text IS NULL OR u.class_level = ${cl})
        GROUP BY ar.term_id, ar.student_id, u.class_level
      ` as any[]

      // ── Fees per class per term (window), same rules as Fee Management
      const fees = await tdb.query`
        WITH expected AS (
          SELECT term_id, class_level, SUM(amount) AS expected
          FROM student_fee_bill
          WHERE school_id = ${sid}::uuid AND term_id = ANY(${windowIds}::uuid[]) AND is_active = true
            AND (${cl}::text IS NULL OR class_level = ${cl})
          GROUP BY term_id, class_level
        ),
        paid AS (
          SELECT fs.term_id, u.class_level, SUM(fp.amount_paid) AS collected
          FROM fee_payments_effective fp
          JOIN fee_structures fs ON fs.id = fp.fee_structure_id
          JOIN users u ON u.id = fp.student_id
          WHERE fp.school_id = ${sid}::uuid AND fs.term_id = ANY(${windowIds}::uuid[])
            AND (${cl}::text IS NULL OR u.class_level = ${cl})
          GROUP BY fs.term_id, u.class_level
        ),
        waived AS (
          SELECT w.term_id, u.class_level, SUM(w.amount) AS waived
          FROM fee_waivers w JOIN users u ON u.id = w.student_id
          WHERE w.school_id = ${sid}::uuid AND w.term_id = ANY(${windowIds}::uuid[]) AND w.status = 'approved'
            AND (${cl}::text IS NULL OR u.class_level = ${cl})
          GROUP BY w.term_id, u.class_level
        )
        SELECT COALESCE(x.term_id, p.term_id, w.term_id) AS term_id,
               COALESCE(x.class_level, p.class_level, w.class_level) AS class_level,
               COALESCE(x.expected, 0) AS expected, COALESCE(p.collected, 0) AS collected, COALESCE(w.waived, 0) AS waived
        FROM expected x
        FULL JOIN paid p ON p.term_id = x.term_id AND p.class_level = x.class_level
        FULL JOIN waived w ON w.term_id = COALESCE(x.term_id, p.term_id) AND w.class_level = COALESCE(x.class_level, p.class_level)
      ` as any[]

      const enrolled = await tdb.query`
        SELECT class_level, COUNT(*) AS students FROM users
        WHERE school_id = ${sid}::uuid AND role = 'student' AND is_active = true
          AND (${cl}::text IS NULL OR class_level = ${cl})
        GROUP BY class_level
        ORDER BY class_level_rank(class_level), class_level
      ` as any[]

      // ── Put it together
      const sum = (rows: any[], f: (r: any) => number) => rows.reduce((a, r) => a + f(r), 0)
      const resultsFor = (tid: string) => perStudent.filter((r: any) => r.term_id === tid)
      const attFor = (tid: string) => attendance.filter((r: any) => r.term_id === tid)
      const feesFor = (tid: string) => fees.filter((r: any) => r.term_id === tid)
      const avgOf = (rows: any[]) => {
        const n = sum(rows, r => Number(r.subjects))
        return n ? num(sum(rows, r => Number(r.average) * Number(r.subjects)) / n) : null
      }
      const passOf = (rows: any[]) => pct(sum(rows, r => Number(r.passed)), sum(rows, r => Number(r.subjects)))
      const attOf = (rows: any[]) => pct(sum(rows, r => Number(r.attended)), sum(rows, r => Number(r.counted)))
      const feeOf = (rows: any[]) => {
        const expected = sum(rows, r => Number(r.expected)), collected = sum(rows, r => Number(r.collected)), waived = sum(rows, r => Number(r.waived))
        return { expected, collected, waived, outstanding: Math.max(0, expected - collected - waived), collectionRate: pct(collected, expected - waived) }
      }

      const now = resultsFor(term.id), nowAtt = attFor(term.id), nowFees = feesFor(term.id)
      const headline = {
        students: sum(enrolled, r => Number(r.students)),
        studentsWithResults: now.length,
        averageScore: avgOf(now),
        passRate: passOf(now),
        attendanceRate: attOf(nowAtt),
        ...feeOf(nowFees),
      }
      const previous = prev ? {
        averageScore: avgOf(resultsFor(prev.id)), passRate: passOf(resultsFor(prev.id)),
        attendanceRate: attOf(attFor(prev.id)), collectionRate: feeOf(feesFor(prev.id)).collectionRate,
      } : null

      const levels = [...new Set([...enrolled.map((r: any) => r.class_level), ...now.map((r: any) => r.class_level)])]
      const rank = (l: string) => { const i = enrolled.findIndex((e: any) => e.class_level === l); return i < 0 ? 999 : i }
      levels.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      const classes = levels.map(level => {
        const r = now.filter((x: any) => x.class_level === level)
        const f = feeOf(nowFees.filter((x: any) => x.class_level === level))
        return {
          classLevel: level,
          students: Number(enrolled.find((e: any) => e.class_level === level)?.students ?? 0),
          averageScore: avgOf(r), passRate: passOf(r),
          attendanceRate: attOf(nowAtt.filter((x: any) => x.class_level === level)),
          expected: f.expected, collected: f.collected, outstanding: f.outstanding, collectionRate: f.collectionRate,
        }
      })

      const subjects = bySubject.map((s: any) => ({
        subject: s.subject, results: Number(s.results), averageScore: num(s.average),
        passRate: pct(s.passed, s.results), highest: num(s.highest), lowest: num(s.lowest),
      }))

      const trend = window.map((t: any) => {
        const r = resultsFor(t.id)
        return { termId: t.id, label: label(t), short: `T${t.term_number ?? ''} ${t.session_name ?? ''}`.trim(), averageScore: avgOf(r), passRate: passOf(r),
          attendanceRate: attOf(attFor(t.id)), collectionRate: feeOf(feesFor(t.id)).collectionRate }
      })

      // Students
      const attRate: Record<string, number | null> = {}
      for (const a of nowAtt) attRate[a.student_id] = pct(a.attended, a.counted)
      const prevAvg: Record<string, number> = {}
      if (prev) for (const r of resultsFor(prev.id)) prevAvg[r.student_id] = Number(r.average)
      const card = (r: any) => ({
        id: r.student_id, name: r.full_name, classLevel: r.class_level, classArm: r.class_arm,
        average: num(r.average), previous: prevAvg[r.student_id] != null ? num(prevAvg[r.student_id]) : null,
        change: prevAvg[r.student_id] != null ? num(Number(r.average) - prevAvg[r.student_id]) : null,
        attendanceRate: attRate[r.student_id] ?? null, failed: Number(r.subjects) - Number(r.passed),
      })
      const cards = now.map(card)
      const byAvg = [...cards].sort((a, b) => (b.average ?? 0) - (a.average ?? 0))
      const withChange = cards.filter(c => c.change != null)
      const students = {
        top: byAvg.slice(0, 10),
        improved: [...withChange].filter(c => c.change! > 0).sort((a, b) => b.change! - a.change!).slice(0, 10),
        declined: [...withChange].filter(c => c.change! < 0).sort((a, b) => a.change! - b.change!).slice(0, 10),
        // Below 40 on average, or attending under 75% of days
        attention: cards.filter(c => (c.average ?? 100) < 40 || (c.attendanceRate != null && c.attendanceRate < 75))
          .sort((a, b) => (a.average ?? 100) - (b.average ?? 100)).slice(0, 25),
      }

      return reply.send({
        term: { id: term.id, label: label(term) },
        previousTerm: prev ? { id: prev.id, label: label(prev) } : null,
        terms: terms.map((t: any) => ({ id: t.id, label: label(t), isActive: !!t.is_active })).reverse(),
        classLevel: cl,
        headline, previous, classes, subjects, trend, students,
      })
    })
}
