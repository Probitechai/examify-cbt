import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { requireTier } from '../middleware/tier'
import { sendEmail } from '../lib/email'

export async function admissionRoutes(app: FastifyInstance) {

  // ── ADMISSIONS SETTINGS ───────────────────────────────────────────────────

  app.get('/admissions/settings', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT * FROM admissions_settings WHERE school_id = ${request.schoolId}::uuid
      ` as any[]
      return reply.send({ settings: rows[0] ?? null })
    })

  app.post('/admissions/settings', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        intakeMode: z.enum(['public', 'manual', 'both']).optional(),
        examType: z.enum(['cbt', 'manual', 'none']).optional(),
        requireExam: z.boolean().optional(),
        requireInterview: z.boolean().optional(),
        acceptanceFee: z.number().optional(),
        acceptanceFeeRequired: z.boolean().optional(),
        applicationOpen: z.boolean().optional(),
        applyForClasses: z.array(z.string()).optional(),
        welcomeMessage: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        INSERT INTO admissions_settings (
          school_id, intake_mode, exam_type, require_exam, require_interview,
          acceptance_fee, acceptance_fee_required, application_open,
          apply_for_classes, welcome_message, updated_at
        )
        VALUES (
          ${request.schoolId}::uuid,
          ${d.intakeMode ?? 'both'}, ${d.examType ?? 'manual'},
          ${d.requireExam ?? true}, ${d.requireInterview ?? false},
          ${d.acceptanceFee ?? 0}, ${d.acceptanceFeeRequired ?? false},
          ${d.applicationOpen ?? true},
          ${d.applyForClasses ?? []}, ${d.welcomeMessage ?? null}, now()
        )
        ON CONFLICT (school_id) DO UPDATE SET
          intake_mode = EXCLUDED.intake_mode,
          exam_type = EXCLUDED.exam_type,
          require_exam = EXCLUDED.require_exam,
          require_interview = EXCLUDED.require_interview,
          acceptance_fee = EXCLUDED.acceptance_fee,
          acceptance_fee_required = EXCLUDED.acceptance_fee_required,
          application_open = EXCLUDED.application_open,
          apply_for_classes = EXCLUDED.apply_for_classes,
          welcome_message = EXCLUDED.welcome_message,
          updated_at = now()
      `
      return reply.send({ saved: true })
    })

  // ── PUBLIC APPLICATION (no auth required) ─────────────────────────────────

  app.get('/admissions/public/:subdomain', async (request: any, reply: any) => {
    const { subdomain } = request.params as any
    const schoolRows = await db()`
      SELECT id, name, logo_url FROM schools
      WHERE subdomain = ${subdomain} AND is_active = true
    ` as any[]
    if (!schoolRows[0]) return reply.status(404).send({ error: 'School not found' })

    const school = schoolRows[0]
    const tdb = tenantDb(school.id)
    const settingsRows = await tdb.query`
      SELECT * FROM admissions_settings WHERE school_id = ${school.id}::uuid
    ` as any[]
    const settings = settingsRows[0]
    if (!settings?.application_open) {
      return reply.send({ open: false, school: { name: school.name, logo_url: school.logo_url } })
    }
    return reply.send({
      open: true,
      school: { name: school.name, logo_url: school.logo_url },
      settings: {
        applyForClasses: settings.apply_for_classes,
        welcomeMessage: settings.welcome_message,
        requireExam: settings.require_exam,
        requireInterview: settings.require_interview,
        acceptanceFeeRequired: settings.acceptance_fee_required,
        acceptanceFee: settings.acceptance_fee,
      }
    })
  })

  app.post('/admissions/apply/:subdomain', async (request: any, reply: any) => {
    const { subdomain } = request.params as any
    const schema = z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      middleName: z.string().optional(),
      dateOfBirth: z.string().optional(),
      gender: z.enum(['male', 'female']).optional(),
      religion: z.string().optional(),
      stateOfOrigin: z.string().optional(),
      lga: z.string().optional(),
      homeAddress: z.string().optional(),
      bloodGroup: z.string().optional(),
      genotype: z.string().optional(),
      appliedClass: z.string().min(1),
      previousSchool: z.string().optional(),
      previousClass: z.string().optional(),
      parentName: z.string().min(1),
      parentEmail: z.string().email(),
      parentPhone: z.string().min(1),
      parentRelationship: z.string().optional(),
      parentAddress: z.string().optional(),
      guardian2Name: z.string().optional(),
      guardian2Phone: z.string().optional(),
      guardian2Relationship: z.string().optional(),
    })
    const body = schema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

    const d = body.data
    const schoolRows = await db()`
      SELECT id FROM schools WHERE subdomain = ${subdomain} AND is_active = true
    ` as any[]
    if (!schoolRows[0]) return reply.status(404).send({ error: 'School not found' })

    const schoolId = schoolRows[0].id
    const tdb = tenantDb(schoolId)

    // Check if applications are open
    const settingsRows = await tdb.query`
      SELECT application_open, intake_mode FROM admissions_settings WHERE school_id = ${schoolId}::uuid
    ` as any[]
    if (!settingsRows[0]?.application_open) {
      return reply.status(400).send({ error: 'Applications are currently closed' })
    }

    // Create applicant
    const applicantRows = await tdb.query`
      INSERT INTO applicants (
        school_id, first_name, last_name, middle_name,
        date_of_birth, gender, religion, state_of_origin, lga,
        home_address, blood_group, genotype,
        applied_class, previous_school, previous_class,
        parent_name, parent_email, parent_phone, parent_relationship, parent_address,
        guardian2_name, guardian2_phone, guardian2_relationship, source
      )
      VALUES (
        ${schoolId}::uuid, ${d.firstName}, ${d.lastName}, ${d.middleName ?? null},
        ${d.dateOfBirth ?? null}, ${d.gender ?? null}, ${d.religion ?? null},
        ${d.stateOfOrigin ?? null}, ${d.lga ?? null},
        ${d.homeAddress ?? null}, ${d.bloodGroup ?? null}, ${d.genotype ?? null},
        ${d.appliedClass}, ${d.previousSchool ?? null}, ${d.previousClass ?? null},
        ${d.parentName}, ${d.parentEmail}, ${d.parentPhone},
        ${d.parentRelationship ?? 'parent'}, ${d.parentAddress ?? null},
        ${d.guardian2Name ?? null}, ${d.guardian2Phone ?? null},
        ${d.guardian2Relationship ?? null}, 'public'
      )
      RETURNING id, application_number, first_name, last_name, parent_email
    ` as any[]

    const applicant = applicantRows[0]

    // Create application record
    await tdb.query`
      INSERT INTO admission_applications (school_id, applicant_id, status)
      VALUES (${schoolId}::uuid, ${applicant.id}::uuid, 'pending')
    `

    // Log activity
    await tdb.query`
      INSERT INTO admission_activity_log (school_id, application_id, action, notes)
      SELECT ${schoolId}::uuid, aa.id, 'applied', 'Application submitted online'
      FROM admission_applications aa WHERE aa.applicant_id = ${applicant.id}::uuid
    `

    return reply.status(201).send({
      success: true,
      applicationNumber: applicant.application_number,
      message: `Application submitted successfully. Your application number is ${applicant.application_number}. You will be contacted at ${applicant.parent_email}.`
    })
  })

  // ── ADMIN — LIST APPLICATIONS ─────────────────────────────────────────────

  app.get('/admissions/applications', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const { status, appliedClass, search } = request.query as any
      const tdb = tenantDb(request.schoolId)

      let applications: any[]

      if (status && appliedClass) {
        applications = await tdb.query`
          SELECT a.id AS applicant_id, a.application_number, a.first_name, a.last_name,
                 a.applied_class, a.parent_name, a.parent_email, a.parent_phone,
                 a.created_at AS applied_at,
                 aa.id, aa.status, aa.exam_score, aa.interview_date,
                 aa.offer_sent_at, aa.acceptance_fee_paid, aa.enrolled_at
          FROM applicants a
          JOIN admission_applications aa ON aa.applicant_id = a.id
          WHERE a.school_id = ${request.schoolId}::uuid
          AND aa.status = ${status}
          AND a.applied_class = ${appliedClass}
          ORDER BY a.created_at DESC
        ` as any[]
      } else if (status) {
        applications = await tdb.query`
          SELECT a.id AS applicant_id, a.application_number, a.first_name, a.last_name,
                 a.applied_class, a.parent_name, a.parent_email, a.parent_phone,
                 a.created_at AS applied_at,
                 aa.id, aa.status, aa.exam_score, aa.interview_date,
                 aa.offer_sent_at, aa.acceptance_fee_paid, aa.enrolled_at
          FROM applicants a
          JOIN admission_applications aa ON aa.applicant_id = a.id
          WHERE a.school_id = ${request.schoolId}::uuid
          AND aa.status = ${status}
          ORDER BY a.created_at DESC
        ` as any[]
      } else {
        applications = await tdb.query`
          SELECT a.id AS applicant_id, a.application_number, a.first_name, a.last_name,
                 a.applied_class, a.parent_name, a.parent_email, a.parent_phone,
                 a.created_at AS applied_at,
                 aa.id, aa.status, aa.exam_score, aa.interview_date,
                 aa.offer_sent_at, aa.acceptance_fee_paid, aa.enrolled_at
          FROM applicants a
          JOIN admission_applications aa ON aa.applicant_id = a.id
          WHERE a.school_id = ${request.schoolId}::uuid
          ORDER BY a.created_at DESC
        ` as any[]
      }

      return reply.send({ applications })
    })

  // ── ADMIN — GET SINGLE APPLICATION ────────────────────────────────────────

  app.get('/admissions/applications/:id', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)

      const appRows = await tdb.query`
        SELECT a.*, aa.id AS application_id, aa.status, aa.exam_type, aa.exam_score,
               aa.exam_date, aa.exam_notes, aa.interview_date, aa.interview_venue,
               aa.interview_notes, aa.interview_outcome, aa.decision_notes,
               aa.offer_sent_at, aa.offer_expires_at, aa.acceptance_fee_amount,
               aa.acceptance_fee_paid, aa.acceptance_fee_paid_at,
               aa.enrolled_student_id, aa.enrolled_at, aa.created_at AS applied_at
        FROM applicants a
        JOIN admission_applications aa ON aa.applicant_id = a.id
        WHERE a.id = ${id}::uuid
        AND a.school_id = ${request.schoolId}::uuid
      ` as any[]

      if (!appRows[0]) return reply.status(404).send({ error: 'Application not found' })

      const docs = await tdb.query`
        SELECT id, document_type, document_name, file_url, uploaded_at
        FROM admission_documents
        WHERE applicant_id = ${id}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]

      const logs = await tdb.query`
        SELECT al.action, al.notes, al.created_at, u.full_name AS performed_by_name
        FROM admission_activity_log al
        LEFT JOIN users u ON u.id = al.performed_by
        WHERE al.application_id = ${appRows[0].application_id}::uuid
        ORDER BY al.created_at DESC
      ` as any[]

      return reply.send({ application: appRows[0], documents: docs, logs })
    })

  // ── ADMIN — UPDATE APPLICATION STATUS ────────────────────────────────────

  app.patch('/admissions/applications/:id/status', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        status: z.enum(['pending','reviewing','exam_invited','exam_taken','interview_scheduled','interview_done','offered','accepted','rejected','waitlisted','enrolled']),
        notes: z.string().optional(),
        examScore: z.number().optional(),
        examDate: z.string().optional(),
        examNotes: z.string().optional(),
        interviewDate: z.string().optional(),
        interviewVenue: z.string().optional(),
        interviewNotes: z.string().optional(),
        interviewOutcome: z.enum(['passed','failed','pending']).optional(),
        offerExpiresAt: z.string().optional(),
        acceptanceFeeAmount: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      // Get application id
      const appRows = await tdb.query`
        SELECT aa.id FROM admission_applications aa
        JOIN applicants a ON a.id = aa.applicant_id
        WHERE a.id = ${id}::uuid AND a.school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!appRows[0]) return reply.status(404).send({ error: 'Application not found' })

      const appId = appRows[0].id

      await tdb.query`
        UPDATE admission_applications SET
          status = ${d.status},
          exam_score = COALESCE(${d.examScore ?? null}, exam_score),
          exam_date = COALESCE(${d.examDate ?? null}::date, exam_date),
          exam_notes = COALESCE(${d.examNotes ?? null}, exam_notes),
          interview_date = COALESCE(${d.interviewDate ?? null}::timestamptz, interview_date),
          interview_venue = COALESCE(${d.interviewVenue ?? null}, interview_venue),
          interview_notes = COALESCE(${d.interviewNotes ?? null}, interview_notes),
          interview_outcome = COALESCE(${d.interviewOutcome ?? null}, interview_outcome),
          offer_sent_at = CASE WHEN ${d.status} = 'offered' THEN now() ELSE offer_sent_at END,
          offer_expires_at = COALESCE(${d.offerExpiresAt ?? null}::timestamptz, offer_expires_at),
          acceptance_fee_amount = COALESCE(${d.acceptanceFeeAmount ?? null}, acceptance_fee_amount),
          decided_by = CASE WHEN ${d.status} IN ('offered','accepted','rejected','waitlisted') THEN ${request.user.id}::uuid ELSE decided_by END,
          decided_at = CASE WHEN ${d.status} IN ('offered','accepted','rejected','waitlisted') THEN now() ELSE decided_at END,
          decision_notes = COALESCE(${d.notes ?? null}, decision_notes),
          updated_at = now()
        WHERE id = ${appId}::uuid
      `

      // Log activity
      await tdb.query`
        INSERT INTO admission_activity_log (school_id, application_id, action, notes, performed_by)
        VALUES (${request.schoolId}::uuid, ${appId}::uuid, ${d.status}, ${d.notes ?? null}, ${request.user.id}::uuid)
      `

      return reply.send({ updated: true })
    })

  // ── ADMIN — MANUALLY ADD APPLICANT ───────────────────────────────────────

  app.post('/admissions/applicants', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        middleName: z.string().optional(),
        dateOfBirth: z.string().optional(),
        gender: z.enum(['male', 'female']).optional(),
        appliedClass: z.string().min(1),
        previousSchool: z.string().optional(),
        parentName: z.string().min(1),
        parentEmail: z.string().email(),
        parentPhone: z.string().min(1),
        parentRelationship: z.string().optional(),
        stateOfOrigin: z.string().optional(),
        lga: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      const applicantRows = await tdb.query`
        INSERT INTO applicants (
          school_id, first_name, last_name, middle_name,
          date_of_birth, gender, applied_class, previous_school,
          parent_name, parent_email, parent_phone, parent_relationship,
          state_of_origin, lga, source
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.firstName}, ${d.lastName},
          ${d.middleName ?? null}, ${d.dateOfBirth ?? null}, ${d.gender ?? null},
          ${d.appliedClass}, ${d.previousSchool ?? null},
          ${d.parentName}, ${d.parentEmail}, ${d.parentPhone},
          ${d.parentRelationship ?? 'parent'},
          ${d.stateOfOrigin ?? null}, ${d.lga ?? null}, 'manual'
        )
        RETURNING id, application_number
      ` as any[]

      const applicant = applicantRows[0]
      await tdb.query`
        INSERT INTO admission_applications (school_id, applicant_id, status)
        VALUES (${request.schoolId}::uuid, ${applicant.id}::uuid, 'pending')
      `

      await tdb.query`
        INSERT INTO admission_activity_log (school_id, application_id, action, notes, performed_by)
        SELECT ${request.schoolId}::uuid, aa.id, 'applied', 'Application added manually by admin', ${request.user.id}::uuid
        FROM admission_applications aa WHERE aa.applicant_id = ${applicant.id}::uuid
      `

      return reply.status(201).send({ applicant })
    })

  // ── ADMIN — ENROLL APPLICANT AS STUDENT ──────────────────────────────────

  app.post('/admissions/applications/:id/enroll', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        admissionNo: z.string().optional(),
        classLevel: z.string().min(1),
        classArm: z.string().optional(),
        password: z.string().min(6).default('Student@1234'),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      // Get applicant details
      const appRows = await tdb.query`
        SELECT a.*, aa.id AS application_id
        FROM applicants a
        JOIN admission_applications aa ON aa.applicant_id = a.id
        WHERE a.id = ${id}::uuid AND a.school_id = ${request.schoolId}::uuid
      ` as any[]

      if (!appRows[0]) return reply.status(404).send({ error: 'Application not found' })
      const app = appRows[0]

      // Check if already enrolled
      if (app.enrolled_student_id) {
        return reply.status(400).send({ error: 'Applicant already enrolled' })
      }

      // Create student account
      const bcrypt = await import('bcryptjs')
      const passwordHash = await bcrypt.hash(d.password, 12)
      const email = `${app.first_name.toLowerCase()}.${app.last_name.toLowerCase()}@${request.school.subdomain}.examify.ng`

      const studentRows = await tdb.query`
        INSERT INTO users (
          school_id, role, full_name, email, password_hash,
          admission_no, class_level, class_arm, is_active
        )
        VALUES (
          ${request.schoolId}::uuid, 'student',
          ${app.first_name + ' ' + app.last_name},
          ${email}, ${passwordHash},
          ${d.admissionNo ?? null}, ${d.classLevel},
          ${d.classArm ?? null}, true
        )
        RETURNING id, full_name, email
      ` as any[]

      const student = studentRows[0]

      // Create student profile from applicant data
      await tdb.query`
        INSERT INTO student_profiles (
          school_id, student_id, date_of_birth, gender, religion,
          state_of_origin, lga, home_address, blood_group, genotype,
          previous_school, entry_class, entry_date,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
        )
        VALUES (
          ${request.schoolId}::uuid, ${student.id}::uuid,
          ${app.date_of_birth ?? null}, ${app.gender ?? null}, ${app.religion ?? null},
          ${app.state_of_origin ?? null}, ${app.lga ?? null}, ${app.home_address ?? null},
          ${app.blood_group ?? null}, ${app.genotype ?? null},
          ${app.previous_school ?? null}, ${d.classLevel}, CURRENT_DATE,
          ${app.parent_name ?? null}, ${app.parent_phone ?? null},
          ${app.parent_relationship ?? null}
        )
      `

      // Mark application as enrolled
      await tdb.query`
        UPDATE admission_applications
        SET status = 'enrolled', enrolled_student_id = ${student.id}::uuid,
            enrolled_at = now(), updated_at = now()
        WHERE applicant_id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `

      // Log activity
      await tdb.query`
        INSERT INTO admission_activity_log (school_id, application_id, action, notes, performed_by)
        VALUES (${request.schoolId}::uuid, ${app.application_id}::uuid, 'enrolled',
          ${'Student enrolled as ' + d.classLevel + (d.classArm ? ' ' + d.classArm : '')},
          ${request.user.id}::uuid)
      `

      return reply.send({
        success: true,
        student: { id: student.id, fullName: student.full_name, email: student.email },
        message: `${app.first_name} ${app.last_name} has been enrolled successfully. Login: ${email} / ${d.password}`
      })
    })

  // ── STATS ─────────────────────────────────────────────────────────────────

  app.get('/admissions/stats', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE aa.status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE aa.status = 'reviewing') AS reviewing,
          COUNT(*) FILTER (WHERE aa.status = 'offered') AS offered,
          COUNT(*) FILTER (WHERE aa.status = 'accepted') AS accepted,
          COUNT(*) FILTER (WHERE aa.status = 'rejected') AS rejected,
          COUNT(*) FILTER (WHERE aa.status = 'waitlisted') AS waitlisted,
          COUNT(*) FILTER (WHERE aa.status = 'enrolled') AS enrolled
        FROM admission_applications aa
        JOIN applicants a ON a.id = aa.applicant_id
        WHERE a.school_id = ${request.schoolId}::uuid
      ` as any[]
      return reply.send({ stats: rows[0] })
    })
  // ── SEND OFFER LETTER ─────────────────────────────────────────────────────
  app.post('/admissions/applications/:id/offer', { preHandler: [authenticate, requireRole('school_admin'), requireTier('premium')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        acceptanceFeeAmount: z.number().min(0),
        offerExpiresAt: z.string(),
        customMessage: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)

      // Get applicant and school details
      const appRows = await tdb.query`
        SELECT a.*, aa.id AS application_id, aa.status,
               s.name AS school_name, s.logo_url AS school_logo
        FROM applicants a
        JOIN admission_applications aa ON aa.applicant_id = a.id
        JOIN schools s ON s.id = ${request.schoolId}::uuid
        WHERE a.id = ${id}::uuid AND a.school_id = ${request.schoolId}::uuid
      ` as any[]

      if (!appRows[0]) return reply.status(404).send({ error: 'Application not found' })
      const app = appRows[0]

      // Update application with offer details
      await tdb.query`
        UPDATE admission_applications SET
          status = 'offered',
          offer_sent_at = now(),
          offer_expires_at = ${d.offerExpiresAt}::timestamptz,
          acceptance_fee_amount = ${d.acceptanceFeeAmount},
          updated_at = now()
        WHERE applicant_id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `

      // Generate payment link
      const paymentLink = `${process.env.FRONTEND_URL ?? 'https://examify-cbt-web.vercel.app'}/admissions/pay/${id}?school=${request.school.subdomain}`

      // Build offer letter email
      const expiryDate = new Date(d.offerExpiresAt).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const feeRequired = d.acceptanceFeeAmount > 0

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #0f4a32; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${app.school_name}</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Admissions Office</p>
          </div>
          <div style="background: white; border: 1px solid #e5e5e0; border-top: none; padding: 32px; border-radius: 0 0 12px 12px;">
            <p style="color: #1a6b4a; font-weight: 700; font-size: 18px; margin-bottom: 8px;">🎉 Congratulations! Admission Offered</p>
            <p style="color: #1a1a18; margin-bottom: 24px;">Dear <strong>${app.parent_name}</strong>,</p>
            <p style="color: #3a3a36; line-height: 1.7; margin-bottom: 16px;">
              We are pleased to inform you that <strong>${app.first_name} ${app.last_name}</strong> has been offered admission into
              <strong>${app.school_name}</strong> for <strong>${app.applied_class}</strong>.
            </p>
            ${d.customMessage ? `<p style="color: #3a3a36; line-height: 1.7; margin-bottom: 16px;">${d.customMessage}</p>` : ''}
            <div style="background: #f7f7f5; border-radius: 10px; padding: 20px; margin-bottom: 24px;">
              <p style="font-weight: 700; color: #1a1a18; margin-bottom: 12px;">Offer Details</p>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #6b6b65; font-size: 14px;">Applicant</td><td style="padding: 6px 0; color: #1a1a18; font-weight: 600; font-size: 14px;">${app.first_name} ${app.last_name}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b6b65; font-size: 14px;">Class Offered</td><td style="padding: 6px 0; color: #1a1a18; font-weight: 600; font-size: 14px;">${app.applied_class}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b6b65; font-size: 14px;">Application No.</td><td style="padding: 6px 0; color: #1a1a18; font-weight: 600; font-size: 14px;">${app.application_number}</td></tr>
                ${feeRequired ? `<tr><td style="padding: 6px 0; color: #6b6b65; font-size: 14px;">Acceptance Fee</td><td style="padding: 6px 0; color: #dc2626; font-weight: 700; font-size: 14px;">₦${d.acceptanceFeeAmount.toLocaleString()}</td></tr>` : ''}
                <tr><td style="padding: 6px 0; color: #6b6b65; font-size: 14px;">Offer Expires</td><td style="padding: 6px 0; color: #dc2626; font-weight: 600; font-size: 14px;">${expiryDate}</td></tr>
              </table>
            </div>
            ${feeRequired ? `
            <div style="text-align: center; margin-bottom: 24px;">
              <p style="color: #3a3a36; margin-bottom: 16px;">To accept this offer, please pay the acceptance fee before <strong>${expiryDate}</strong>.</p>
              <a href="${paymentLink}" style="display: inline-block; background: #1a6b4a; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
                Pay Acceptance Fee — ₦${d.acceptanceFeeAmount.toLocaleString()}
              </a>
            </div>
            ` : `
            <div style="text-align: center; margin-bottom: 24px;">
              <p style="color: #3a3a36; margin-bottom: 16px;">Please confirm your acceptance before <strong>${expiryDate}</strong> by clicking the button below.</p>
              <a href="${paymentLink}" style="display: inline-block; background: #1a6b4a; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px;">
                Accept Offer
              </a>
            </div>
            `}
            <p style="color: #6b6b65; font-size: 13px; line-height: 1.6;">
              If you have any questions, please contact the admissions office.<br/>
              This offer is valid until <strong>${expiryDate}</strong>.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e5e0; margin: 24px 0;" />
            <p style="color: #a0a09a; font-size: 12px; text-align: center;">
              ${app.school_name} · Powered by Examify
            </p>
          </div>
        </div>
      `

      // Send email
      await sendEmail({
        to: app.parent_email,
        subject: `Admission Offer — ${app.first_name} ${app.last_name} | ${app.school_name}`,
        html,
      })

      // Log activity
      await tdb.query`
        INSERT INTO admission_activity_log (school_id, application_id, action, notes, performed_by)
        VALUES (${request.schoolId}::uuid, ${app.application_id}::uuid,
          'offered', ${'Offer letter sent to ' + app.parent_email + '. Fee: ₦' + d.acceptanceFeeAmount.toLocaleString() + '. Expires: ' + expiryDate},
          ${request.user.id}::uuid)
      `

      return reply.send({ sent: true, message: `Offer letter sent to ${app.parent_email}` })
    })

  // ── PUBLIC — ACCEPTANCE FEE PAYMENT PAGE DATA ─────────────────────────────
  app.get('/admissions/pay/:applicantId', async (request: any, reply: any) => {
    const { applicantId } = request.params as any
    const { school } = request.query as any
    if (!school) return reply.status(400).send({ error: 'school subdomain required' })

    const schoolRows = await db()`
      SELECT id, name, logo_url FROM schools WHERE subdomain = ${school} AND is_active = true
    ` as any[]
    if (!schoolRows[0]) return reply.status(404).send({ error: 'School not found' })

    const schoolId = schoolRows[0].id
    const tdb = tenantDb(schoolId)

    const appRows = await tdb.query`
      SELECT a.first_name, a.last_name, a.application_number, a.applied_class,
             a.parent_name, a.parent_email,
             aa.status, aa.acceptance_fee_amount, aa.acceptance_fee_paid,
             aa.offer_expires_at
      FROM applicants a
      JOIN admission_applications aa ON aa.applicant_id = a.id
      WHERE a.id = ${applicantId}::uuid AND a.school_id = ${schoolId}::uuid
    ` as any[]

    if (!appRows[0]) return reply.status(404).send({ error: 'Application not found' })
    const app = appRows[0]

    return reply.send({
      school: { name: schoolRows[0].name, logo_url: schoolRows[0].logo_url },
      applicant: {
        name: `${app.first_name} ${app.last_name}`,
        applicationNumber: app.application_number,
        appliedClass: app.applied_class,
        parentName: app.parent_name,
        parentEmail: app.parent_email,
      },
      offer: {
        status: app.status,
        acceptanceFeeAmount: Number(app.acceptance_fee_amount ?? 0),
        acceptanceFeePaid: app.acceptance_fee_paid,
        offerExpiresAt: app.offer_expires_at,
      }
    })
  })

  // ── PUBLIC — INITIALIZE ACCEPTANCE FEE PAYMENT ────────────────────────────
  app.post('/admissions/pay/:applicantId/initialize', async (request: any, reply: any) => {
    const { applicantId } = request.params as any
    const { school } = request.query as any
    if (!school) return reply.status(400).send({ error: 'school subdomain required' })

    const schoolRows = await db()`
      SELECT id, name FROM schools WHERE subdomain = ${school} AND is_active = true
    ` as any[]
    if (!schoolRows[0]) return reply.status(404).send({ error: 'School not found' })

    const schoolId = schoolRows[0].id
    const tdb = tenantDb(schoolId)

    const appRows = await tdb.query`
      SELECT a.first_name, a.last_name, a.parent_email, a.application_number,
             aa.acceptance_fee_amount, aa.acceptance_fee_paid, aa.status
      FROM applicants a
      JOIN admission_applications aa ON aa.applicant_id = a.id
      WHERE a.id = ${applicantId}::uuid AND a.school_id = ${schoolId}::uuid
    ` as any[]

    if (!appRows[0]) return reply.status(404).send({ error: 'Application not found' })
    const app = appRows[0]

    if (app.acceptance_fee_paid) return reply.status(400).send({ error: 'Acceptance fee already paid' })
    if (!['offered', 'pending'].includes(app.status) && app.status !== 'offered') {
      return reply.status(400).send({ error: 'Application is not in offered status' })
    }

    const amount = Number(app.acceptance_fee_amount ?? 0)
    if (amount <= 0) {
      // No fee required — just mark as accepted
      await tdb.query`
        UPDATE admission_applications
        SET status = 'accepted', acceptance_fee_paid = true, acceptance_fee_paid_at = now(), updated_at = now()
        WHERE applicant_id = ${applicantId}::uuid AND school_id = ${schoolId}::uuid
      `
      await tdb.query`
        INSERT INTO admission_activity_log (school_id, application_id, action, notes)
        SELECT ${schoolId}::uuid, aa.id, 'accepted', 'Offer accepted (no fee required)'
        FROM admission_applications aa WHERE aa.applicant_id = ${applicantId}::uuid
      `
      return reply.send({ success: true, noFee: true, message: 'Offer accepted successfully!' })
    }

    const reference = `ADMSN-${applicantId.slice(0,8)}-${Date.now()}`
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY
    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: app.parent_email,
        amount: Math.round(amount * 100),
        reference,
        currency: 'NGN',
        metadata: {
          type: 'admission_fee',
          school_id: schoolId,
          school_subdomain: school,
          applicant_id: applicantId,
          applicant_name: `${app.first_name} ${app.last_name}`,
          application_number: app.application_number,
        },
        callback_url: `${process.env.FRONTEND_URL ?? 'https://examify-cbt-web.vercel.app'}/admissions/pay/${applicantId}/callback?school=${school}`,
      })
    }).then(r => r.json())

    if (!paystackRes.status) return reply.status(500).send({ error: 'Payment initialization failed' })

    // Save reference to application
    await tdb.query`
      UPDATE admission_applications
      SET paystack_reference = ${reference}, updated_at = now()
      WHERE applicant_id = ${applicantId}::uuid AND school_id = ${schoolId}::uuid
    `

    return reply.send({
      authorizationUrl: paystackRes.data.authorization_url,
      reference,
    })
  })

  // ── PUBLIC — VERIFY ACCEPTANCE FEE PAYMENT ────────────────────────────────
  app.get('/admissions/pay/:applicantId/verify', async (request: any, reply: any) => {
    const { applicantId } = request.params as any
    const { reference, school } = request.query as any
    if (!reference || !school) return reply.status(400).send({ error: 'reference and school required' })

    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET}` }
    }).then(r => r.json())

    if (!paystackRes.status || paystackRes.data.status !== 'success') {
      return reply.send({ success: false, message: 'Payment not confirmed yet' })
    }

    const meta = paystackRes.data.metadata
    const schoolRows = await db()`
      SELECT id FROM schools WHERE subdomain = ${school}
    ` as any[]
    if (!schoolRows[0]) return reply.status(404).send({ error: 'School not found' })

    const schoolId = schoolRows[0].id
    const tdb = tenantDb(schoolId)

    await tdb.query`
      UPDATE admission_applications
      SET status = 'accepted', acceptance_fee_paid = true,
          acceptance_fee_paid_at = now(), updated_at = now()
      WHERE applicant_id = ${applicantId}::uuid AND school_id = ${schoolId}::uuid
    `

    await tdb.query`
      INSERT INTO admission_activity_log (school_id, application_id, action, notes)
      SELECT ${schoolId}::uuid, aa.id, 'accepted',
        ${'Acceptance fee paid via Paystack. Reference: ' + reference}
      FROM admission_applications aa WHERE aa.applicant_id = ${applicantId}::uuid
    `

    return reply.send({
      success: true,
      applicantName: meta.applicant_name,
      applicationNumber: meta.application_number,
      message: 'Payment confirmed! Your offer has been accepted.',
    })
  })
}
