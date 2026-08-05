import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function transport2Routes(app: FastifyInstance) {

  // ─── ROLL CALLS ───────────────────────────────────────────────────────────

  // GET roll calls (by bus + date)
  app.get('/transport/roll-calls', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { busId, date, termId } = request.query as any
      const db = tenantDb(request).query
      const bid = String(busId)
      const d = String(date)
      const tid = String(termId)
      const rollCalls = await db`
        SELECT rc.*,
          b.name AS bus_name, b.plate_number,
          tr.name AS route_name,
          u.full_name AS conducted_by_name,
          COUNT(rce.id) AS total_students,
          COUNT(rce.id) FILTER (WHERE rce.status = 'present') AS present_count,
          COUNT(rce.id) FILTER (WHERE rce.status = 'absent') AS absent_count
        FROM transport_roll_calls rc
        JOIN buses b ON b.id = rc.bus_id
        JOIN transport_routes tr ON tr.id = rc.route_id
        LEFT JOIN users u ON u.id = rc.conducted_by
        LEFT JOIN transport_roll_call_entries rce ON rce.roll_call_id = rc.id
        WHERE rc.bus_id = ${bid}::uuid AND rc.date = ${d}::date AND rc.term_id = ${tid}::uuid
        GROUP BY rc.id, b.id, tr.id, u.id
        ORDER BY rc.trip_type ASC
      ` as any[]
      return reply.send({ rollCalls })
    })

  // GET roll call entries for a specific roll call
  app.get('/transport/roll-calls/:id/entries', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request).query
      const entries = await db`
        SELECT rce.*, u.full_name AS student_name, u.class_level, u.class_arm,
          rs.name AS stop_name
        FROM transport_roll_call_entries rce
        JOIN users u ON u.id = rce.student_id
        LEFT JOIN student_transport st ON st.student_id = rce.student_id
        LEFT JOIN route_stops rs ON rs.id = st.stop_id
        WHERE rce.roll_call_id = ${id}::uuid
        ORDER BY u.full_name ASC
      ` as any[]
      return reply.send({ entries })
    })

  // POST start a roll call
  app.post('/transport/roll-calls', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        busId: z.string().uuid(),
        routeId: z.string().uuid(),
        termId: z.string().uuid(),
        date: z.string(),
        tripType: z.enum(['morning', 'afternoon']),
        notes: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { busId, routeId, termId, date, tripType, notes } = body.data
      const db = tenantDb(request).query
      const schoolId = request.schoolId
      const conductedBy = request.user?.id ?? null
      const bid = busId
      const rid = routeId
      const tid = termId
      const dt = date
      const tt = tripType
      const nt = notes ?? null
      const cb = conductedBy

      const [rollCall] = await db`
        INSERT INTO transport_roll_calls (school_id, bus_id, route_id, term_id, date, trip_type, conducted_by, notes)
        VALUES (${schoolId}, ${bid}::uuid, ${rid}::uuid, ${tid}::uuid, ${dt}::date, ${tt}, ${cb}, ${nt})
        ON CONFLICT (school_id, bus_id, date, trip_type) DO UPDATE SET notes = EXCLUDED.notes
        RETURNING *
      ` as any[]

      const students = await db`
        SELECT student_id FROM student_transport
        WHERE bus_id = ${bid}::uuid AND term_id = ${tid}::uuid AND is_active = true
      ` as any[]

      const rcId = rollCall.id
      for (const s of students) {
        const sid = String(s.student_id)
        await db`
          INSERT INTO transport_roll_call_entries (school_id, roll_call_id, student_id, status)
          VALUES (${schoolId}, ${rcId}::uuid, ${sid}::uuid, 'present')
          ON CONFLICT (roll_call_id, student_id) DO NOTHING
        `
      }

      return reply.send({ rollCall })
    })

  // PATCH update a roll call entry
  app.patch('/transport/roll-call-entries/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        status: z.enum(['present', 'absent']),
        notes: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { status, notes } = body.data
      const st = status
      const nt = notes ?? null
      const db = tenantDb(request).query
      const [entry] = await db`
        UPDATE transport_roll_call_entries SET status = ${st}, notes = ${nt}
        WHERE id = ${id}::uuid
        RETURNING *
      ` as any[]
      return reply.send({ entry })
    })

  // GET roll call history for a bus
  app.get('/transport/roll-calls/history', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { busId, termId } = request.query as any
      const db = tenantDb(request).query
      const bid = String(busId)
      const tid = String(termId)
      const history = await db`
        SELECT rc.*,
          COUNT(rce.id) AS total_students,
          COUNT(rce.id) FILTER (WHERE rce.status = 'present') AS present_count,
          COUNT(rce.id) FILTER (WHERE rce.status = 'absent') AS absent_count
        FROM transport_roll_calls rc
        LEFT JOIN transport_roll_call_entries rce ON rce.roll_call_id = rc.id
        WHERE rc.bus_id = ${bid}::uuid AND rc.term_id = ${tid}::uuid
        GROUP BY rc.id
        ORDER BY rc.date DESC, rc.trip_type ASC
        LIMIT 30
      ` as any[]
      return reply.send({ history })
    })

  // ─── INCIDENTS ────────────────────────────────────────────────────────────

  app.get('/transport/incidents', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { busId } = request.query as any
      const db = tenantDb(request).query
      let incidents: any[]
      if (busId) {
        const bid = String(busId)
        incidents = await db`
          SELECT ti.*, b.name AS bus_name, u.full_name AS reported_by_name
          FROM transport_incidents ti
          JOIN buses b ON b.id = ti.bus_id
          LEFT JOIN users u ON u.id = ti.reported_by
          WHERE ti.bus_id = ${bid}::uuid
          ORDER BY ti.date DESC
        ` as any[]
      } else {
        incidents = await db`
          SELECT ti.*, b.name AS bus_name, u.full_name AS reported_by_name
          FROM transport_incidents ti
          JOIN buses b ON b.id = ti.bus_id
          LEFT JOIN users u ON u.id = ti.reported_by
          ORDER BY ti.date DESC
          LIMIT 50
        ` as any[]
      }
      return reply.send({ incidents })
    })

  app.post('/transport/incidents', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        busId: z.string().uuid(),
        date: z.string(),
        incidentType: z.enum(['breakdown', 'accident', 'late_arrival', 'misconduct', 'other']),
        description: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { busId, date, incidentType, description, severity } = body.data
      const db = tenantDb(request).query
      const schoolId = request.schoolId
      const reportedBy = request.user?.id ?? null
      const bid = busId
      const dt = date
      const it = incidentType
      const desc = description
      const sev = severity
      const rb = reportedBy
      const [incident] = await db`
        INSERT INTO transport_incidents (school_id, bus_id, reported_by, date, incident_type, description, severity)
        VALUES (${schoolId}, ${bid}::uuid, ${rb}, ${dt}::date, ${it}, ${desc}, ${sev})
        RETURNING *
      ` as any[]
      return reply.send({ incident })
    })

  app.patch('/transport/incidents/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        resolved: z.boolean().optional(),
        resolutionNotes: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { resolved, resolutionNotes } = body.data
      const rv = resolved ?? null
      const rn = resolutionNotes ?? null
      const db = tenantDb(request).query
      const [incident] = await db`
        UPDATE transport_incidents SET
          resolved = COALESCE(${rv}, resolved),
          resolution_notes = COALESCE(${rn}, resolution_notes)
        WHERE id = ${id}::uuid
        RETURNING *
      ` as any[]
      return reply.send({ incident })
    })

  // ─── MAINTENANCE ──────────────────────────────────────────────────────────

  app.get('/transport/maintenance', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { busId } = request.query as any
      const db = tenantDb(request).query
      let records: any[]
      if (busId) {
        const bid = String(busId)
        records = await db`
          SELECT tm.*, b.name AS bus_name
          FROM transport_maintenance tm
          JOIN buses b ON b.id = tm.bus_id
          WHERE tm.bus_id = ${bid}::uuid
          ORDER BY tm.date DESC
        ` as any[]
      } else {
        records = await db`
          SELECT tm.*, b.name AS bus_name
          FROM transport_maintenance tm
          JOIN buses b ON b.id = tm.bus_id
          ORDER BY tm.date DESC
          LIMIT 50
        ` as any[]
      }
      return reply.send({ records })
    })

  app.post('/transport/maintenance', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        busId: z.string().uuid(),
        date: z.string(),
        maintenanceType: z.enum(['routine', 'repair', 'inspection', 'tyre', 'other']),
        description: z.string(),
        cost: z.number().default(0),
        performedBy: z.string().optional(),
        nextMaintenanceDate: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { busId, date, maintenanceType, description, cost, performedBy, nextMaintenanceDate } = body.data
      const db = tenantDb(request).query
      const schoolId = request.schoolId
      const bid = busId
      const dt = date
      const mt = maintenanceType
      const desc = description
      const c = cost
      const pb = performedBy ?? null
      const nmd = nextMaintenanceDate ?? null
      const [record] = await db`
        INSERT INTO transport_maintenance (school_id, bus_id, date, maintenance_type, description, cost, performed_by, next_maintenance_date)
        VALUES (${schoolId}, ${bid}::uuid, ${dt}::date, ${mt}, ${desc}, ${c}, ${pb}, ${nmd})
        RETURNING *
      ` as any[]
      return reply.send({ record })
    })

  app.delete('/transport/maintenance/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request).query
      await db`DELETE FROM transport_maintenance WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── PARENT VISIBILITY ────────────────────────────────────────────────────

  app.get('/transport/student/:studentId', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { studentId } = request.params as any
      const { termId } = request.query as any
      const db = tenantDb(request).query
      const sid = String(studentId)
      const tid = String(termId)
      const [transport] = await db`
        SELECT st.*,
          b.name AS bus_name, b.plate_number,
          b.driver_name, b.driver_phone,
          tr.name AS route_name,
          tr.morning_departure_time, tr.afternoon_departure_time,
          rs.name AS stop_name,
          rs.estimated_pickup_time AS morning_pickup_time,
          rs.estimated_dropoff_time AS afternoon_dropoff_time
        FROM student_transport st
        JOIN buses b ON b.id = st.bus_id
        JOIN transport_routes tr ON tr.id = st.route_id
        LEFT JOIN route_stops rs ON rs.id = st.stop_id
        WHERE st.student_id = ${sid}::uuid AND st.term_id = ${tid}::uuid AND st.is_active = true
      ` as any[]
      return reply.send({ transport: transport ?? null })
    })

}