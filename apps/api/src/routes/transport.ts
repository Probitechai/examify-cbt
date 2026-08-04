import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function transportRoutes(app: FastifyInstance) {

  // ─── BUSES ────────────────────────────────────────────────────────────────

  // GET all buses
  app.get('/transport/buses', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const db = tenantDb(request).query
      const buses = await db`
        SELECT b.*,
          COUNT(DISTINCT st.id) FILTER (WHERE st.is_active) AS assigned_students
        FROM buses b
        LEFT JOIN student_transport st ON st.bus_id = b.id
        WHERE b.is_active = true
        GROUP BY b.id
        ORDER BY b.name ASC
      ` as any[]
      return reply.send({ buses })
    })

  // POST create bus
  app.post('/transport/buses', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        name: z.string(),
        plateNumber: z.string(),
        capacity: z.number().int().min(1).default(30),
        driverName: z.string().optional(),
        driverPhone: z.string().optional(),
        driverLicense: z.string().optional(),
        notes: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { name, plateNumber, capacity, driverName, driverPhone, driverLicense, notes } = body.data
      const n = name
      const pn = plateNumber
      const cap = capacity
      const dn = driverName ?? null
      const dp = driverPhone ?? null
      const dl = driverLicense ?? null
      const nt = notes ?? null
      const db = tenantDb(request).query
      const [bus] = await db`
        INSERT INTO buses (school_id, name, plate_number, capacity, driver_name, driver_phone, driver_license, notes)
        VALUES (${request.schoolId}, ${n}, ${pn}, ${cap}, ${dn}, ${dp}, ${dl}, ${nt})
        RETURNING *
      ` as any[]
      return reply.send({ bus })
    })

  // PATCH update bus
  app.patch('/transport/buses/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        name: z.string().optional(),
        plateNumber: z.string().optional(),
        capacity: z.number().int().min(1).optional(),
        driverName: z.string().optional(),
        driverPhone: z.string().optional(),
        driverLicense: z.string().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { name, plateNumber, capacity, driverName, driverPhone, driverLicense, isActive, notes } = body.data
      const n = name ?? null
      const pn = plateNumber ?? null
      const cap = capacity ?? null
      const dn = driverName ?? null
      const dp = driverPhone ?? null
      const dl = driverLicense ?? null
      const ia = isActive ?? null
      const nt = notes ?? null
      const db = tenantDb(request).query
      const [bus] = await db`
        UPDATE buses SET
          name = COALESCE(${n}, name),
          plate_number = COALESCE(${pn}, plate_number),
          capacity = COALESCE(${cap}, capacity),
          driver_name = COALESCE(${dn}, driver_name),
          driver_phone = COALESCE(${dp}, driver_phone),
          driver_license = COALESCE(${dl}, driver_license),
          is_active = COALESCE(${ia}, is_active),
          notes = COALESCE(${nt}, notes)
        WHERE id = ${id}::uuid
        RETURNING *
      ` as any[]
      return reply.send({ bus })
    })

  // DELETE bus
  app.delete('/transport/buses/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request).query
      await db`DELETE FROM buses WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── ROUTES ───────────────────────────────────────────────────────────────

  // GET all routes with stops
  app.get('/transport/routes', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const db = tenantDb(request).query
      const routes = await db`
        SELECT tr.*,
          b.name AS bus_name, b.plate_number, b.capacity, b.driver_name, b.driver_phone,
          COUNT(DISTINCT st.id) FILTER (WHERE st.is_active) AS assigned_students
        FROM transport_routes tr
        LEFT JOIN buses b ON b.id = tr.bus_id
        LEFT JOIN student_transport st ON st.route_id = tr.id
        WHERE tr.is_active = true
        GROUP BY tr.id, b.id
        ORDER BY tr.name ASC
      ` as any[]

      const routeIds = routes.map((r: any) => r.id)
      let stops: any[] = []
      if (routeIds.length > 0) {
        stops = await db`
          SELECT * FROM route_stops
          WHERE route_id = ANY(${routeIds}::uuid[])
          ORDER BY sort_order ASC
        ` as any[]
      }

      const routesWithStops = routes.map((r: any) => ({
        ...r,
        stops: stops.filter((s: any) => s.route_id === r.id),
      }))

      return reply.send({ routes: routesWithStops })
    })

  // POST create route
  app.post('/transport/routes', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        name: z.string(),
        busId: z.string().uuid().optional().or(z.literal('')),
        morningDepartureTime: z.string().optional(),
        afternoonDepartureTime: z.string().optional(),
        notes: z.string().optional(),
        stops: z.array(z.object({
          name: z.string(),
          estimatedPickupTime: z.string().optional(),
          estimatedDropoffTime: z.string().optional(),
          sortOrder: z.number().int().default(0),
        })).optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { name, busId, morningDepartureTime, afternoonDepartureTime, notes, stops } = body.data
      const n = name
      const bid = busId && busId !== '' ? busId : null
      const mdt = morningDepartureTime ?? null
      const adt = afternoonDepartureTime ?? null
      const nt = notes ?? null
      const db = tenantDb(request).query

      const [route] = await db`
        INSERT INTO transport_routes (school_id, name, bus_id, morning_departure_time, afternoon_departure_time, notes)
        VALUES (${request.schoolId}, ${n}, ${bid}, ${mdt}, ${adt}, ${nt})
        RETURNING *
      ` as any[]

      if (stops && stops.length > 0) {
        for (const stop of stops) {
          const sn = stop.name
          const ept = stop.estimatedPickupTime ?? null
          const edt = stop.estimatedDropoffTime ?? null
          const so = stop.sortOrder
          const rid = route.id
          await db`
            INSERT INTO route_stops (school_id, route_id, name, estimated_pickup_time, estimated_dropoff_time, sort_order)
            VALUES (${request.schoolId}, ${rid}::uuid, ${sn}, ${ept}, ${edt}, ${so})
          `
        }
      }

      return reply.send({ route })
    })

  // PATCH update route
  app.patch('/transport/routes/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        name: z.string().optional(),
        busId: z.string().uuid().nullable().optional().or(z.literal('')),
        morningDepartureTime: z.string().nullable().optional(),
        afternoonDepartureTime: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { name, busId, morningDepartureTime, afternoonDepartureTime, isActive, notes } = body.data
      const n = name ?? null
      const bid = busId ?? null
      const mdt = morningDepartureTime ?? null
      const adt = afternoonDepartureTime ?? null
      const ia = isActive ?? null
      const nt = notes ?? null
      const db = tenantDb(request).query
      const [route] = await db`
        UPDATE transport_routes SET
          name = COALESCE(${n}, name),
          bus_id = COALESCE(${bid}, bus_id),
          morning_departure_time = COALESCE(${mdt}, morning_departure_time),
          afternoon_departure_time = COALESCE(${adt}, afternoon_departure_time),
          is_active = COALESCE(${ia}, is_active),
          notes = COALESCE(${nt}, notes)
        WHERE id = ${id}::uuid
        RETURNING *
      ` as any[]
      return reply.send({ route })
    })

  // DELETE route
  app.delete('/transport/routes/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request).query
      await db`DELETE FROM route_stops WHERE route_id = ${id}::uuid`
      await db`DELETE FROM transport_routes WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── STOPS ────────────────────────────────────────────────────────────────

  // POST add stop to route
  app.post('/transport/routes/:routeId/stops', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { routeId } = request.params as any
      const schema = z.object({
        name: z.string(),
        estimatedPickupTime: z.string().optional(),
        estimatedDropoffTime: z.string().optional(),
        sortOrder: z.number().int().default(0),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { name, estimatedPickupTime, estimatedDropoffTime, sortOrder } = body.data
      const sn = name
      const ept = estimatedPickupTime ?? null
      const edt = estimatedDropoffTime ?? null
      const so = sortOrder
      const rid = routeId
      const db = tenantDb(request).query
      const [stop] = await db`
        INSERT INTO route_stops (school_id, route_id, name, estimated_pickup_time, estimated_dropoff_time, sort_order)
        VALUES (${request.schoolId}, ${rid}::uuid, ${sn}, ${ept}, ${edt}, ${so})
        RETURNING *
      ` as any[]
      return reply.send({ stop })
    })

  // DELETE stop
  app.delete('/transport/stops/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request).query
      await db`DELETE FROM route_stops WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── STUDENT ASSIGNMENTS ──────────────────────────────────────────────────

  // GET all assignments
  app.get('/transport/assignments', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId, busId, routeId } = request.query as any
      const db = tenantDb(request).query
      const tid = String(termId)
      let assignments: any[]
      if (busId) {
        const bid = String(busId)
        assignments = await db`
          SELECT st.*,
            u.full_name AS student_name, u.class_level, u.class_arm, u.admission_no,
            b.name AS bus_name, b.plate_number,
            tr.name AS route_name,
            rs.name AS stop_name, rs.estimated_pickup_time
          FROM student_transport st
          JOIN users u ON u.id = st.student_id
          JOIN buses b ON b.id = st.bus_id
          JOIN transport_routes tr ON tr.id = st.route_id
          LEFT JOIN route_stops rs ON rs.id = st.stop_id
          WHERE st.term_id = ${tid}::uuid AND st.bus_id = ${bid}::uuid AND st.is_active = true
          ORDER BY u.class_level ASC, u.full_name ASC
        ` as any[]
      } else if (routeId) {
        const rid = String(routeId)
        assignments = await db`
          SELECT st.*,
            u.full_name AS student_name, u.class_level, u.class_arm, u.admission_no,
            b.name AS bus_name, b.plate_number,
            tr.name AS route_name,
            rs.name AS stop_name, rs.estimated_pickup_time
          FROM student_transport st
          JOIN users u ON u.id = st.student_id
          JOIN buses b ON b.id = st.bus_id
          JOIN transport_routes tr ON tr.id = st.route_id
          LEFT JOIN route_stops rs ON rs.id = st.stop_id
          WHERE st.term_id = ${tid}::uuid AND st.route_id = ${rid}::uuid AND st.is_active = true
          ORDER BY rs.sort_order ASC, u.full_name ASC
        ` as any[]
      } else {
        assignments = await db`
          SELECT st.*,
            u.full_name AS student_name, u.class_level, u.class_arm, u.admission_no,
            b.name AS bus_name, b.plate_number,
            tr.name AS route_name,
            rs.name AS stop_name, rs.estimated_pickup_time
          FROM student_transport st
          JOIN users u ON u.id = st.student_id
          JOIN buses b ON b.id = st.bus_id
          JOIN transport_routes tr ON tr.id = st.route_id
          LEFT JOIN route_stops rs ON rs.id = st.stop_id
          WHERE st.term_id = ${tid}::uuid AND st.is_active = true
          ORDER BY b.name ASC, u.full_name ASC
        ` as any[]
      }
      return reply.send({ assignments })
    })

  // POST assign student
  app.post('/transport/assignments', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        studentId: z.string().uuid(),
        busId: z.string().uuid(),
        routeId: z.string().uuid(),
        stopId: z.string().uuid().optional(),
        termId: z.string().uuid(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { studentId, busId, routeId, stopId, termId } = body.data
      const db = tenantDb(request).query

      const bid = busId
      const tid = termId
      const [bus] = await db`SELECT capacity FROM buses WHERE id = ${bid}::uuid` as any[]
      const [countRow] = await db`
        SELECT COUNT(*) AS count FROM student_transport
        WHERE bus_id = ${bid}::uuid AND term_id = ${tid}::uuid AND is_active = true
      ` as any[]
      if (Number(countRow.count) >= Number(bus?.capacity ?? 30)) {
        return reply.status(400).send({ error: 'BUS_FULL', message: 'Bus has reached maximum capacity' })
      }

      const sid = studentId
      const rid = routeId
      const stid = stopId ?? null
      const [assignment] = await db`
        INSERT INTO student_transport (school_id, student_id, bus_id, route_id, stop_id, term_id)
        VALUES (${request.schoolId}, ${sid}::uuid, ${bid}::uuid, ${rid}::uuid, ${stid ? stid + '::uuid' : null}, ${tid}::uuid)
        ON CONFLICT (school_id, student_id, term_id) DO UPDATE SET
          bus_id = EXCLUDED.bus_id,
          route_id = EXCLUDED.route_id,
          stop_id = EXCLUDED.stop_id,
          is_active = true
        RETURNING *
      ` as any[]
      return reply.send({ assignment })
    })

  // DELETE assignment
  app.delete('/transport/assignments/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request).query
      await db`UPDATE student_transport SET is_active = false WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── OCCUPANCY REPORT ─────────────────────────────────────────────────────

  app.get('/transport/occupancy', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId } = request.query as any
      const tid = String(termId)
      const db = tenantDb(request).query
      const report = await db`
        SELECT
          b.id, b.name AS bus_name, b.plate_number, b.capacity,
          b.driver_name, b.driver_phone,
          COUNT(st.id) FILTER (WHERE st.is_active) AS assigned_students,
          ROUND(COUNT(st.id) FILTER (WHERE st.is_active)::numeric / NULLIF(b.capacity, 0) * 100) AS occupancy_pct,
          tr.name AS route_name
        FROM buses b
        LEFT JOIN student_transport st ON st.bus_id = b.id AND st.term_id = ${tid}::uuid
        LEFT JOIN transport_routes tr ON tr.bus_id = b.id AND tr.is_active = true
        WHERE b.is_active = true
        GROUP BY b.id, tr.id
        ORDER BY b.name ASC
      ` as any[]
      return reply.send({ report })
    })

  // ─── UNASSIGNED STUDENTS ──────────────────────────────────────────────────

  app.get('/transport/unassigned-students', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId } = request.query as any
      const tid = String(termId)
      const db = tenantDb(request).query
      const students = await db`
        SELECT id, full_name, class_level, class_arm, admission_no
        FROM users
        WHERE school_id = ${request.schoolId}::uuid
          AND role = 'student'
          AND is_active = true
          AND id NOT IN (
            SELECT student_id FROM student_transport
            WHERE term_id = ${tid}::uuid AND is_active = true
          )
        ORDER BY class_level ASC, full_name ASC
      ` as any[]
      return reply.send({ students })
    })

}
