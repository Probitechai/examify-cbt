import type { FastifyInstance } from 'fastify'
import { newTempPassword } from '../lib/passwords'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { saveSections } from './schools'
import { asSections } from '../lib/classLevels'
import { isTier, tierAtLeast, FINANCE_CONTROLS_TIER, TIER_NAMES, getStudentLimit } from '../middleware/tier'
import { sendEmail } from '../lib/email'
import { loginCredentialsEmail, schoolWelcomeEmail, schoolCreatedNoticeEmail } from '../emails/templates'
import { schoolUrl } from '../lib/paystack'

// Login details go by email. The temporary password is only returned to
// Super Admin when the email couldn't be sent, so it can be passed on another way.
async function emailLoginDetails(schoolId: string, user: { full_name: string; email: string; role: string }, password: string): Promise<boolean> {
  const [school] = await db()`SELECT name, subdomain FROM schools WHERE id = ${schoolId}::uuid` as any[]
  if (!school) return false
  const { subject, html } = loginCredentialsEmail({
    schoolName: school.name, fullName: user.full_name, email: user.email, password,
    loginUrl: `${schoolUrl(school.subdomain)}/login`, role: user.role,
  })
  return (await sendEmail({ to: user.email, subject, html })).success
}
const loginReply = (emailSent: boolean, password: string) => emailSent ? { emailSent: true } : { emailSent: false, tempPassword: password }
const SECTION_LABEL: Record<string, string> = { nursery: 'Nursery', primary: 'Primary', secondary: 'Secondary' }

export async function superAdminRoutes(app: FastifyInstance) {

  // ── Super admin login (bypasses tenant middleware) ────────────────────────
  app.post('/superadmin/login', async (request: any, reply: any) => {
    const { email, password } = request.body as any
    if (!email || !password) return reply.status(400).send({ error: 'Email and password required' })

    const rows = await db()`
      SELECT id, school_id, role, email, full_name, password_hash, is_active
      FROM users
      WHERE email = ${email.toLowerCase()}
      AND role = 'super_admin'
      LIMIT 1
    ` as any[]

    const user = rows[0]
    if (!user || !user.is_active) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' })
    }

    await db()`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`

    const token = (app as any).jwt.sign(
      {
        id: user.id,
        schoolId: user.school_id,
        schoolSubdomain: 'platform',
        role: user.role,
        email: user.email,
        fullName: user.full_name,
      },
      { expiresIn: '12h' }
    )

    return reply.send({ token, user: { id: user.id, role: user.role, email: user.email, fullName: user.full_name } })
  })

  // ── Auth middleware for super admin routes ────────────────────────────────
  async function superAuth(request: any, reply: any) {
    try {
      await request.jwtVerify()
      if (request.user.role !== 'super_admin') {
        return reply.status(403).send({ error: 'FORBIDDEN' })
      }
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED' })
    }
  }

  // ── Platform overview ─────────────────────────────────────────────────────
  app.get('/superadmin/overview', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const schoolStats = await db()`
        SELECT
          COUNT(*) AS total_schools,
          COUNT(*) FILTER (WHERE is_active = true) AS active_schools,
          COUNT(*) FILTER (WHERE is_active = false) AS inactive_schools,
          COUNT(*) FILTER (WHERE subscription_tier = 'basic') AS basic_schools,
COUNT(*) FILTER (WHERE subscription_tier = 'standard') AS standard_schools,
COUNT(*) FILTER (WHERE subscription_tier = 'premium') AS premium_schools,
COUNT(*) FILTER (WHERE subscription_tier = 'enterprise') AS enterprise_schools
        FROM schools
      ` as any[]

      const userStats = await db()`
        SELECT
          COUNT(*) FILTER (WHERE role = 'student') AS total_students,
          COUNT(*) FILTER (WHERE role = 'teacher') AS total_teachers,
          COUNT(*) FILTER (WHERE role = 'parent') AS total_parents,
          COUNT(*) FILTER (WHERE role = 'school_admin') AS total_admins
        FROM users
        WHERE role != 'super_admin'
      ` as any[]

      const examStats = await db()`
        SELECT
          COUNT(*) AS total_exams,
          COUNT(*) FILTER (WHERE status = 'active') AS active_exams,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS exams_last_30_days
        FROM exams
      ` as any[]

      const sessionStats = await db()`
        SELECT
          COUNT(*) AS total_sessions,
          COUNT(*) FILTER (WHERE status = 'submitted') AS completed_sessions,
          COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_sessions,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS sessions_last_30_days
        FROM exam_sessions
      ` as any[]

      const resultStats = await db()`
        SELECT
          COUNT(*) AS total_results,
          COUNT(*) FILTER (WHERE approved_at IS NOT NULL) AS approved_results,
          AVG(total_score) AS avg_score
        FROM student_results
      ` as any[]

      return reply.send({
        schools: schoolStats[0],
        users: userStats[0],
        exams: examStats[0],
        sessions: sessionStats[0],
        results: resultStats[0],
      })
    }   
  )



    
    // ── Create new school (onboarding) ─────────────────────────────────────────
app.post('/superadmin/schools', { preHandler: [superAuth] },
  async (request: any, reply: any) => {
    const { name, subdomain, email, phone, subscription_tier, admin_name, admin_email } = request.body
    const valid = ['nursery', 'primary', 'secondary']
    const rawSections: string[] = Array.isArray(request.body.sections) ? request.body.sections : ['secondary']
    const sections = valid.filter(s => rawSections.includes(s))
    if (!sections.length) {
      return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'Choose at least one section (Nursery, Primary or Secondary).' })
    }

    if (!name || !subdomain || !email || !subscription_tier || !admin_name || !admin_email) {
      return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'name, subdomain, email, subscription_tier, admin_name, and admin_email are required.' })
    }
    if (!isTier(subscription_tier)) {
      return reply.status(400).send({ error: 'INVALID_TIER', message: 'Plan must be Basic, Standard, Premium or Enterprise.' })
    }

    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return reply.status(400).send({ error: 'INVALID_SUBDOMAIN', message: 'Subdomain can only contain lowercase letters, numbers, and hyphens.' })
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email)) {
      return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'School email is not a valid email address.' })
    }
    if (!emailPattern.test(admin_email)) {
      return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Admin email is not a valid email address.' })
    }

    const existing = await db()`
      SELECT id FROM schools WHERE subdomain = ${subdomain}
    ` as any[]

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'SUBDOMAIN_TAKEN', message: 'This subdomain is already in use.' })
    }

    const tempPassword = newTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 10)

    try {
      const result = await db().begin(async (tx: any) => {
        const schoolRows = await tx`
          INSERT INTO schools (name, subdomain, email, phone, subscription_tier, is_active, sections)
          VALUES (${name}, ${subdomain}, ${email}, ${phone ?? null}, ${subscription_tier}, true, ${sections})
          RETURNING id, name, subdomain, subscription_tier, sections
        `
        const school = schoolRows[0]

        const adminRows = await tx`
          INSERT INTO users (school_id, full_name, email, password_hash, role, is_active,must_change_password)
          VALUES (${school.id}, ${admin_name}, ${admin_email}, ${passwordHash}, 'school_admin', true, true)
          RETURNING id, full_name, email
        `
        return { school, admin: adminRows[0] }
      })

      // Welcome email with login details to the first School Admin
      const address = schoolUrl(result.school.subdomain)
      const secs = sections.map(x => SECTION_LABEL[x])
      const limit = getStudentLimit(subscription_tier)
      const welcome = schoolWelcomeEmail({
        schoolName: result.school.name, adminName: result.admin.full_name, adminEmail: result.admin.email, password: tempPassword,
        schoolAddress: address, planName: TIER_NAMES[subscription_tier as keyof typeof TIER_NAMES],
        studentLimit: limit >= 999999 ? 'any number of students' : `${limit} active students`,
        sections: secs.length > 1 ? `${secs.slice(0, -1).join(', ')} and ${secs.at(-1)}` : secs[0],
      })
      const emailSent = (await sendEmail({ to: result.admin.email, subject: welcome.subject, html: welcome.html })).success
      // …and a short notice, without the password, to the school's own address
      if (String(email).toLowerCase() !== String(result.admin.email).toLowerCase()) {
        const notice = schoolCreatedNoticeEmail({
          schoolName: result.school.name, adminName: result.admin.full_name, adminEmail: result.admin.email,
          schoolAddress: address, planName: TIER_NAMES[subscription_tier as keyof typeof TIER_NAMES],
        })
        sendEmail({ to: email, subject: notice.subject, html: notice.html }).catch(() => {})
      }

      return reply.status(201).send({
        school: result.school,
        admin: { id: result.admin.id, name: result.admin.full_name, email: result.admin.email },
        schoolAddress: address,
        ...loginReply(emailSent, tempPassword),
      })
    } catch (err: any) {
      return reply.status(500).send({ error: 'CREATION_FAILED', message: 'Failed to create school and admin.', detail: err.message })
    }
  })

  // ── Per-school breakdown ──────────────────────────────────────────────────
  app.get('/superadmin/schools', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const schools = await db()`
        SELECT
          s.id, s.name, s.subdomain, s.is_active, s.subscription_tier, s.sections,
          s.created_at,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'student') AS student_count,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'teacher') AS teacher_count,
          COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'parent') AS parent_count,
          COUNT(DISTINCT e.id) AS exam_count,
          COUNT(DISTINCT es.id) FILTER (WHERE es.status = 'submitted') AS submissions_count,
          MAX(es.created_at) AS last_activity
        FROM schools s
        LEFT JOIN users u ON u.school_id = s.id AND u.role != 'super_admin'
        LEFT JOIN exams e ON e.school_id = s.id
        LEFT JOIN exam_sessions es ON es.school_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC
      ` as any[]

      return reply.send({ schools: schools.map(s => ({ ...s, sections: asSections(s.sections) })) })
    })

  // ── Set a school's sections ───────────────────────────────────────────────
  app.patch('/superadmin/schools/:id/sections', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const sections = Array.isArray(request.body?.sections) ? request.body.sections : []
      const r = await saveSections((request.params as any).id, sections)
      if (r) return reply.status(r.error === 'SECTION_IN_USE' ? 409 : 400).send(r)
      return reply.send({ saved: true })
    })

  // ── Toggle school active status ───────────────────────────────────────────
  app.patch('/superadmin/schools/:id/toggle', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const rows = await db()`
        UPDATE schools SET is_active = NOT is_active
        WHERE id = ${id}::uuid
        RETURNING id, name, is_active
      ` as any[]
      return reply.send({ school: rows[0] })
    })

  // ── Update school subscription tier ──────────────────────────────────────
  app.patch('/superadmin/schools/:id/tier', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const { tier } = request.body as any
      if (!isTier(tier)) {
        return reply.status(400).send({ error: 'INVALID_TIER', message: 'Plan must be Basic, Standard, Premium or Enterprise.' })
      }
      const rows = await db()`
        UPDATE schools SET subscription_tier = ${tier}
        WHERE id = ${id}::uuid
        RETURNING id, name, subscription_tier
      ` as any[]
      return reply.send({ school: rows[0] })
    })

  // ── List proprietor accounts for a specific school ────────────────────────
  app.get('/superadmin/schools/:id/proprietors', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const rows = await db()`
        SELECT id, full_name, email, phone, is_active, created_at, last_login_at
        FROM users WHERE school_id = ${id}::uuid AND role = 'proprietor'
        ORDER BY created_at ASC
      ` as any[]
      return reply.send({ proprietors: rows })
    })

  // ── A school's School Admin accounts ──────────────────────────────────────
  app.get('/superadmin/schools/:id/admins', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      if (!z.string().uuid().safeParse(id).success) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })
      const rows = await db()`
        SELECT id, full_name, email, is_active, created_at, last_login_at, must_change_password
        FROM users WHERE school_id = ${id}::uuid AND role = 'school_admin'
        ORDER BY created_at ASC
      ` as any[]
      return reply.send({ admins: rows })
    })

  // ── Send a school account fresh login details ─────────────────────────────
  // For when the welcome email didn't arrive or was lost: sets a new temporary
  // password (they choose their own at next sign-in) and emails it.
  app.post('/superadmin/users/:userId/resend-login', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { userId } = request.params as any
      if (!z.string().uuid().safeParse(userId).success) return reply.status(404).send({ error: 'NOT_FOUND' })
      const [user] = await db()`
        SELECT id, school_id, full_name, email, role, is_active FROM users
        WHERE id = ${userId}::uuid AND role IN ('school_admin', 'proprietor', 'bursar')
      ` as any[]
      if (!user) return reply.status(404).send({ error: 'NOT_FOUND', message: 'No School Admin, Proprietor or Bursar account with that id.' })
      if (!user.is_active) return reply.status(400).send({ error: 'INACTIVE', message: 'This account is deactivated. Activate it first.' })
      const tempPassword = newTempPassword()
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      await db()`UPDATE users SET password_hash = ${passwordHash}, must_change_password = true, updated_at = now() WHERE id = ${user.id}::uuid`
      const emailSent = await emailLoginDetails(user.school_id, user, tempPassword)
      return reply.send({ email: user.email, ...loginReply(emailSent, tempPassword) })
    })

  // ── Create a proprietor account for a specific school ─────────────────────
  app.post('/superadmin/schools/:id/proprietors', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const { full_name, email, phone } = request.body as any
      if (!full_name || !email) {
        return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'full_name and email are required.' })
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Not a valid email address.' })
      }
      const schoolRows = await db()`SELECT id FROM schools WHERE id = ${id}::uuid` as any[]
      if (!schoolRows[0]) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })

      const existing = await db()`SELECT id FROM users WHERE email = ${email.toLowerCase()}` as any[]
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'This email is already in use.' })
      }

      const tempPassword = newTempPassword()
      const passwordHash = await bcrypt.hash(tempPassword, 10)
      const rows = await db()`
        INSERT INTO users (school_id, full_name, email, phone, password_hash, role, is_active, must_change_password)
        VALUES (${id}::uuid, ${full_name}, ${email.toLowerCase()}, ${phone ?? null}, ${passwordHash}, 'proprietor', true, true)
        RETURNING id, full_name, email, phone
      ` as any[]
      const emailSent = await emailLoginDetails(id, { ...rows[0], role: 'proprietor' }, tempPassword)
      return reply.status(201).send({ proprietor: rows[0], ...loginReply(emailSent, tempPassword) })
    })

  // ── Bursar accounts (fallback for schools with NO active Proprietor) ──────
  app.get('/superadmin/schools/:id/bursars', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const rows = await db()`
        SELECT id, full_name, email, phone, is_active, created_at, last_login_at
        FROM users WHERE school_id = ${id}::uuid AND role = 'bursar'
        ORDER BY created_at ASC
      ` as any[]
      return reply.send({ bursars: rows })
    })

  app.post('/superadmin/schools/:id/bursars', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const { full_name, email, phone } = request.body as any
      if (!full_name || !email) {
        return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'full_name and email are required.' })
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Not a valid email address.' })
      }
      const schoolRows = await db()`SELECT id, subscription_tier FROM schools WHERE id = ${id}::uuid` as any[]
      if (!schoolRows[0]) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })
      if (!tierAtLeast(schoolRows[0].subscription_tier, FINANCE_CONTROLS_TIER)) {
        return reply.status(403).send({ error: 'UPGRADE_REQUIRED', requiredTier: FINANCE_CONTROLS_TIER,
          message: `Bursar accounts need the ${TIER_NAMES[FINANCE_CONTROLS_TIER]} plan or higher. Move the school to ${TIER_NAMES[FINANCE_CONTROLS_TIER]} first.` })
      }

      const prop = await db()`
        SELECT 1 FROM users WHERE school_id = ${id}::uuid AND role = 'proprietor' AND is_active = true
      ` as any[]
      if (prop[0]) {
        return reply.status(409).send({ error: 'HAS_PROPRIETOR', message: 'This school has an active Proprietor, who should create the Bursar account.' })
      }

      const existing = await db()`SELECT id FROM users WHERE email = ${email.toLowerCase()}` as any[]
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'This email is already in use.' })
      }

      const tempPassword = newTempPassword()
      const passwordHash = await bcrypt.hash(tempPassword, 12)
      const rows = await db()`
        INSERT INTO users (school_id, full_name, email, phone, password_hash, role, is_active, must_change_password)
        VALUES (${id}::uuid, ${full_name}, ${email.toLowerCase()}, ${phone ?? null}, ${passwordHash}, 'bursar', true, true)
        RETURNING id, full_name, email, phone
      ` as any[]
      await db()`
        INSERT INTO fee_audit_log (school_id, actor_id, actor_role, action, entity_type, entity_id, after_data)
        VALUES (${id}::uuid, ${request.user?.id ?? null}::uuid, 'super_admin', 'bursar.created', 'user',
                ${rows[0].id}::uuid, ${db().json({ fullName: full_name, email: email.toLowerCase() })})
      `
      const emailSent = await emailLoginDetails(id, { ...rows[0], role: 'bursar' }, tempPassword)
      return reply.status(201).send({ bursar: rows[0], ...loginReply(emailSent, tempPassword) })
    })

  // ═══════════════════════════════════════════════════════════════════════════
  // JAMB QUESTION BANK — shared by every school, so only super_admin may change it
  // ═══════════════════════════════════════════════════════════════════════════

  app.get('/superadmin/jamb/subjects', { preHandler: [superAuth] },
    async (_request: any, reply: any) => {
      const subjects = await db()`
        SELECT js.id, js.name, js.is_compulsory,
               (SELECT COUNT(*) FROM jamb_past_questions q WHERE q.subject_id = js.id) AS question_count
        FROM jamb_subjects js ORDER BY js.is_compulsory DESC, js.name
      ` as any[]
      const topics = await db()`
        SELECT jt.id, jt.subject_id, jt.name, jt.sort_order,
               (SELECT COUNT(*) FROM jamb_past_questions q WHERE q.topic_id = jt.id) AS question_count
        FROM jamb_topics jt ORDER BY jt.subject_id, jt.sort_order
      ` as any[]
      return reply.send({
        subjects: subjects.map((s: any) => ({ ...s, topics: topics.filter((t: any) => t.subject_id === s.id) })),
      })
    })

  // Bulk add past questions. Subject and topic are matched by NAME (case-insensitive)
  // so a spreadsheet can be uploaded as-is. All-or-nothing: any bad row rejects the batch.
  app.post('/superadmin/jamb/questions/bulk', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const row = z.object({
        subject: z.string().trim().min(1),
        topic: z.string().trim().optional().transform(v => (v ? v : undefined)),
        year: z.coerce.number().int().min(1978).max(2100),
        question: z.string().trim().min(1),
        optionA: z.string().trim().min(1),
        optionB: z.string().trim().min(1),
        optionC: z.string().trim().min(1),
        optionD: z.string().trim().min(1),
        correctOption: z.string().trim().toLowerCase().pipe(z.enum(['a', 'b', 'c', 'd'])),
        explanation: z.string().trim().optional().transform(v => (v ? v : null)),
        difficulty: z.string().trim().toLowerCase().optional().transform(v => (v ? v : 'medium')).pipe(z.enum(['easy', 'medium', 'hard'])),
      })
      const body = z.object({ questions: z.array(z.any()).min(1).max(1000) }).safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Send { questions: [...] } with 1 to 1000 rows.' })

      const subjects = await db()`SELECT id, lower(name) AS name FROM jamb_subjects` as any[]
      const topics = await db()`SELECT id, subject_id, lower(name) AS name FROM jamb_topics` as any[]

      const errors: { row: number; message: string }[] = []
      const clean: any[] = []
      body.data.questions.forEach((raw: any, i: number) => {
        const r = row.safeParse(raw)
        if (!r.success) {
          const f = r.error.flatten().fieldErrors
          const first = Object.keys(f)[0]
          errors.push({ row: i + 1, message: `${first}: ${(f as any)[first]?.[0] ?? 'invalid'}` })
          return
        }
        const q = r.data
        const subj = subjects.find((s: any) => s.name === q.subject.toLowerCase())
        if (!subj) { errors.push({ row: i + 1, message: `Unknown subject "${q.subject}"` }); return }
        let topicId: string | null = null
        if (q.topic) {
          const t = topics.find((x: any) => x.subject_id === subj.id && x.name === q.topic!.toLowerCase())
          if (!t) { errors.push({ row: i + 1, message: `Unknown topic "${q.topic}" in ${q.subject}` }); return }
          topicId = t.id
        }
        clean.push({ ...q, subjectId: subj.id, topicId })
      })
      if (errors.length > 0) return reply.status(400).send({ error: 'ROWS_INVALID', errors: errors.slice(0, 100), errorCount: errors.length })

      let inserted = 0
      let duplicates = 0
      await db().begin(async (tx: any) => {
        for (const q of clean) {
          const dup = await tx`
            SELECT 1 FROM jamb_past_questions
            WHERE subject_id = ${q.subjectId}::uuid AND year = ${q.year} AND lower(trim(question)) = lower(${q.question})
            LIMIT 1
          ` as any[]
          if (dup[0]) { duplicates++; continue }
          await tx`
            INSERT INTO jamb_past_questions (subject_id, topic_id, year, question, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty_level)
            VALUES (${q.subjectId}::uuid, ${q.topicId}::uuid, ${q.year}, ${q.question}, ${q.optionA}, ${q.optionB}, ${q.optionC}, ${q.optionD},
                    ${q.correctOption}, ${q.explanation}, ${q.difficulty})
          `
          inserted++
        }
      })
      return reply.status(201).send({ inserted, duplicates })
    })

  // ── Deactivate/reactivate a proprietor account ────────────────────────────
  app.patch('/superadmin/proprietors/:proprietorId/toggle', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { proprietorId } = request.params as any
      const rows = await db()`
        UPDATE users SET is_active = NOT is_active
        WHERE id = ${proprietorId}::uuid AND role = 'proprietor'
        RETURNING id, full_name, is_active
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ proprietor: rows[0] })
    })

  // ── Permanently delete a proprietor account ───────────────────────────────
  app.delete('/superadmin/proprietors/:proprietorId', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { proprietorId } = request.params as any
      const rows = await db()`
        DELETE FROM users WHERE id = ${proprietorId}::uuid AND role = 'proprietor'
        RETURNING id, full_name
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ deleted: true, proprietor: rows[0] })
    })
      // ── Change own password (superadmin) ──────────────────────────────────────
  app.patch('/superadmin/change-password', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { currentPassword, newPassword } = request.body as any
      if (!currentPassword || !newPassword || newPassword.length < 8) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Current password and a new password (min 8 characters) are required.' })
      }
      const rows = await db()`
        SELECT id, password_hash FROM users WHERE id = ${request.user.id}::uuid AND role = 'super_admin'
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })

      const bcrypt = await import('bcryptjs')
      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash)
      if (!valid) return reply.status(401).send({ error: 'INVALID_PASSWORD', message: 'Current password is incorrect.' })

      const newHash = await bcrypt.hash(newPassword, 12)
      await db()`
        UPDATE users SET password_hash = ${newHash} WHERE id = ${request.user.id}::uuid
      `
      return reply.send({ updated: true })
    })
      // ── List all superadmin accounts ────────────────────────────────────────
  app.get('/superadmin/admins', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const admins = await db()`
        SELECT id, full_name, email, is_active, created_at, last_login_at
        FROM users WHERE role = 'super_admin'
        ORDER BY created_at ASC
      ` as any[]
      return reply.send({ admins })
    })

  // ── Create a new superadmin account ─────────────────────────────────────
  app.post('/superadmin/admins', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { full_name, email } = request.body as any
      if (!full_name || !email) {
        return reply.status(400).send({ error: 'MISSING_FIELDS', message: 'full_name and email are required.' })
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(email)) {
        return reply.status(400).send({ error: 'INVALID_EMAIL', message: 'Not a valid email address.' })
      }
      const existing = await db()`SELECT id FROM users WHERE email = ${email.toLowerCase()}` as any[]
      if (existing.length > 0) {
        return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'This email is already in use.' })
      }
      const tempPassword = newTempPassword()
      const passwordHash = await bcrypt.hash(tempPassword, 10)
      // Platform admins belong to no school (school_id is NULL, migration 021),
      // so removing a school can never remove them.
      const rows = await db()`
        INSERT INTO users (school_id, full_name, email, password_hash, role, is_active)
        VALUES (NULL, ${full_name}, ${email.toLowerCase()}, ${passwordHash}, 'super_admin', true)
        RETURNING id, full_name, email
      ` as any[]
      return reply.status(201).send({ admin: rows[0], tempPassword })
    })

  // ── Deactivate/reactivate a superadmin account ──────────────────────────
  app.patch('/superadmin/admins/:id/toggle', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      if (id === request.user.id) {
        return reply.status(400).send({ error: 'CANNOT_DEACTIVATE_SELF', message: 'You cannot deactivate your own account.' })
      }
      const rows = await db()`
        UPDATE users SET is_active = NOT is_active
        WHERE id = ${id}::uuid AND role = 'super_admin'
        RETURNING id, full_name, is_active
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ admin: rows[0] })
    })

  // ── Permanently delete a superadmin account ─────────────────────────────
  app.delete('/superadmin/admins/:id', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      if (id === request.user.id) {
        return reply.status(400).send({ error: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account.' })
      }
      const activeCount = await db()`
        SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND is_active = true
      ` as any[]
      if (Number(activeCount[0].count) <= 1) {
        return reply.status(400).send({ error: 'LAST_ADMIN', message: 'Cannot delete the last remaining active superadmin.' })
      }
      const rows = await db()`
        DELETE FROM users WHERE id = ${id}::uuid AND role = 'super_admin'
        RETURNING id, full_name
      ` as any[]
      if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      return reply.send({ deleted: true, admin: rows[0] })
    })
      // ── Platform analytics: growth, activity trends, academic performance ────
  app.get('/superadmin/analytics', { preHandler: [superAuth] },
    async (request: any, reply: any) => {
      const schoolGrowth = await db()`
        SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
        FROM schools
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month ASC
      ` as any[]

      const activityTrend = await db()`
        SELECT TO_CHAR(created_at, 'YYYY-MM') AS month, COUNT(*) AS count
        FROM exam_sessions
        WHERE status = 'submitted'
        GROUP BY TO_CHAR(created_at, 'YYYY-MM')
        ORDER BY month ASC
      ` as any[]

      const schoolPerformance = await db()`
        SELECT s.id, s.name,
          COUNT(sr.id) AS total_results,
          ROUND(AVG(sr.total_score), 1) AS avg_score,
          ROUND(COUNT(sr.id) FILTER (WHERE sr.grade != 'F')::numeric / NULLIF(COUNT(sr.id), 0) * 100, 1) AS pass_rate
        FROM schools s
        LEFT JOIN student_results sr ON sr.school_id = s.id
        GROUP BY s.id, s.name
        ORDER BY avg_score DESC NULLS LAST
      ` as any[]

      return reply.send({ schoolGrowth, activityTrend, schoolPerformance })
    })
}
