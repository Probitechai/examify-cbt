import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function hostelRoutes(app: FastifyInstance) {

  // ── HOSTELS ───────────────────────────────────────────────────────────────

  app.get('/hostels', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT h.*, u.full_name AS housemaster_name,
               COUNT(DISTINCT hr.id) AS room_count,
               COUNT(DISTINCT hb.id) AS total_beds,
               COUNT(DISTINCT ha.id) FILTER (WHERE ha.is_active = true) AS occupied_beds
        FROM hostels h
        LEFT JOIN users u ON u.id = h.housemaster_id
        LEFT JOIN hostel_rooms hr ON hr.hostel_id = h.id AND hr.is_active = true
        LEFT JOIN hostel_beds hb ON hb.room_id = hr.id
        LEFT JOIN hostel_allocations ha ON ha.hostel_id = h.id AND ha.is_active = true
        WHERE h.school_id = ${request.schoolId}::uuid AND h.is_active = true
        GROUP BY h.id, u.full_name
        ORDER BY h.name ASC
      ` as any[]
      return reply.send({ hostels: rows })
    })

  app.post('/hostels', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        name: z.string().min(1),
        type: z.enum(['male', 'female', 'mixed']),
        housemasterId: z.string().uuid().optional(),
        capacity: z.number().int().min(0).default(0),
        description: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const name = d.name
      const type = d.type
      const hmid = d.housemasterId ?? null
      const cap = d.capacity
      const desc = d.description ?? null
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO hostels (school_id, name, type, housemaster_id, capacity, description)
        VALUES (${request.schoolId}::uuid, ${name}, ${type}, ${hmid}, ${cap}, ${desc})
        RETURNING id, name, type
      ` as any[]
      return reply.status(201).send({ hostel: rows[0] })
    })

  app.patch('/hostels/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        name: z.string().min(1).optional(),
        type: z.enum(['male', 'female', 'mixed']).optional(),
        housemasterId: z.string().uuid().nullable().optional(),
        capacity: z.number().int().min(0).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const hid = String(id)
      const tdb = tenantDb(request.schoolId)
      if (d.name !== undefined) {
        const name = d.name
        await tdb.query`UPDATE hostels SET name = ${name}, updated_at = now() WHERE id = ${hid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.type !== undefined) {
        const type = d.type
        await tdb.query`UPDATE hostels SET type = ${type}, updated_at = now() WHERE id = ${hid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.housemasterId !== undefined) {
        const hmid = d.housemasterId
        await tdb.query`UPDATE hostels SET housemaster_id = ${hmid}, updated_at = now() WHERE id = ${hid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.description !== undefined) {
        const desc = d.description
        await tdb.query`UPDATE hostels SET description = ${desc}, updated_at = now() WHERE id = ${hid}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      return reply.send({ updated: true })
    })

  app.delete('/hostels/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const hid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`UPDATE hostels SET is_active = false, updated_at = now() WHERE id = ${hid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── ROOMS ─────────────────────────────────────────────────────────────────

  app.get('/hostels/:hostelId/rooms', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { hostelId } = request.params as any
      const hid = String(hostelId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT hr.*,
               COUNT(hb.id) AS total_beds,
               COUNT(hb.id) FILTER (WHERE hb.is_available = false) AS occupied_beds,
               COUNT(hb.id) FILTER (WHERE hb.is_available = true) AS available_beds
        FROM hostel_rooms hr
        LEFT JOIN hostel_beds hb ON hb.room_id = hr.id
        WHERE hr.hostel_id = ${hid}::uuid AND hr.school_id = ${request.schoolId}::uuid AND hr.is_active = true
        GROUP BY hr.id
        ORDER BY hr.floor_number ASC, hr.room_number ASC
      ` as any[]
      return reply.send({ rooms: rows })
    })

  app.post('/hostels/:hostelId/rooms', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { hostelId } = request.params as any
      const schema = z.object({
        roomNumber: z.string().min(1),
        roomType: z.enum(['single', 'shared', 'dormitory']).default('shared'),
        bedCapacity: z.number().int().min(1).default(4),
        floorNumber: z.number().int().min(1).default(1),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const hid = String(hostelId)
      const rn = d.roomNumber
      const rt = d.roomType
      const bc = d.bedCapacity
      const fl = d.floorNumber
      const tdb = tenantDb(request.schoolId)

      // Create room
      const roomRows = await tdb.query`
        INSERT INTO hostel_rooms (school_id, hostel_id, room_number, room_type, bed_capacity, floor_number)
        VALUES (${request.schoolId}::uuid, ${hid}::uuid, ${rn}, ${rt}, ${bc}, ${fl})
        RETURNING id, room_number
      ` as any[]
      const room = roomRows[0]

      // Auto-create beds
      for (let i = 1; i <= bc; i++) {
        const bedNum = `Bed ${i}`
        await tdb.query`
          INSERT INTO hostel_beds (school_id, room_id, bed_number)
          VALUES (${request.schoolId}::uuid, ${room.id}::uuid, ${bedNum})
        `
      }

      return reply.status(201).send({ room: { ...room, beds_created: bc } })
    })

  app.delete('/hostels/rooms/:roomId', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { roomId } = request.params as any
      const rid = String(roomId)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`UPDATE hostel_rooms SET is_active = false WHERE id = ${rid}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── BEDS ──────────────────────────────────────────────────────────────────

  app.get('/hostels/rooms/:roomId/beds', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { roomId } = request.params as any
      const rid = String(roomId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT hb.*, 
               ha.student_id, ha.is_active AS is_allocated,
               u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm
        FROM hostel_beds hb
        LEFT JOIN hostel_allocations ha ON ha.bed_id = hb.id AND ha.is_active = true
        LEFT JOIN users u ON u.id = ha.student_id
        WHERE hb.room_id = ${rid}::uuid AND hb.school_id = ${request.schoolId}::uuid
        ORDER BY hb.bed_number ASC
      ` as any[]
      return reply.send({ beds: rows })
    })

  // ── ALLOCATIONS ───────────────────────────────────────────────────────────

  app.get('/hostels/allocations', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId, hostelId, classLevel } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const tid = termId ? String(termId) : null
      const hid = hostelId ? String(hostelId) : null
      const cl = classLevel ? String(classLevel) : null

      let rows: any[]
      if (tid && hid) {
        rows = await tdb.query`
          SELECT ha.*, u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm,
                 h.name AS hostel_name, hr.room_number, hb.bed_number
          FROM hostel_allocations ha
          JOIN users u ON u.id = ha.student_id
          JOIN hostels h ON h.id = ha.hostel_id
          JOIN hostel_rooms hr ON hr.id = ha.room_id
          JOIN hostel_beds hb ON hb.id = ha.bed_id
          WHERE ha.school_id = ${request.schoolId}::uuid
          AND ha.term_id = ${tid}::uuid AND ha.hostel_id = ${hid}::uuid
          AND ha.is_active = true
          ORDER BY u.full_name ASC
        ` as any[]
      } else if (tid) {
        rows = await tdb.query`
          SELECT ha.*, u.full_name AS student_name, u.admission_no, u.class_level, u.class_arm,
                 h.name AS hostel_name, hr.room_number, hb.bed_number
          FROM hostel_allocations ha
          JOIN users u ON u.id = ha.student_id
          JOIN hostels h ON h.id = ha.hostel_id
          JOIN hostel_rooms hr ON hr.id = ha.room_id
          JOIN hostel_beds hb ON hb.id = ha.bed_id
          WHERE ha.school_id = ${request.schoolId}::uuid
          AND ha.term_id = ${tid}::uuid AND ha.is_active = true
          ORDER BY h.name ASC, hr.room_number ASC, u.full_name ASC
        ` as any[]
      } else {
        rows = []
      }
      return reply.send({ allocations: rows })
    })

  app.post('/hostels/allocations', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        studentId: z.string().uuid(),
        bedId: z.string().uuid(),
        hostelId: z.string().uuid(),
        roomId: z.string().uuid(),
        termId: z.string().uuid(),
        notes: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const stid = d.studentId
      const bid = d.bedId
      const hid = d.hostelId
      const rid = d.roomId
      const tid = d.termId
      const notes = d.notes ?? null
      const uid = request.user?.id
if (!uid) return reply.status(401).send({ error: 'UNAUTHORIZED' })
      const tdb = tenantDb(request.schoolId)

      // Check bed is available
      const bedCheck = await tdb.query`
        SELECT id, is_available FROM hostel_beds
        WHERE id = ${bid}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!bedCheck[0]) return reply.status(404).send({ error: 'Bed not found' })
      if (!bedCheck[0].is_available) return reply.status(400).send({ error: 'Bed is already occupied' })

      // Check student not already allocated in this term
      const existing = await tdb.query`
        SELECT id FROM hostel_allocations
        WHERE student_id = ${stid}::uuid AND term_id = ${tid}::uuid
        AND school_id = ${request.schoolId}::uuid AND is_active = true
      ` as any[]
      if (existing.length > 0) return reply.status(400).send({ error: 'Student already has a bed allocation for this term' })

      // Create allocation
      await tdb.query`
        INSERT INTO hostel_allocations (school_id, student_id, bed_id, hostel_id, room_id, term_id, notes, created_by)
        VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${bid}::uuid, ${hid}::uuid, ${rid}::uuid, ${tid}::uuid, ${notes}, ${uid}::uuid)
      `

      // Mark bed as unavailable
      await tdb.query`
        UPDATE hostel_beds SET is_available = false WHERE id = ${bid}::uuid AND school_id = ${request.schoolId}::uuid
      `

      return reply.status(201).send({ allocated: true })
    })

  app.delete('/hostels/allocations/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const aid = String(id)
      const tdb = tenantDb(request.schoolId)

      // Get bed id
      const alloc = await tdb.query`
        SELECT bed_id FROM hostel_allocations WHERE id = ${aid}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!alloc[0]) return reply.status(404).send({ error: 'Allocation not found' })

      // Vacate allocation
      await tdb.query`
        UPDATE hostel_allocations SET is_active = false, vacated_at = now()
        WHERE id = ${aid}::uuid AND school_id = ${request.schoolId}::uuid
      `

      // Free up the bed
      const bedId = alloc[0].bed_id
      await tdb.query`
        UPDATE hostel_beds SET is_available = true WHERE id = ${bedId}::uuid AND school_id = ${request.schoolId}::uuid
      `

      return reply.send({ vacated: true })
    })

  // ── OCCUPANCY REPORT ──────────────────────────────────────────────────────

  app.get('/hostels/occupancy', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { termId } = request.query as any
      if (!termId) return reply.status(400).send({ error: 'termId required' })
      const tid = String(termId)
      const tdb = tenantDb(request.schoolId)

      const report = await tdb.query`
        SELECT h.id, h.name, h.type, h.housemaster_id,
               u.full_name AS housemaster_name,
               COUNT(DISTINCT hb.id) AS total_beds,
               COUNT(DISTINCT ha.id) FILTER (WHERE ha.is_active = true AND ha.term_id = ${tid}::uuid) AS occupied_beds,
               COUNT(DISTINCT hb.id) - COUNT(DISTINCT ha.id) FILTER (WHERE ha.is_active = true AND ha.term_id = ${tid}::uuid) AS available_beds,
               ROUND(
                 COUNT(DISTINCT ha.id) FILTER (WHERE ha.is_active = true AND ha.term_id = ${tid}::uuid)::numeric /
                 NULLIF(COUNT(DISTINCT hb.id), 0) * 100, 1
               ) AS occupancy_pct
        FROM hostels h
        LEFT JOIN users u ON u.id = h.housemaster_id
        LEFT JOIN hostel_rooms hr ON hr.hostel_id = h.id AND hr.is_active = true
        LEFT JOIN hostel_beds hb ON hb.room_id = hr.id
        LEFT JOIN hostel_allocations ha ON ha.hostel_id = h.id
        WHERE h.school_id = ${request.schoolId}::uuid AND h.is_active = true
        GROUP BY h.id, h.name, h.type, h.housemaster_id, u.full_name
        ORDER BY h.name ASC
      ` as any[]

      return reply.send({ report })
    })

  // ── STUDENT HOSTEL INFO ───────────────────────────────────────────────────

  app.get('/hostels/student/:studentId', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { studentId } = request.params as any
      const { termId } = request.query as any
      const sid = String(studentId)
      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (termId) {
        const tid = String(termId)
        rows = await tdb.query`
          SELECT ha.*, h.name AS hostel_name, h.type AS hostel_type,
                 hr.room_number, hr.floor_number, hb.bed_number,
                 u.full_name AS housemaster_name, u.phone AS housemaster_phone
          FROM hostel_allocations ha
          JOIN hostels h ON h.id = ha.hostel_id
          LEFT JOIN users u ON u.id = h.housemaster_id
          JOIN hostel_rooms hr ON hr.id = ha.room_id
          JOIN hostel_beds hb ON hb.id = ha.bed_id
          WHERE ha.student_id = ${sid}::uuid AND ha.term_id = ${tid}::uuid
          AND ha.school_id = ${request.schoolId}::uuid AND ha.is_active = true
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT ha.*, h.name AS hostel_name, h.type AS hostel_type,
                 hr.room_number, hr.floor_number, hb.bed_number,
                 u.full_name AS housemaster_name, u.phone AS housemaster_phone
          FROM hostel_allocations ha
          JOIN hostels h ON h.id = ha.hostel_id
          LEFT JOIN users u ON u.id = h.housemaster_id
          JOIN hostel_rooms hr ON hr.id = ha.room_id
          JOIN hostel_beds hb ON hb.id = ha.bed_id
          WHERE ha.student_id = ${sid}::uuid
          AND ha.school_id = ${request.schoolId}::uuid AND ha.is_active = true
          ORDER BY ha.allocated_at DESC
        ` as any[]
      }

      return reply.send({ allocation: rows[0] ?? null })
    })
}
