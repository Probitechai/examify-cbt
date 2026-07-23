import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function gradebookRoutes(app: FastifyInstance) {

  // GET CLASS GRADEBOOK
  app.get('/gradebook/class', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm, subjectId } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel required' })
      const tid = String(termId)
      const cl = String(classLevel)
      const tdb = tenantDb(request.schoolId)

      let students: any[]
      if (classArm) {
        const ca = String(classArm)
        students = await tdb.query`
          SELECT id, full_name, admission_no, class_arm
          FROM users
          WHERE school_id = ${request.schoolId}::uuid
          AND role = 'student' AND class_level = ${cl} AND class_arm = ${ca} AND is_active = true
          ORDER BY full_name ASC
        ` as any[]
      } else {
        students = await tdb.query`
          SELECT id, full_name, admission_no, class_arm
          FROM users
          WHERE school_id = ${request.schoolId}::uuid
          AND role = 'student' AND class_level = ${cl} AND is_active = true
          ORDER BY full_name ASC
        ` as any[]
      }

      let entries: any[]
      if (subjectId) {
        const sid = String(subjectId)
        entries = await tdb.query`
          SELECT ge.*, cs.name AS subject_name, u.full_name AS student_name
          FROM gradebook_entries ge
          LEFT JOIN curriculum_subjects cs ON cs.id = ge.subject_id
          LEFT JOIN users u ON u.id = ge.student_id
          WHERE ge.school_id = ${request.schoolId}::uuid
          AND ge.term_id = ${tid}::uuid AND ge.subject_id = ${sid}::uuid AND u.class_level = ${cl}
          ORDER BY u.full_name ASC, ge.created_at ASC
        ` as any[]
      } else {
        entries = await tdb.query`
          SELECT ge.*, cs.name AS subject_name, u.full_name AS student_name
          FROM gradebook_entries ge
          LEFT JOIN curriculum_subjects cs ON cs.id = ge.subject_id
          LEFT JOIN users u ON u.id = ge.student_id
          WHERE ge.school_id = ${request.schoolId}::uuid
          AND ge.term_id = ${tid}::uuid AND u.class_level = ${cl}
          ORDER BY u.full_name ASC, ge.created_at ASC
        ` as any[]
      }

      const assignmentScores = await tdb.query`
        SELECT asub.student_id, asub.score, asub.assignment_id,
               la.title, la.max_score, lp.subject_id, cs.name AS subject_name
        FROM assignment_submissions asub
        JOIN lesson_assignments la ON la.id = asub.assignment_id
        JOIN lesson_plans lp ON lp.id = la.lesson_id
        LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
        WHERE asub.school_id = ${request.schoolId}::uuid
        AND asub.status = 'graded' AND lp.term_id = ${tid}::uuid AND lp.class_level = ${cl}
      ` as any[]

      const cbtScores = await tdb.query`
        SELECT es.user_id AS student_id, es.score, es.total_marks, e.title, e.subject
        FROM exam_sessions es
        JOIN exams e ON e.id = es.exam_id
        WHERE es.school_id = ${request.schoolId}::uuid AND es.status = 'submitted'
      ` as any[]

      return reply.send({ students, entries, assignmentScores, cbtScores })
    })

  // GET STUDENT GRADEBOOK
  app.get('/gradebook/student/:studentId', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { studentId } = request.params as any
      const { termId } = request.query as any
      if (!termId) return reply.status(400).send({ error: 'termId required' })
      const sid = String(studentId)
      const tid = String(termId)
      const tdb = tenantDb(request.schoolId)

      const entries = await tdb.query`
        SELECT ge.*, cs.name AS subject_name
        FROM gradebook_entries ge
        LEFT JOIN curriculum_subjects cs ON cs.id = ge.subject_id
        WHERE ge.school_id = ${request.schoolId}::uuid
        AND ge.student_id = ${sid}::uuid AND ge.term_id = ${tid}::uuid
        ORDER BY cs.name ASC, ge.created_at ASC
      ` as any[]

      const assignmentScores = await tdb.query`
        SELECT asub.score, asub.feedback, asub.graded_at,
               la.title, la.max_score, cs.name AS subject_name, lp.subject_id
        FROM assignment_submissions asub
        JOIN lesson_assignments la ON la.id = asub.assignment_id
        JOIN lesson_plans lp ON lp.id = la.lesson_id
        LEFT JOIN curriculum_subjects cs ON cs.id = lp.subject_id
        WHERE asub.school_id = ${request.schoolId}::uuid
        AND asub.student_id = ${sid}::uuid AND asub.status = 'graded' AND lp.term_id = ${tid}::uuid
        ORDER BY cs.name ASC, asub.graded_at DESC
      ` as any[]

      const cbtScores = await tdb.query`
        SELECT es.score, es.total_marks, es.submitted_at, e.title, e.subject
        FROM exam_sessions es
        JOIN exams e ON e.id = es.exam_id
        WHERE es.school_id = ${request.schoolId}::uuid
        AND es.user_id = ${sid}::uuid AND es.status = 'submitted'
        ORDER BY es.submitted_at DESC
      ` as any[]

      return reply.send({ entries, assignmentScores, cbtScores })
    })

  // ADD MANUAL ENTRY
  app.post('/gradebook/entries', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        studentId: z.string().uuid(),
        subjectId: z.string().uuid().optional(),
        termId: z.string().uuid(),
        entryType: z.enum(['cbt_exam', 'assignment', 'class_test', 'manual']),
        title: z.string().min(1),
        score: z.number().min(0),
        maxScore: z.number().min(1).default(100),
        weight: z.number().default(1),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const stid = d.studentId
      const subid = d.subjectId ?? null
      const tid = d.termId
      const et = d.entryType
      const title = d.title
      const score = d.score
      const ms = d.maxScore
      const wt = d.weight
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      if (subid) {
        await tdb.query`
          INSERT INTO gradebook_entries (school_id, student_id, subject_id, term_id, entry_type, title, score, max_score, weight, graded_by)
          VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${subid}::uuid, ${tid}::uuid, ${et}, ${title}, ${score}, ${ms}, ${wt}, ${uid}::uuid)
        `
      } else {
        await tdb.query`
          INSERT INTO gradebook_entries (school_id, student_id, term_id, entry_type, title, score, max_score, weight, graded_by)
          VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${tid}::uuid, ${et}, ${title}, ${score}, ${ms}, ${wt}, ${uid}::uuid)
        `
      }
      return reply.status(201).send({ saved: true })
    })

  // BULK ADD ENTRIES
  app.post('/gradebook/entries/bulk', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectId: z.string().uuid().optional(),
        termId: z.string().uuid(),
        entryType: z.enum(['class_test', 'manual']),
        title: z.string().min(1),
        maxScore: z.number().min(1).default(100),
        scores: z.array(z.object({ studentId: z.string().uuid(), score: z.number().min(0) }))
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const subid = d.subjectId ?? null
      const tid = d.termId
      const et = d.entryType
      const title = d.title
      const ms = d.maxScore
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      let saved = 0
      for (const s of d.scores) {
        const stid = s.studentId
        const score = s.score
        if (subid) {
          await tdb.query`
            INSERT INTO gradebook_entries (school_id, student_id, subject_id, term_id, entry_type, title, score, max_score, graded_by)
            VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${subid}::uuid, ${tid}::uuid, ${et}, ${title}, ${score}, ${ms}, ${uid}::uuid)
          `
        } else {
          await tdb.query`
            INSERT INTO gradebook_entries (school_id, student_id, term_id, entry_type, title, score, max_score, graded_by)
            VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${tid}::uuid, ${et}, ${title}, ${score}, ${ms}, ${uid}::uuid)
          `
        }
        saved++
      }
      return reply.send({ saved })
    })

  // DELETE ENTRY
  app.delete('/gradebook/entries/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const eid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM gradebook_entries WHERE id = ${eid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })
}
