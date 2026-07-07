import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function resultRoutes(app: FastifyInstance) {

  // ── Get result config (grade boundaries, CA/exam weights) ─────────────────
  async function getConfig(tdb: any, schoolId: string) {
    const rows = await tdb.query`
      SELECT ca_weight, exam_weight, grade_boundaries, show_position
      FROM result_configs
      WHERE school_id = ${schoolId}::uuid
    ` as any[]
    if (rows[0]) return rows[0]
    return {
      ca_weight: 40, exam_weight: 60, show_position: true,
      grade_boundaries: [
        { grade: 'A', min: 75, max: 100, remark: 'Excellent' },
        { grade: 'B', min: 65, max: 74, remark: 'Very Good' },
        { grade: 'C', min: 55, max: 64, remark: 'Good' },
        { grade: 'D', min: 45, max: 54, remark: 'Fair' },
        { grade: 'E', min: 40, max: 44, remark: 'Pass' },
        { grade: 'F', min: 0, max: 39, remark: 'Fail' },
      ]
    }
  }

  function computeGrade(total: number, boundaries: any[]): { grade: string; remark: string } {
    for (const b of boundaries) {
      if (total >= b.min && total <= b.max) return { grade: b.grade, remark: b.remark }
    }
    return { grade: 'F', remark: 'Fail' }
  }

  // ── List results for a class/term ─────────────────────────────────────────
  app.get('/results', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm, subject } = request.query as any
      if (!termId) return reply.status(400).send({ error: 'termId is required' })

      const tdb = tenantDb(request.schoolId)
      const results = await tdb.query`
        SELECT sr.id, sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
               sr.total_score, sr.grade, sr.remark, sr.teacher_comment,
               sr.approved_at, sr.approved_by,
               u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm
        FROM student_results sr
        JOIN users u ON u.id = sr.student_id
        WHERE sr.term_id = ${termId}::uuid
        AND sr.school_id = ${request.schoolId}::uuid
        let results: any[]
      if (classLevel && classArm && subject) {
        results = await tdb.query`
          SELECT sr.id, sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.teacher_comment,
                 sr.approved_at, sr.approved_by,
                 u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          AND u.class_arm = ${classArm}
          AND sr.subject = ${subject}
          ORDER BY u.class_level, u.class_arm, u.full_name, sr.subject
        ` as any[]
      } else if (classLevel && classArm) {
        results = await tdb.query`
          SELECT sr.id, sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.teacher_comment,
                 sr.approved_at, sr.approved_by,
                 u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          AND u.class_arm = ${classArm}
          ORDER BY u.class_level, u.class_arm, u.full_name, sr.subject
        ` as any[]
      } else if (classLevel && subject) {
        results = await tdb.query`
          SELECT sr.id, sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.teacher_comment,
                 sr.approved_at, sr.approved_by,
                 u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          AND sr.subject = ${subject}
          ORDER BY u.class_level, u.class_arm, u.full_name, sr.subject
        ` as any[]
      } else if (classLevel) {
        results = await tdb.query`
          SELECT sr.id, sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.teacher_comment,
                 sr.approved_at, sr.approved_by,
                 u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          ORDER BY u.class_level, u.class_arm, u.full_name, sr.subject
        ` as any[]
      } else {
        results = await tdb.query`
          SELECT sr.id, sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.teacher_comment,
                 sr.approved_at, sr.approved_by,
                 u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          ORDER BY u.class_level, u.class_arm, u.full_name, sr.subject
        ` as any[]
      }
        ORDER BY u.class_level, u.class_arm, u.full_name, sr.subject
      ` as any[]

      return reply.send({ results })
    })

  // ── Get students for result entry (with existing results if any) ──────────
  app.get('/results/entry', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm, subject } = request.query as any
      if (!termId || !classLevel || !subject) {
        return reply.status(400).send({ error: 'termId, classLevel and subject are required' })
      }

      const tdb = tenantDb(request.schoolId)

      let students: any[]
      if (classArm) {
        students = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no, u.class_arm,
                 sr.id AS result_id, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.teacher_comment, sr.approved_at
          FROM users u
          LEFT JOIN student_results sr ON sr.student_id = u.id
            AND sr.term_id = ${termId}::uuid
            AND sr.subject = ${subject}
            AND sr.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student'
          AND u.is_active = true
          AND u.class_level = ${classLevel}
          AND u.class_arm = ${classArm}
          ORDER BY u.full_name ASC
        ` as any[]
      } else {
        students = await tdb.query`
          SELECT u.id, u.full_name, u.admission_no, u.class_arm,
                 sr.id AS result_id, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.teacher_comment, sr.approved_at
          FROM users u
          LEFT JOIN student_results sr ON sr.student_id = u.id
            AND sr.term_id = ${termId}::uuid
            AND sr.subject = ${subject}
            AND sr.school_id = ${request.schoolId}::uuid
          WHERE u.school_id = ${request.schoolId}::uuid
          AND u.role = 'student'
          AND u.is_active = true
          AND u.class_level = ${classLevel}
          ORDER BY u.full_name ASC
        ` as any[]
      }

      return reply.send({ students })
    })

  // ── Save/update a single student result ───────────────────────────────────
  app.post('/results/entry', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        studentId: z.string().uuid(),
        subject: z.string().min(1),
        caScore: z.number().min(0).max(100).nullable().optional(),
        examScore: z.number().min(0).max(100).nullable().optional(),
        teacherComment: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const config = await getConfig(tdb, request.schoolId)

      const caScore = d.caScore ?? null
      const examScore = d.examScore ?? null
      const total = (caScore ?? 0) + (examScore ?? 0)
      const { grade, remark } = computeGrade(total, config.grade_boundaries)

      const rows = await tdb.query`
        INSERT INTO student_results (
          school_id, term_id, student_id, subject,
          ca_score, exam_score, grade, remark, teacher_comment, entered_by
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.termId}::uuid, ${d.studentId}::uuid, ${d.subject},
          ${caScore}, ${examScore}, ${grade}, ${remark},
          ${d.teacherComment ?? null}, ${request.user.id}::uuid
        )
        ON CONFLICT (term_id, student_id, subject) DO UPDATE SET
          ca_score = EXCLUDED.ca_score,
          exam_score = EXCLUDED.exam_score,
          grade = EXCLUDED.grade,
          remark = EXCLUDED.remark,
          teacher_comment = EXCLUDED.teacher_comment,
          entered_by = EXCLUDED.entered_by,
          approved_at = NULL,
          approved_by = NULL,
          updated_at = now()
        RETURNING id, ca_score, exam_score, total_score, grade, remark
      ` as any[]

      return reply.send({ result: rows[0] })
    })

  // ── Bulk save results (entire class at once) ───────────────────────────────
  app.post('/results/bulk', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        subject: z.string().min(1),
        results: z.array(z.object({
          studentId: z.string().uuid(),
          caScore: z.number().min(0).max(100).nullable().optional(),
          examScore: z.number().min(0).max(100).nullable().optional(),
          teacherComment: z.string().optional(),
        }))
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const config = await getConfig(tdb, request.schoolId)

      let saved = 0
      for (const r of d.results) {
        const caScore = r.caScore ?? null
        const examScore = r.examScore ?? null
        const total = (caScore ?? 0) + (examScore ?? 0)
        const { grade, remark } = computeGrade(total, config.grade_boundaries)

        await tdb.query`
          INSERT INTO student_results (
            school_id, term_id, student_id, subject,
            ca_score, exam_score, grade, remark, teacher_comment, entered_by
          )
          VALUES (
            ${request.schoolId}::uuid, ${d.termId}::uuid, ${r.studentId}::uuid, ${d.subject},
            ${caScore}, ${examScore}, ${grade}, ${remark},
            ${r.teacherComment ?? null}, ${request.user.id}::uuid
          )
          ON CONFLICT (term_id, student_id, subject) DO UPDATE SET
            ca_score = EXCLUDED.ca_score,
            exam_score = EXCLUDED.exam_score,
            grade = EXCLUDED.grade,
            remark = EXCLUDED.remark,
            teacher_comment = EXCLUDED.teacher_comment,
            entered_by = EXCLUDED.entered_by,
            approved_at = NULL,
            approved_by = NULL,
            updated_at = now()
        `
        saved++
      }

      return reply.send({ saved })
    })

  // ── Approve results (admin only) ──────────────────────────────────────────
  app.post('/results/approve', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        classLevel: z.string(),
        classArm: z.string().optional(),
        subject: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

     if (d.classArm && d.subject) {
        await tdb.query`
          UPDATE student_results sr SET approved_at = now(), approved_by = ${request.user.id}::uuid
          FROM users u WHERE sr.student_id = u.id
          AND sr.term_id = ${d.termId}::uuid AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${d.classLevel} AND u.class_arm = ${d.classArm}
          AND sr.subject = ${d.subject} AND sr.approved_at IS NULL
        `
      } else if (d.classArm) {
        await tdb.query`
          UPDATE student_results sr SET approved_at = now(), approved_by = ${request.user.id}::uuid
          FROM users u WHERE sr.student_id = u.id
          AND sr.term_id = ${d.termId}::uuid AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${d.classLevel} AND u.class_arm = ${d.classArm}
          AND sr.approved_at IS NULL
        `
      } else if (d.subject) {
        await tdb.query`
          UPDATE student_results sr SET approved_at = now(), approved_by = ${request.user.id}::uuid
          FROM users u WHERE sr.student_id = u.id
          AND sr.term_id = ${d.termId}::uuid AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${d.classLevel} AND sr.subject = ${d.subject}
          AND sr.approved_at IS NULL
        `
      } else {
        await tdb.query`
          UPDATE student_results sr SET approved_at = now(), approved_by = ${request.user.id}::uuid
          FROM users u WHERE sr.student_id = u.id
          AND sr.term_id = ${d.termId}::uuid AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${d.classLevel} AND sr.approved_at IS NULL
        `
      }
    })

  // ── Get broadsheet (full class result for a term) ─────────────────────────
  app.get('/results/broadsheet', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel are required' })

      const tdb = tenantDb(request.schoolId)
      const config = await getConfig(tdb, request.schoolId)

      // Get all results for this class/term
      let results: any[]
      if (classArm) {
        results = await tdb.query`
          SELECT sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.approved_at,
                 u.full_name AS student_name, u.admission_no, u.class_arm
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          AND u.class_arm = ${classArm}
          ORDER BY u.full_name, sr.subject
        ` as any[]
      } else {
        results = await tdb.query`
          SELECT sr.student_id, sr.subject, sr.ca_score, sr.exam_score,
                 sr.total_score, sr.grade, sr.remark, sr.approved_at,
                 u.full_name AS student_name, u.admission_no, u.class_arm
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classLevel}
          ORDER BY u.full_name, sr.subject
        ` as any[]
      }

      // Get all subjects in this result set
      const subjects = [...new Set(results.map((r: any) => r.subject))].sort()

      // Group results by student
      const studentMap: Record<string, any> = {}
      for (const r of results) {
        if (!studentMap[r.student_id]) {
          studentMap[r.student_id] = {
            studentId: r.student_id,
            studentName: r.student_name,
            admissionNo: r.admission_no,
            classArm: r.class_arm,
            subjects: {},
            total: 0,
            subjectCount: 0,
            average: 0,
            position: null,
          }
        }
        studentMap[r.student_id].subjects[r.subject] = {
          caScore: r.ca_score,
          examScore: r.exam_score,
          total: r.total_score,
          grade: r.grade,
          remark: r.remark,
        }
        studentMap[r.student_id].total += Number(r.total_score ?? 0)
        studentMap[r.student_id].subjectCount++
      }

      // Compute averages and positions
      const students = Object.values(studentMap).map((s: any) => ({
        ...s,
        average: s.subjectCount > 0 ? Math.round((s.total / s.subjectCount) * 10) / 10 : 0,
      }))

      // Sort by total for position computation
      if (config.show_position) {
        students.sort((a: any, b: any) => b.total - a.total)
        students.forEach((s: any, i: number) => { s.position = i + 1 })
      }

      // Sort alphabetically for display
      students.sort((a: any, b: any) => a.studentName.localeCompare(b.studentName))

      // Get term info
      const termRows = await tdb.query`
        SELECT t.name AS term_name, t.term_number, s.name AS session_name
        FROM terms t JOIN academic_sessions s ON s.id = t.session_id
        WHERE t.id = ${termId}::uuid
      ` as any[]

      return reply.send({
        broadsheet: {
          termInfo: termRows[0] ?? {},
          classLevel,
          classArm: classArm ?? 'All',
          subjects,
          students,
          config: {
            caWeight: config.ca_weight,
            examWeight: config.exam_weight,
            showPosition: config.show_position,
          }
        }
      })
    })

  // ── Get single student report card ────────────────────────────────────────
  app.get('/results/report-card', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId, studentId } = request.query as any
      if (!termId || !studentId) return reply.status(400).send({ error: 'termId and studentId are required' })

      const tdb = tenantDb(request.schoolId)
      const config = await getConfig(tdb, request.schoolId)

      const results = await tdb.query`
        SELECT sr.subject, sr.ca_score, sr.exam_score, sr.total_score,
               sr.grade, sr.remark, sr.teacher_comment, sr.approved_at
        FROM student_results sr
        WHERE sr.term_id = ${termId}::uuid
        AND sr.student_id = ${studentId}::uuid
        AND sr.school_id = ${request.schoolId}::uuid
        ORDER BY sr.subject ASC
      ` as any[]

      const studentRows = await tdb.query`
        SELECT full_name, admission_no, class_level, class_arm
        FROM users WHERE id = ${studentId}::uuid
      ` as any[]

      const termRows = await tdb.query`
        SELECT t.name AS term_name, t.term_number, s.name AS session_name,
               t.start_date, t.end_date
        FROM terms t JOIN academic_sessions s ON s.id = t.session_id
        WHERE t.id = ${termId}::uuid
      ` as any[]

      const schoolRows = await tdb.query`
        SELECT name FROM schools WHERE id = ${request.schoolId}::uuid
      ` as any[]

      const total = results.reduce((s: number, r: any) => s + Number(r.total_score ?? 0), 0)
      const average = results.length > 0 ? Math.round((total / results.length) * 10) / 10 : 0

      // Compute position in class for this term
      let position = null
      if (config.show_position) {
        const classInfo = studentRows[0]
        const classmates = await tdb.query`
          SELECT sr.student_id, SUM(sr.total_score) AS grand_total
          FROM student_results sr
          JOIN users u ON u.id = sr.student_id
          WHERE sr.term_id = ${termId}::uuid
          AND sr.school_id = ${request.schoolId}::uuid
          AND u.class_level = ${classInfo.class_level}
          AND u.class_arm = ${classInfo.class_arm}
          GROUP BY sr.student_id
          ORDER BY grand_total DESC
        ` as any[]

        const pos = classmates.findIndex((c: any) => c.student_id === studentId)
        position = pos >= 0 ? pos + 1 : null
        const total_students = classmates.length
        position = position ? `${position} of ${total_students}` : null
      }

      return reply.send({
        reportCard: {
          student: studentRows[0] ?? {},
          school: schoolRows[0] ?? {},
          term: termRows[0] ?? {},
          results,
          summary: { total, average, position },
          config: {
            caWeight: config.ca_weight,
            examWeight: config.exam_weight,
          }
        }
      })
    })
}