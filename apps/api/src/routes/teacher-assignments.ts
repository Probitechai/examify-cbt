import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function teacherAssignmentRoutes(app: FastifyInstance) {

  // List assignments — optionally filtered by teacherId (for the modal) or
  // by classLevel (for the management page's "view by class" mode)
  app.get('/teacher-assignments', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { teacherId, classLevel } = request.query as any
      const tdb = tenantDb(request.schoolId)

      // Teachers may only ever fetch their own assignments — never another
      // teacher's, and never the "by class" view (which lists everyone).
      if (request.user.role === 'teacher') {
        if (classLevel || !teacherId || teacherId !== request.user.id) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: 'Teachers can only view their own assignments.' })
        }
      }

      let rows
      if (teacherId) {
        rows = await tdb.query`
          SELECT a.id, a.teacher_id, a.class_level, a.class_arm, a.subject, a.created_at,
                 u.full_name as teacher_name
          FROM teacher_subject_assignments a
          JOIN users u ON u.id = a.teacher_id
          WHERE a.school_id = ${request.schoolId}::uuid AND a.teacher_id = ${teacherId}::uuid
          ORDER BY a.class_level, a.class_arm, a.subject
        `
      } else if (classLevel) {
        rows = await tdb.query`
          SELECT a.id, a.teacher_id, a.class_level, a.class_arm, a.subject, a.created_at,
                 u.full_name as teacher_name
          FROM teacher_subject_assignments a
          JOIN users u ON u.id = a.teacher_id
          WHERE a.school_id = ${request.schoolId}::uuid AND a.class_level = ${classLevel}
          ORDER BY a.class_arm, a.subject, u.full_name
        `
      } else {
        rows = await tdb.query`
          SELECT a.id, a.teacher_id, a.class_level, a.class_arm, a.subject, a.created_at,
                 u.full_name as teacher_name
          FROM teacher_subject_assignments a
          JOIN users u ON u.id = a.teacher_id
          WHERE a.school_id = ${request.schoolId}::uuid
          ORDER BY u.full_name, a.class_level, a.class_arm, a.subject
        `
      }

      return reply.send({ assignments: rows })
    })

  // Create one assignment. classArm omitted/blank = "all arms of this class level".
  app.post('/teacher-assignments', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        teacherId: z.string().uuid(),
        classLevel: z.string().min(1),
        classArm: z.string().optional(),
        subject: z.string().min(1),
      })

      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const teacherRows = await tdb.query`
        SELECT id FROM users
        WHERE id = ${d.teacherId}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'teacher'
      ` as any[]
      if (teacherRows.length === 0) {
        return reply.status(400).send({ error: 'INVALID_TEACHER', message: 'Selected user is not a teacher at this school.' })
      }

      try {
        const rows = await tdb.query`
          INSERT INTO teacher_subject_assignments (school_id, teacher_id, class_level, class_arm, subject)
          VALUES (${request.schoolId}::uuid, ${d.teacherId}::uuid, ${d.classLevel}, ${d.classArm ?? ''}, ${d.subject})
          RETURNING id
        ` as any[]
        return reply.status(201).send({ assignmentId: rows[0].id })
      } catch (err: any) {
        if (err.message?.includes('unique')) {
          return reply.status(409).send({ error: 'DUPLICATE', message: 'This teacher already has this exact assignment.' })
        }
        throw err
      }
    })

  // Remove one assignment
  app.delete('/teacher-assignments/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM teacher_subject_assignments
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })
}