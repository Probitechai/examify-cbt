import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

function generateJitsiRoom(schoolSubdomain: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 30)
  const rand = Math.random().toString(36).slice(2, 8)
  return `examify-${schoolSubdomain}-${slug}-${rand}`
}

export async function liveClassRoutes(app: FastifyInstance) {

  // LIST LIVE CLASSES
  app.get('/live-classes', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { classLevel, status, upcoming } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const cl = classLevel ? String(classLevel) : null
      const st = status ? String(status) : null

      let rows: any[]
      if (cl && st) {
        rows = await tdb.query`
          SELECT lc.*, u.full_name AS teacher_name, cs.name AS subject_name
          FROM live_classes lc
          LEFT JOIN users u ON u.id = lc.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lc.subject_id
          WHERE lc.school_id = ${request.schoolId}::uuid
          AND lc.class_level = ${cl} AND lc.status = ${st}
          ORDER BY lc.scheduled_at ASC
        ` as any[]
      } else if (cl) {
        rows = await tdb.query`
          SELECT lc.*, u.full_name AS teacher_name, cs.name AS subject_name
          FROM live_classes lc
          LEFT JOIN users u ON u.id = lc.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lc.subject_id
          WHERE lc.school_id = ${request.schoolId}::uuid
          AND lc.class_level = ${cl}
          ORDER BY lc.scheduled_at DESC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT lc.*, u.full_name AS teacher_name, cs.name AS subject_name
          FROM live_classes lc
          LEFT JOIN users u ON u.id = lc.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lc.subject_id
          WHERE lc.school_id = ${request.schoolId}::uuid
          ORDER BY lc.scheduled_at DESC
        ` as any[]
      }
      return reply.send({ classes: rows })
    })

  // GET UPCOMING (next 7 days) — for student dashboard
  app.get('/live-classes/upcoming', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { classLevel } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const cl = classLevel ? String(classLevel) : null

      let rows: any[]
      if (cl) {
        rows = await tdb.query`
          SELECT lc.*, u.full_name AS teacher_name, cs.name AS subject_name
          FROM live_classes lc
          LEFT JOIN users u ON u.id = lc.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lc.subject_id
          WHERE lc.school_id = ${request.schoolId}::uuid
          AND lc.class_level = ${cl}
          AND lc.status IN ('scheduled', 'live')
          AND lc.scheduled_at >= now()
          AND lc.scheduled_at <= now() + interval '7 days'
          ORDER BY lc.scheduled_at ASC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT lc.*, u.full_name AS teacher_name, cs.name AS subject_name
          FROM live_classes lc
          LEFT JOIN users u ON u.id = lc.teacher_id
          LEFT JOIN curriculum_subjects cs ON cs.id = lc.subject_id
          WHERE lc.school_id = ${request.schoolId}::uuid
          AND lc.status IN ('scheduled', 'live')
          AND lc.scheduled_at >= now()
          AND lc.scheduled_at <= now() + interval '7 days'
          ORDER BY lc.scheduled_at ASC
        ` as any[]
      }
      return reply.send({ classes: rows })
    })

  // CREATE LIVE CLASS
  app.post('/live-classes', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        classLevel: z.string().min(1),
        classArm: z.string().optional(),
        subjectId: z.string().uuid().optional(),
        termId: z.string().uuid().optional(),
        scheduledAt: z.string(),
        durationMins: z.number().default(40),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const title = d.title
      const desc = d.description ?? null
      const cl = d.classLevel
      const ca = d.classArm ?? null
      const subid = d.subjectId ?? null
      const tid = d.termId ?? null
      const sat = d.scheduledAt
      const dur = d.durationMins
      const uid = request.user.id
      const jitsiRoom = generateJitsiRoom(request.school.subdomain, d.title)
      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (subid && tid) {
        rows = await tdb.query`
          INSERT INTO live_classes (school_id, teacher_id, subject_id, term_id, title, description, class_level, class_arm, scheduled_at, duration_mins, jitsi_room)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${subid}::uuid, ${tid}::uuid, ${title}, ${desc}, ${cl}, ${ca}, ${sat}::timestamptz, ${dur}, ${jitsiRoom})
          RETURNING id, title, jitsi_room, scheduled_at
        ` as any[]
      } else if (subid) {
        rows = await tdb.query`
          INSERT INTO live_classes (school_id, teacher_id, subject_id, title, description, class_level, class_arm, scheduled_at, duration_mins, jitsi_room)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${subid}::uuid, ${title}, ${desc}, ${cl}, ${ca}, ${sat}::timestamptz, ${dur}, ${jitsiRoom})
          RETURNING id, title, jitsi_room, scheduled_at
        ` as any[]
      } else {
        rows = await tdb.query`
          INSERT INTO live_classes (school_id, teacher_id, title, description, class_level, class_arm, scheduled_at, duration_mins, jitsi_room)
          VALUES (${request.schoolId}::uuid, ${uid}::uuid, ${title}, ${desc}, ${cl}, ${ca}, ${sat}::timestamptz, ${dur}, ${jitsiRoom})
          RETURNING id, title, jitsi_room, scheduled_at
        ` as any[]
      }

      const liveClass = rows[0]
      const jitsiUrl = `https://meet.jit.si/${liveClass.jitsi_room}`
      return reply.status(201).send({ liveClass: { ...liveClass, jitsi_url: jitsiUrl } })
    })

  // UPDATE STATUS (start/end class)
  app.patch('/live-classes/:id/status', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        status: z.enum(['live', 'ended', 'cancelled']),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const st = body.data.status
      const lid = String(id)
      const tdb = tenantDb(request.schoolId)

      if (st === 'live') {
        await tdb.query`
          UPDATE live_classes SET status = ${st}, started_at = now(), updated_at = now()
          WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid
        `
      } else if (st === 'ended') {
        await tdb.query`
          UPDATE live_classes SET status = ${st}, ended_at = now(), updated_at = now()
          WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid
        `
      } else {
        await tdb.query`
          UPDATE live_classes SET status = ${st}, updated_at = now()
          WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid
        `
      }
      return reply.send({ updated: true })
    })

  // ADD RECORDING
  app.patch('/live-classes/:id/recording', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        recordingUrl: z.string().url(),
        recordingType: z.enum(['youtube', 'loom', 'drive', 'other']),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const ru = body.data.recordingUrl
      const rt = body.data.recordingType
      const lid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE live_classes SET recording_url = ${ru}, recording_type = ${rt}, updated_at = now()
        WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ updated: true })
    })

  // DELETE
  app.delete('/live-classes/:id', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const lid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM live_classes WHERE id = ${lid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })
}
