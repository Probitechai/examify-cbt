import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function transportRoutes(app: FastifyInstance) {

  // ─── BUSES ────────────────────────────────────────────────────────────────

  // GET all buses
  app.get('/transport/buses', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const db = tenantDb(request)
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
  app.post('/transport/buses', { preHandler: [authenticate, requireRole(['school_admin'])] },
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
      const db = tenantDb(request)
      const [bus] = await db`
        INSERT INTO buses (school_id, name, plate_number, capacity, driver_name, driver_phone, driver_license, notes)
        VALUES (${request.schoolId}, ${name}, ${plateNumber}, ${capacity},
          ${driverName ?? null}, ${driverPhone ?? null}, ${driverLicense ?? null}, ${notes ?? null})
        RETURNING *
      ` as any[]
      return reply.send({ bus })
    })

  // PATCH update bus
  app.patch('/transport/buses/:id', { preHandler: [authenticate, requireRole(['school_admin'])] },
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
      const db = tenantDb(request)
      const { name, plateNumber, capacity, driverName, driverPhone, driverLicense, isActive, notes } = body.data
      const [bus] = await db`
        UPDATE buses SET
          name = COALESCE(${name ?? null}, name),
          plate_number = COALESCE(${plateNumber ?? null}, plate_number),
          capacity = COALESCE(${capacity ?? null}, capacity),
          driver_name = COALESCE(${driverName ?? null}, driver_name),
          driver_phone = COALESCE(${driverPhone ?? null}, driver_phone),
          driver_license = COALESCE(${driverLicense ?? null}, driver_license),
          is_active = COALESCE(${isActive ?? null}, is_active),
          notes = COALESCE(${notes ?? null}, notes)
        WHERE id = ${id}::uuid
        RETURNING *
      ` as any[]
      return reply.send({ bus })
    })

  // DELETE bus
  app.delete('/transport/buses/:id', { preHandler: [authenticate, requireRole(['school_admin'])] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request)
      await db`DELETE FROM buses WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── ROUTES ───────────────────────────────────────────────────────────────

  // GET all routes
  app.get('/transport/routes', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const db = tenantDb(request)
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

      // get stops per route
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
  app.post('/transport/routes', { preHandler: [authenticate, requireRole(['school_admin'])] },
    async (request: any, reply: any) => {
      const schema = z.object({
        name: z.string(),
        busId: z.string().uuid().optional(),
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
      const db = tenantDb(request)

      const [route] = await db`
        INSERT INTO transport_routes (school_id, name, bus_id, morning_departure_time, afternoon_departure_time, notes)
        VALUES (${request.schoolId}, ${name}, ${busId ?? null},
          ${morningDepartureTime ?? null}, ${afternoonDepartureTime ?? null}, ${notes ?? null})
        RETURNING *
      ` as any[]

      if (stops && stops.length > 0) {
        for (const stop of stops) {
          const sn = stop.name
          const ept = stop.estimatedPickupTime ?? null
          const edt = stop.estimatedDropoffTime ?? null
          const so = stop.sortOrder
          await db`
            INSERT INTO route_stops (school_id, route_id, name, estimated_pickup_time, estimated_dropoff_time, sort_order)
            VALUES (${request.schoolId}, ${route.id}::uuid, ${sn}, ${ept}, ${edt}, ${so})
          `
        }
      }

      return reply.send({ route })
    })

  // PATCH update route
  app.patch('/transport/routes/:id', { preHandler: [authenticate, requireRole(['school_admin'])] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        name: z.string().optional(),
        busId: z.string().uuid().nullable().optional(),
        morningDepartureTime: z.string().nullable().optional(),
        afternoonDepartureTime: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        notes: z.string().nullable().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const db = tenantDb(request)
      const { name, busId, morningDepartureTime, afternoonDepartureTime, isActive, notes } = body.data
      const [route] = await db`
        UPDATE transport_routes SET
          name = COALESCE(${name ?? null}, name),
          bus_id = COALESCE(${busId ?? null}, bus_id),
          morning_departure_time = COALESCE(${morningDepartureTime ?? null}, morning_departure_time),
          afternoon_departure_time = COALESCE(${afternoonDepartureTime ?? null}, afternoon_departure_time),
          is_active = COALESCE(${isActive ?? null}, is_active),
          notes = COALESCE(${notes ?? null}, notes)
        WHERE id = ${id}::uuid
        RETURNING *
      ` as any[]
      return reply.send({ route })
    })

  // DELETE route
  app.delete('/transport/routes/:id', { preHandler: [authenticate, requireRole(['school_admin'])] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request)
      await db`DELETE FROM route_stops WHERE route_id = ${id}::uuid`
      await db`DELETE FROM transport_routes WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── STOPS ────────────────────────────────────────────────────────────────

  // POST add stop to route
  app.post('/transport/routes/:routeId/stops', { preHandler: [authenticate, requireRole(['school_admin'])] },
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
      const db = tenantDb(request)
      const sn = name
      const ept = estimatedPickupTime ?? null
      const edt = estimatedDropoffTime ?? null
      const so = sortOrder
      const [stop] = await db`
        INSERT INTO route_stops (school_id, route_id, name, estimated_pickup_time, estimated_dropoff_time, sort_order)
        VALUES (${request.schoolId}, ${routeId}::uuid, ${sn}, ${ept}, ${edt}, ${so})
        RETURNING *
      ` as any[]
      return reply.send({ stop })
    })

  // DELETE stop
  app.delete('/transport/stops/:id', { preHandler: [authenticate, requireRole(['school_admin'])] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request)
      await db`DELETE FROM route_stops WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── STUDENT ASSIGNMENTS ──────────────────────────────────────────────────

  // GET all assignments (with student info)
  app.get('/transport/assignments', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId, busId, routeId } = request.query as any
      const db = tenantDb(request)
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
          WHERE st.term_id = ${termId}::uuid AND st.bus_id = ${bid}::uuid AND st.is_active = true
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
          WHERE st.term_id = ${termId}::uuid AND st.route_id = ${rid}::uuid AND st.is_active = true
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
          WHERE st.term_id = ${termId}::uuid AND st.is_active = true
          ORDER BY b.name ASC, u.full_name ASC
        ` as any[]
      }
      return reply.send({ assignments })
    })

  // POST assign student to bus/route/stop
  app.post('/transport/assignments', { preHandler: [authenticate, requireRole(['school_admin'])] },
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
      const db = tenantDb(request)

      // check bus capacity
      const [bus] = await db`SELECT capacity FROM buses WHERE id = ${busId}::uuid` as any[]
      const [{ count }] = await db`
        SELECT COUNT(*) FROM student_transport
        WHERE bus_id = ${busId}::uuid AND term_id = ${termId}::uuid AND is_active = true
      ` as any[]
      if (Number(count) >= Number(bus?.capacity ?? 30)) {
        return reply.status(400).send({ error: 'BUS_FULL', message: 'Bus has reached maximum capacity' })
      }

      const sid = studentId
      const bid = busId
      const rid = routeId
      const stid = stopId ?? null
      const tid = termId
      const [assignment] = await db`
        INSERT INTO student_transport (school_id, student_id, bus_id, route_id, stop_id, term_id)
        VALUES (${request.schoolId}, ${sid}::uuid, ${bid}::uuid, ${rid}::uuid, ${stid ? `${stid}::uuid` : null}, ${tid}::uuid)
        ON CONFLICT (school_id, student_id, term_id) DO UPDATE SET
          bus_id = EXCLUDED.bus_id,
          route_id = EXCLUDED.route_id,
          stop_id = EXCLUDED.stop_id,
          is_active = true
        RETURNING *
      ` as any[]
      return reply.send({ assignment })
    })

  // DELETE (remove) student transport assignment
  app.delete('/transport/assignments/:id', { preHandler: [authenticate, requireRole(['school_admin'])] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const db = tenantDb(request)
      await db`UPDATE student_transport SET is_active = false WHERE id = ${id}::uuid`
      return reply.send({ ok: true })
    })

  // ─── OCCUPANCY REPORT ─────────────────────────────────────────────────────

  app.get('/transport/occupancy', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId } = request.query as any
      const db = tenantDb(request)
      const report = await db`
        SELECT
          b.id, b.name AS bus_name, b.plate_number, b.capacity,
          b.driver_name, b.driver_phone,
          COUNT(st.id) FILTER (WHERE st.is_active) AS assigned_students,
          ROUND(COUNT(st.id) FILTER (WHERE st.is_active)::numeric / b.capacity * 100) AS occupancy_pct,
          tr.name AS route_name
        FROM buses b
        LEFT JOIN student_transport st ON st.bus_id = b.id AND st.term_id = ${termId}::uuid
        LEFT JOIN transport_routes tr ON tr.bus_id = b.id AND tr.is_active = true
        WHERE b.is_active = true
        GROUP BY b.id, tr.id
        ORDER BY b.name ASC
      ` as any[]
      return reply.send({ report })
    })

  // ─── STUDENTS (unassigned) ────────────────────────────────────────────────

  app.get('/transport/unassigned-students', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId } = request.query as any
      const db = tenantDb(request)
      const students = await db`
        SELECT id, full_name, class_level, class_arm, admission_no
        FROM users
        WHERE school_id = ${request.schoolId}::uuid
          AND role = 'student'
          AND is_active = true
          AND id NOT IN (
            SELECT student_id FROM student_transport
            WHERE term_id = ${termId}::uuid AND is_active = true
          )
        ORDER BY class_level ASC, full_name ASC
      ` as any[]
      return reply.send({ students })
    })

}