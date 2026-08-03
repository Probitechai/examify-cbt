import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function hostel2Routes(app: FastifyInstance) {

  // ── EXEATS ────────────────────────────────────────────────────────────────

  app.get('/hostels/exeats', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { hostelId, termId, status } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const tid = termId ? String(termId) : null
      const hid = hostelId ? String(hostelId) : null
      const st = status ? String(status) : null

      let rows: any[]
      if (tid && hid && st) {
        rows = await tdb.query`
          SELECT he.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 h.name AS hostel_name, ab.full_name AS approved_by_name
          FROM hostel_exeats he
          JOIN users u ON u.id = he.student_id
          JOIN hostels h ON h.id = he.hostel_id
          LEFT JOIN users ab ON ab.id = he.approved_by
          WHERE he.school_id = ${request.schoolId}::uuid
          AND he.term_id = ${tid}::uuid AND he.hostel_id = ${hid}::uuid AND he.status = ${st}
          ORDER BY he.departure_date ASC
        ` as any[]
      } else if (tid && hid) {
        rows = await tdb.query`
          SELECT he.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 h.name AS hostel_name, ab.full_name AS approved_by_name
          FROM hostel_exeats he
          JOIN users u ON u.id = he.student_id
          JOIN hostels h ON h.id = he.hostel_id
          LEFT JOIN users ab ON ab.id = he.approved_by
          WHERE he.school_id = ${request.schoolId}::uuid
          AND he.term_id = ${tid}::uuid AND he.hostel_id = ${hid}::uuid
          ORDER BY he.created_at DESC
        ` as any[]
      } else if (tid) {
        rows = await tdb.query`
          SELECT he.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 h.name AS hostel_name, ab.full_name AS approved_by_name
          FROM hostel_exeats he
          JOIN users u ON u.id = he.student_id
          JOIN hostels h ON h.id = he.hostel_id
          LEFT JOIN users ab ON ab.id = he.approved_by
          WHERE he.school_id = ${request.schoolId}::uuid
          AND he.term_id = ${tid}::uuid
          ORDER BY he.created_at DESC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT he.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 h.name AS hostel_name, ab.full_name AS approved_by_name
          FROM hostel_exeats he
          JOIN users u ON u.id = he.student_id
          JOIN hostels h ON h.id = he.hostel_id
          LEFT JOIN users ab ON ab.id = he.approved_by
          WHERE he.school_id = ${request.schoolId}::uuid
          ORDER BY he.created_at DESC
          LIMIT 100
        ` as any[]
      }
      return reply.send({ exeats: rows })
    })

  app.post('/hostels/exeats', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const schema = z.object({
        studentId: z.string().uuid(),
        hostelId: z.string().uuid(),
        termId: z.string().uuid(),
        reason: z.string().min(1),
        destination: z.string().min(1),
        departureDate: z.string(),
        returnDate: z.string(),
        guardianName: z.string().min(1),
        guardianPhone: z.string().min(1),
        guardianRelationship: z.string().min(1),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const stid = d.studentId
      const hid = d.hostelId
      const tid = d.termId
      const reason = d.reason
      const dest = d.destination
      const depDate = d.departureDate
      const retDate = d.returnDate
      const gname = d.guardianName
      const gphone = d.guardianPhone
      const grel = d.guardianRelationship
      const tdb = tenantDb(request.schoolId)

      const rows = await tdb.query`
        INSERT INTO hostel_exeats (school_id, student_id, hostel_id, term_id, reason, destination,
          departure_date, return_date, guardian_name, guardian_phone, guardian_relationship)
        VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${hid}::uuid, ${tid}::uuid,
          ${reason}, ${dest}, ${depDate}, ${retDate}, ${gname}, ${gphone}, ${grel})
        RETURNING id, status, created_at
      ` as any[]
      return reply.status(201).send({ exeat: rows[0] })
    })

  app.patch('/hostels/exeats/:id/status', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        status: z.enum(['approved', 'rejected', 'returned']),
        rejectionReason: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const eid = String(id)
      const st = body.data.status
      const rr = body.data.rejectionReason ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      if (st === 'approved') {
        await tdb.query`
          UPDATE hostel_exeats SET status = ${st}, approved_by = ${uid}::uuid, approved_at = now(), updated_at = now()
          WHERE id = ${eid}::uuid AND school_id = ${request.schoolId}::uuid
        `
      } else if (st === 'rejected') {
        await tdb.query`
          UPDATE hostel_exeats SET status = ${st}, rejection_reason = ${rr}, approved_by = ${uid}::uuid, updated_at = now()
          WHERE id = ${eid}::uuid AND school_id = ${request.schoolId}::uuid
        `
      } else {
        await tdb.query`
          UPDATE hostel_exeats SET status = ${st}, actual_return_at = now(), updated_at = now()
          WHERE id = ${eid}::uuid AND school_id = ${request.schoolId}::uuid
        `
      }
      return reply.send({ updated: true })
    })

  // ── VISITORS ──────────────────────────────────────────────────────────────

  app.get('/hostels/visitors', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { hostelId, date } = request.query as any
      const tdb = tenantDb(request.schoolId)
      const hid = hostelId ? String(hostelId) : null
      const d = date ? String(date) : null

      let rows: any[]
      if (hid && d) {
        rows = await tdb.query`
          SELECT hv.*, u.full_name AS student_name, u.class_level,
                 rb.full_name AS recorded_by_name
          FROM hostel_visitors hv
          JOIN users u ON u.id = hv.student_id
          LEFT JOIN users rb ON rb.id = hv.recorded_by
          WHERE hv.school_id = ${request.schoolId}::uuid
          AND hv.hostel_id = ${hid}::uuid AND DATE(hv.check_in_at) = ${d}::date
          ORDER BY hv.check_in_at DESC
        ` as any[]
      } else if (hid) {
        rows = await tdb.query`
          SELECT hv.*, u.full_name AS student_name, u.class_level,
                 rb.full_name AS recorded_by_name
          FROM hostel_visitors hv
          JOIN users u ON u.id = hv.student_id
          LEFT JOIN users rb ON rb.id = hv.recorded_by
          WHERE hv.school_id = ${request.schoolId}::uuid AND hv.hostel_id = ${hid}::uuid
          ORDER BY hv.check_in_at DESC LIMIT 100
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT hv.*, u.full_name AS student_name, u.class_level,
                 h.name AS hostel_name, rb.full_name AS recorded_by_name
          FROM hostel_visitors hv
          JOIN users u ON u.id = hv.student_id
          JOIN hostels h ON h.id = hv.hostel_id
          LEFT JOIN users rb ON rb.id = hv.recorded_by
          WHERE hv.school_id = ${request.schoolId}::uuid
          ORDER BY hv.check_in_at DESC LIMIT 100
        ` as any[]
      }
      return reply.send({ visitors: rows })
    })

  app.post('/hostels/visitors', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        studentId: z.string().uuid(),
        hostelId: z.string().uuid(),
        visitorName: z.string().min(1),
        visitorPhone: z.string().optional(),
        relationship: z.string().min(1),
        purpose: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const stid = d.studentId
      const hid = d.hostelId
      const vname = d.visitorName
      const vphone = d.visitorPhone ?? null
      const rel = d.relationship
      const purpose = d.purpose ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      const rows = await tdb.query`
        INSERT INTO hostel_visitors (school_id, student_id, hostel_id, visitor_name, visitor_phone, relationship, purpose, recorded_by)
        VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${hid}::uuid, ${vname}, ${vphone}, ${rel}, ${purpose}, ${uid}::uuid)
        RETURNING id, check_in_at
      ` as any[]
      return reply.status(201).send({ visitor: rows[0] })
    })

  app.patch('/hostels/visitors/:id/checkout', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const vid = String(id)
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE hostel_visitors SET check_out_at = now()
        WHERE id = ${vid}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ updated: true })
    })

  // ── ROLL CALL ─────────────────────────────────────────────────────────────

  app.get('/hostels/roll-calls', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { hostelId, date } = request.query as any
      if (!hostelId) return reply.status(400).send({ error: 'hostelId required' })
      const hid = String(hostelId)
      const d = date ? String(date) : new Date().toISOString().split('T')[0]
      const tdb = tenantDb(request.schoolId)

      const rollCalls = await tdb.query`
        SELECT rc.*, u.full_name AS conducted_by_name
        FROM hostel_roll_calls rc
        LEFT JOIN users u ON u.id = rc.conducted_by
        WHERE rc.hostel_id = ${hid}::uuid AND rc.school_id = ${request.schoolId}::uuid
        AND rc.date = ${d}::date
        ORDER BY rc.call_time ASC
      ` as any[]

      return reply.send({ rollCalls })
    })

  app.post('/hostels/roll-calls', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        hostelId: z.string().uuid(),
        date: z.string().optional(),
        callTime: z.enum(['morning', 'afternoon', 'lights_out']),
        entries: z.array(z.object({
          studentId: z.string().uuid(),
          status: z.enum(['present', 'absent', 'on_exeat', 'sick']),
          notes: z.string().optional(),
        }))
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const hid = d.hostelId
      const date = d.date ?? new Date().toISOString().split('T')[0]
      const ct = d.callTime
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)

      // Create or get roll call
      const existing = await tdb.query`
        SELECT id FROM hostel_roll_calls
        WHERE hostel_id = ${hid}::uuid AND date = ${date}::date AND call_time = ${ct}
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      let rollCallId: string
      if (existing.length > 0) {
        rollCallId = existing[0].id
      } else {
        const rcRows = await tdb.query`
          INSERT INTO hostel_roll_calls (school_id, hostel_id, date, call_time, conducted_by)
          VALUES (${request.schoolId}::uuid, ${hid}::uuid, ${date}::date, ${ct}, ${uid}::uuid)
          RETURNING id
        ` as any[]
        rollCallId = rcRows[0].id
      }

      // Insert entries
      let present = 0, absent = 0
      for (const entry of d.entries) {
        const stid = entry.studentId
        const st = entry.status
        const notes = entry.notes ?? null
        await tdb.query`
          INSERT INTO hostel_roll_call_entries (school_id, roll_call_id, student_id, status, notes)
          VALUES (${request.schoolId}::uuid, ${rollCallId}::uuid, ${stid}::uuid, ${st}, ${notes})
          ON CONFLICT (school_id, roll_call_id, student_id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes
        `
        if (st === 'present') present++
        else absent++
      }

      return reply.send({ rollCallId, present, absent, total: d.entries.length })
    })

  app.get('/hostels/roll-calls/:rollCallId/entries', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { rollCallId } = request.params as any
      const rcid = String(rollCallId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT rce.*, u.full_name AS student_name, u.class_level, u.class_arm, u.admission_no
        FROM hostel_roll_call_entries rce
        JOIN users u ON u.id = rce.student_id
        WHERE rce.roll_call_id = ${rcid}::uuid AND rce.school_id = ${request.schoolId}::uuid
        ORDER BY u.full_name ASC
      ` as any[]
      return reply.send({ entries: rows })
    })

  // ── MEAL PLANS ────────────────────────────────────────────────────────────

  app.get('/hostels/meal-plans', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { hostelId, termId } = request.query as any
      if (!termId) return reply.status(400).send({ error: 'termId required' })
      const tid = String(termId)
      const hid = hostelId ? String(hostelId) : null
      const tdb = tenantDb(request.schoolId)

      let rows: any[]
      if (hid) {
        rows = await tdb.query`
          SELECT mp.*, u.full_name AS student_name, u.class_level, u.class_arm
          FROM hostel_meal_plans mp
          JOIN users u ON u.id = mp.student_id
          WHERE mp.school_id = ${request.schoolId}::uuid
          AND mp.term_id = ${tid}::uuid AND mp.hostel_id = ${hid}::uuid
          ORDER BY u.full_name ASC
        ` as any[]
      } else {
        rows = await tdb.query`
          SELECT mp.*, u.full_name AS student_name, u.class_level, u.class_arm,
                 h.name AS hostel_name
          FROM hostel_meal_plans mp
          JOIN users u ON u.id = mp.student_id
          JOIN hostels h ON h.id = mp.hostel_id
          WHERE mp.school_id = ${request.schoolId}::uuid AND mp.term_id = ${tid}::uuid
          ORDER BY h.name ASC, u.full_name ASC
        ` as any[]
      }
      return reply.send({ mealPlans: rows })
    })

  app.post('/hostels/meal-plans', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        studentId: z.string().uuid(),
        hostelId: z.string().uuid(),
        termId: z.string().uuid(),
        planType: z.enum(['full', 'breakfast_only', 'lunch_only', 'dinner_only', 'none']).default('full'),
        dietaryRequirements: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const stid = d.studentId
      const hid = d.hostelId
      const tid = d.termId
      const pt = d.planType
      const dr = d.dietaryRequirements ?? null
      const tdb = tenantDb(request.schoolId)

      await tdb.query`
        INSERT INTO hostel_meal_plans (school_id, student_id, hostel_id, term_id, plan_type, dietary_requirements)
        VALUES (${request.schoolId}::uuid, ${stid}::uuid, ${hid}::uuid, ${tid}::uuid, ${pt}, ${dr})
        ON CONFLICT (school_id, student_id, term_id) DO UPDATE SET
          plan_type = EXCLUDED.plan_type,
          dietary_requirements = EXCLUDED.dietary_requirements,
          updated_at = now()
      `
      return reply.status(201).send({ saved: true })
    })
    // LOOKUP PARENT FOR A STUDENT
  app.get('/hostels/student-guardian/:studentId', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { studentId } = request.params as any
      const sid = String(studentId)
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT id, full_name, phone, email
        FROM users
        WHERE school_id = ${request.schoolId}::uuid
        AND role = 'parent'
        AND ${sid}::uuid = ANY(parent_of)
        LIMIT 1
      ` as any[]
      return reply.send({ guardian: rows[0] ?? null })
    })
}
