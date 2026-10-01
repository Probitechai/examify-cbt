import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function timetableRoutes(app: FastifyInstance) {

  // ── Get timetable for a class ─────────────────────────────────────────────
  app.get('/timetable', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel required' })

      const tdb = tenantDb(request.schoolId)
      let entries: any[]

      if (classArm) {
        entries = await tdb.query`
          SELECT id, day, period, subject, teacher_name, start_time, end_time, venue, class_arm
          FROM timetables
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          AND class_level = ${classLevel}
          AND class_arm = ${classArm}
          ORDER BY
            CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 END,
            period ASC
        ` as any[]
      } else {
        entries = await tdb.query`
          SELECT id, day, period, subject, teacher_name, start_time, end_time, venue, class_arm
          FROM timetables
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          AND class_level = ${classLevel}
          ORDER BY
            CASE day WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 END,
            period ASC
        ` as any[]
      }

      return reply.send({ entries })
    })

  // ── Add a timetable entry ─────────────────────────────────────────────────
  app.post('/timetable', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        termId: z.string().uuid(),
        classLevel: z.string().min(1),
        classArm: z.string().optional(),
        day: z.enum(['Monday','Tuesday','Wednesday','Thursday','Friday']),
        period: z.number().int().min(1).max(10),
        subject: z.string().min(1),
        teacherName: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        venue: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const rows = await tdb.query`
        INSERT INTO timetables (
          school_id, term_id, class_level, class_arm, day, period,
          subject, teacher_name, start_time, end_time, venue
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.termId}::uuid, ${d.classLevel},
          ${d.classArm ?? null}, ${d.day}, ${d.period},
          ${d.subject}, ${d.teacherName ?? null},
          ${d.startTime ?? null}, ${d.endTime ?? null}, ${d.venue ?? null}
        )
        ON CONFLICT (school_id, term_id, class_level, class_arm, day, period)
        DO UPDATE SET
          subject = EXCLUDED.subject,
          teacher_name = EXCLUDED.teacher_name,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          venue = EXCLUDED.venue
        RETURNING id, day, period, subject, teacher_name, start_time, end_time, venue
      ` as any[]

      return reply.status(201).send({ entry: rows[0] })
    })

  // ── Delete a timetable entry ──────────────────────────────────────────────
  app.delete('/timetable/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM timetables
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })

  // ── Clear entire timetable for a class/term ───────────────────────────────
  app.delete('/timetable', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { termId, classLevel, classArm } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel required' })

      const tdb = tenantDb(request.schoolId)
      if (classArm) {
        await tdb.query`
          DELETE FROM timetables
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          AND class_level = ${classLevel}
          AND class_arm = ${classArm}
        `
      } else {
        await tdb.query`
          DELETE FROM timetables
          WHERE school_id = ${request.schoolId}::uuid
          AND term_id = ${termId}::uuid
          AND class_level = ${classLevel}
        `
      }
      return reply.send({ cleared: true })
    })
}
