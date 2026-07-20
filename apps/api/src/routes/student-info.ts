import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

export async function studentInfoRoutes(app: FastifyInstance) {

  // ── STUDENT PROFILE ───────────────────────────────────────────────────────

  // Get student profile
  app.get('/students/:id/profile', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)

      const studentRows = await tdb.query`
        SELECT u.id, u.full_name, u.email, u.admission_no, u.class_level,
               u.class_arm, u.photo_url, u.phone, u.is_active, u.created_at
        FROM users u
        WHERE u.id = ${id}::uuid
        AND u.school_id = ${request.schoolId}::uuid
        AND u.role = 'student'
      ` as any[]

      if (!studentRows[0]) return reply.status(404).send({ error: 'Student not found' })

      const profileRows = await tdb.query`
        SELECT * FROM student_profiles
        WHERE student_id = ${id}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const parentRows = await tdb.query`
        SELECT u.id, u.full_name, u.email, u.phone, psl.relationship
        FROM parent_student_links psl
        JOIN users u ON u.id = psl.parent_id
        WHERE psl.student_id = ${id}::uuid
        AND psl.school_id = ${request.schoolId}::uuid
      ` as any[]

      return reply.send({
        student: studentRows[0],
        profile: profileRows[0] ?? null,
        parents: parentRows,
      })
    })

  // Save/update student profile
  app.post('/students/:id/profile', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        dateOfBirth: z.string().optional(),
        gender: z.enum(['male', 'female']).optional(),
        religion: z.string().optional(),
        nationality: z.string().optional(),
        stateOfOrigin: z.string().optional(),
        lga: z.string().optional(),
        homeAddress: z.string().optional(),
        bloodGroup: z.enum(['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown']).optional(),
        genotype: z.enum(['AA','AS','SS','AC','SC','Unknown']).optional(),
        allergies: z.string().optional(),
        medicalConditions: z.string().optional(),
        entryClass: z.string().optional(),
        entryDate: z.string().optional(),
        previousSchool: z.string().optional(),
        previousSchoolAddress: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
        emergencyContactRelationship: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      await tdb.query`
        INSERT INTO student_profiles (
          school_id, student_id,
          date_of_birth, gender, religion, nationality,
          state_of_origin, lga, home_address,
          blood_group, genotype, allergies, medical_conditions,
          entry_class, entry_date, previous_school, previous_school_address,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
          updated_at
        )
        VALUES (
          ${request.schoolId}::uuid, ${id}::uuid,
          ${d.dateOfBirth ?? null}, ${d.gender ?? null}, ${d.religion ?? null},
          ${d.nationality ?? 'Nigerian'},
          ${d.stateOfOrigin ?? null}, ${d.lga ?? null}, ${d.homeAddress ?? null},
          ${d.bloodGroup ?? null}, ${d.genotype ?? null},
          ${d.allergies ?? null}, ${d.medicalConditions ?? null},
          ${d.entryClass ?? null}, ${d.entryDate ?? null},
          ${d.previousSchool ?? null}, ${d.previousSchoolAddress ?? null},
          ${d.emergencyContactName ?? null}, ${d.emergencyContactPhone ?? null},
          ${d.emergencyContactRelationship ?? null},
          now()
        )
        ON CONFLICT (school_id, student_id) DO UPDATE SET
          date_of_birth = EXCLUDED.date_of_birth,
          gender = EXCLUDED.gender,
          religion = EXCLUDED.religion,
          nationality = EXCLUDED.nationality,
          state_of_origin = EXCLUDED.state_of_origin,
          lga = EXCLUDED.lga,
          home_address = EXCLUDED.home_address,
          blood_group = EXCLUDED.blood_group,
          genotype = EXCLUDED.genotype,
          allergies = EXCLUDED.allergies,
          medical_conditions = EXCLUDED.medical_conditions,
          entry_class = EXCLUDED.entry_class,
          entry_date = EXCLUDED.entry_date,
          previous_school = EXCLUDED.previous_school,
          previous_school_address = EXCLUDED.previous_school_address,
          emergency_contact_name = EXCLUDED.emergency_contact_name,
          emergency_contact_phone = EXCLUDED.emergency_contact_phone,
          emergency_contact_relationship = EXCLUDED.emergency_contact_relationship,
          updated_at = now()
      `
      return reply.send({ saved: true })
    })

  // ── STUDENT DOCUMENTS ─────────────────────────────────────────────────────

  app.get('/students/:id/documents', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      const docs = await tdb.query`
        SELECT id, document_type, document_name, file_url, uploaded_at
        FROM student_documents
        WHERE student_id = ${id}::uuid
        AND school_id = ${request.schoolId}::uuid
        ORDER BY uploaded_at DESC
      ` as any[]
      return reply.send({ documents: docs })
    })

  app.post('/students/:id/documents', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        documentType: z.enum(['birth_certificate','passport_photo','previous_school_report','medical_certificate','local_government_letter','baptismal_certificate','scholarship_letter','other']),
        documentName: z.string().min(1),
        fileUrl: z.string().url(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO student_documents (school_id, student_id, document_type, document_name, file_url, uploaded_by)
        VALUES (${request.schoolId}::uuid, ${id}::uuid, ${d.documentType}, ${d.documentName}, ${d.fileUrl}, ${request.user.id}::uuid)
        RETURNING id, document_type, document_name, file_url, uploaded_at
      ` as any[]
      return reply.status(201).send({ document: rows[0] })
    })

  app.delete('/students/:id/documents/:docId', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id, docId } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM student_documents
        WHERE id = ${docId}::uuid
        AND student_id = ${id}::uuid
        AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })

  // ── ACHIEVEMENTS ──────────────────────────────────────────────────────────

  app.get('/students/:id/achievements', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT id, title, category, description, date_awarded, awarded_by, created_at
        FROM student_achievements
        WHERE student_id = ${id}::uuid
        AND school_id = ${request.schoolId}::uuid
        ORDER BY date_awarded DESC NULLS LAST
      ` as any[]
      return reply.send({ achievements: rows })
    })

  app.post('/students/:id/achievements', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        title: z.string().min(1),
        category: z.enum(['academic','sports','arts','leadership','community','competition','other']),
        description: z.string().optional(),
        dateAwarded: z.string().optional(),
        awardedBy: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO student_achievements (school_id, student_id, title, category, description, date_awarded, awarded_by)
        VALUES (${request.schoolId}::uuid, ${id}::uuid, ${d.title}, ${d.category}, ${d.description ?? null}, ${d.dateAwarded ?? null}, ${d.awardedBy ?? null})
        RETURNING id, title, category, description, date_awarded, awarded_by, created_at
      ` as any[]
      return reply.status(201).send({ achievement: rows[0] })
    })

  app.delete('/students/:id/achievements/:achId', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id, achId } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM student_achievements
        WHERE id = ${achId}::uuid
        AND student_id = ${id}::uuid
        AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })

  // ── DISCIPLINE RECORDS ────────────────────────────────────────────────────

  app.get('/students/:id/discipline', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT dr.id, dr.incident_date, dr.incident_type, dr.description,
               dr.action_taken, dr.action_details, dr.parent_notified,
               dr.resolved, dr.resolution_notes, dr.created_at,
               u.full_name AS recorded_by_name
        FROM discipline_records dr
        JOIN users u ON u.id = dr.recorded_by
        WHERE dr.student_id = ${id}::uuid
        AND dr.school_id = ${request.schoolId}::uuid
        ORDER BY dr.incident_date DESC
      ` as any[]
      return reply.send({ records: rows })
    })

  app.post('/students/:id/discipline', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        incidentDate: z.string(),
        incidentType: z.enum(['misconduct','absenteeism','bullying','cheating','property_damage','insubordination','violence','other']),
        description: z.string().min(1),
        actionTaken: z.enum(['verbal_warning','written_warning','detention','suspension','parent_invited','community_service','expulsion','other']),
        actionDetails: z.string().optional(),
        parentNotified: z.boolean().default(false),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO discipline_records (
          school_id, student_id, incident_date, incident_type,
          description, action_taken, action_details,
          parent_notified, recorded_by
        )
        VALUES (
          ${request.schoolId}::uuid, ${id}::uuid,
          ${d.incidentDate}, ${d.incidentType},
          ${d.description}, ${d.actionTaken},
          ${d.actionDetails ?? null}, ${d.parentNotified},
          ${request.user.id}::uuid
        )
        RETURNING id, incident_date, incident_type, description, action_taken, parent_notified, created_at
      ` as any[]
      return reply.status(201).send({ record: rows[0] })
    })

  app.patch('/students/:id/discipline/:recId/resolve', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id, recId } = request.params as any
      const { resolutionNotes } = request.body as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        UPDATE discipline_records
        SET resolved = true, resolution_notes = ${resolutionNotes ?? null}
        WHERE id = ${recId}::uuid
        AND student_id = ${id}::uuid
        AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ resolved: true })
    })
}
