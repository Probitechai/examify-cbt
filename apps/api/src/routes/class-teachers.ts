import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function classTeacherRoutes(app: FastifyInstance) {

  // List class-teacher assignments — admin sees all (or filter by class),
  // a teacher can only ever fetch their own.
  app.get('/class-teachers', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { teacherId, classLevel, classArm } = request.query as any
      const tdb = tenantDb(request.schoolId)

      if (request.user.role === 'teacher') {
        if (teacherId && teacherId !== request.user.id) {
          return reply.status(403).send({ error: 'FORBIDDEN', message: 'Teachers can only view their own class-teacher assignments.' })
        }
        const rows = await tdb.query`
          SELECT ct.id, ct.teacher_id, ct.class_level, ct.class_arm, u.full_name AS teacher_name
          FROM class_teachers ct
          JOIN users u ON u.id = ct.teacher_id
          WHERE ct.school_id = ${request.schoolId}::uuid AND ct.teacher_id = ${request.user.id}::uuid
          ORDER BY ct.class_level, ct.class_arm
        ` as any[]
        return reply.send({ classTeachers: rows })
      }

      // Admin path
      let rows: any[]
      if (classLevel && classArm) {
        rows = await tdb.query`
          SELECT ct.id, ct.teacher_id, ct.class_level, ct.class_arm, u.full_name AS teacher_name
          FROM class_teachers ct
          JOIN users u ON u.id = ct.teacher_id
          WHERE ct.school_id = ${request.schoolId}::uuid AND ct.class_level = ${classLevel} AND ct.class_arm = ${classArm}
          ORDER BY ct.class_level, ct.class_arm
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT ct.id, ct.teacher_id, ct.class_level, ct.class_arm, u.full_name AS teacher_name
          FROM class_teachers ct
          JOIN users u ON u.id = ct.teacher_id
          WHERE ct.school_id = ${request.schoolId}::uuid
          ORDER BY ct.class_level, ct.class_arm
        ` as any[]
      }
      return reply.send({ classTeachers: rows })
    })

  // Assign (or replace) the class teacher for a class level + arm. Admin only.
  app.post('/class-teachers', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        teacherId: z.string().uuid(),
        classLevel: z.string().min(1),
        classArm: z.string().min(1),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const teacherRows = await tdb.query`
        SELECT id FROM users WHERE id = ${d.teacherId}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'teacher'
      ` as any[]
      if (teacherRows.length === 0) {
        return reply.status(400).send({ error: 'INVALID_TEACHER', message: 'Selected user is not a teacher at this school.' })
      }

      const rows = await tdb.query`
        INSERT INTO class_teachers (school_id, teacher_id, class_level, class_arm)
        VALUES (${request.schoolId}::uuid, ${d.teacherId}::uuid, ${d.classLevel}, ${d.classArm})
        ON CONFLICT (school_id, class_level, class_arm) DO UPDATE SET teacher_id = EXCLUDED.teacher_id
        RETURNING id
      ` as any[]
      return reply.status(201).send({ classTeacherId: rows[0].id })
    })

  // Remove a class-teacher assignment. Admin only.
  app.delete('/class-teachers/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM class_teachers WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })
}