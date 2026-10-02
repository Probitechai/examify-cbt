import type { FastifyInstance } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { levelsFor, asSections } from '../lib/classLevels'
import { authenticate, requireRole } from '../middleware/auth'
import { studentCapacity, limitError } from '../lib/studentLimit'
import { normalizeTier, TIER_NAMES } from '../middleware/tier'
import { sendEmail } from '../lib/email'
import { loginCredentialsEmail } from '../emails/templates'
import { loadTeacherScope, canSeeClass } from '../lib/teacherScope'
async function schoolLevels(schoolId: string): Promise<string[]> {
  const rows = await db()`SELECT sections FROM schools WHERE id = ${schoolId}::uuid` as any[]
  return levelsFor(asSections(rows[0]?.sections))
}

export async function userRoutes(app: FastifyInstance) {

  app.get('/users', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const users = await tdb.query`
        SELECT id, role, email, full_name, phone, date_of_birth, admission_no,
               class_level, class_arm, is_active, last_login_at, created_at
        FROM users
        WHERE school_id = ${request.schoolId}::uuid
        ORDER BY role, full_name
      `
      return reply.send({ users })
    })

  // Students of one class, for staff pickers (report card and the like).
  // Teachers get only the arms they teach or are class teacher for.
  app.get('/users/students', { preHandler: [authenticate, requireRole('school_admin', 'proprietor', 'teacher')] },
    async (request: any, reply: any) => {
      const { classLevel, classArm } = request.query as any
      if (!classLevel) return reply.status(400).send({ error: 'classLevel is required' })
      const cl = String(classLevel), ca = classArm ? String(classArm) : null
      const tdb = tenantDb(request.schoolId)
      let students = await tdb.query`
        SELECT id, full_name, admission_no, class_level, class_arm, (photo_url IS NOT NULL AND photo_url <> '') AS has_photo
        FROM users
        WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND is_active = true
          AND class_level = ${cl} AND (${ca}::text IS NULL OR class_arm = ${ca})
        ORDER BY class_arm, full_name
      ` as any[]
      if (request.user.role === 'teacher') {
        const scope = await loadTeacherScope(tdb, request.schoolId, request.user.id)
        students = students.filter((s: any) => canSeeClass(scope, s.class_level, s.class_arm))
      }
      return reply.send({ students })
    })

  app.post('/users', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        // NEVER add 'bursar' or 'proprietor' here — only the Proprietor / super_admin create those
        role: z.enum(['school_admin', 'teacher', 'student', 'parent']),
        email: z.string().email(),
        fullName: z.string().min(1),
        password: z.string().min(6),
        admissionNo: z.string().optional(),
        classLevel: z.string().optional(),
        classArm: z.string().optional(),
        phone: z.string().optional(),
        dateOfBirth: z.string().optional(),
      }).refine(data => data.role !== 'student' || !!data.dateOfBirth, {
        message: 'Date of birth is required for students',
        path: ['dateOfBirth'],
      })

      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: body.error.flatten() })

      const d = body.data
      if (d.role === 'student' && d.classLevel) {
        const levels = await schoolLevels(request.schoolId)
        if (!levels.includes(d.classLevel)) {
          return reply.status(400).send({ error: 'UNKNOWN_CLASS', message: `“${d.classLevel}” isn’t one of this school’s classes (${levels.join(', ')}).` })
        }
      }
      const passwordHash = await bcrypt.hash(d.password, 12)
      const tdb = tenantDb(request.schoolId)

      // Student limit: checked and the student added in one locked transaction
      const result = await tdb.transaction(async (tx: any) => {
        if (d.role === 'student') {
          const cap = await studentCapacity(tx, request.schoolId)
          if (cap.room < 1) return { limit: limitError(cap, 1) }
        }
        const rows = await tx`
          INSERT INTO users (school_id, role, email, full_name, password_hash, admission_no, class_level, class_arm, phone, date_of_birth)
          VALUES (${request.schoolId}::uuid, ${d.role}::user_role, ${d.email.toLowerCase()}, ${d.fullName},
                  ${passwordHash}, ${d.admissionNo ?? null}, ${d.classLevel ?? null}, ${d.classArm ?? null},
                  ${d.phone ?? null}, ${d.dateOfBirth ?? null})
          RETURNING id
        ` as any[]
        return { rows }
      })
      if (result.limit) return reply.status(403).send(result.limit)
      const rows = result.rows as any[]

      // Send login credentials email (fire and forget — don't block the response)
      const { subject, html } = loginCredentialsEmail({
        schoolName: request.school.name,
        fullName: d.fullName,
        email: d.email.toLowerCase(),
        password: d.password,
        loginUrl: 'https://examify-cbt-web.vercel.app/login',
        role: d.role,
      })
      sendEmail({ to: d.email.toLowerCase(), subject, html }).catch(err =>
        console.error('Failed to send credentials email:', err.message)
      )

      return reply.status(201).send({ userId: rows[0].id })
    })

  // How many more students the plan allows; with `emails`, also how many of them are new
  app.post('/users/student-capacity', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const emails: string[] = Array.isArray(request.body?.emails)
        ? [...new Set<string>(request.body.emails.filter((e: any) => typeof e === 'string').map((e: string) => e.trim().toLowerCase()))]
        : []
      const tdb = tenantDb(request.schoolId)
      const cap = await tdb.transaction((tx: any) => studentCapacity(tx, request.schoolId))
      let newStudents = 0
      if (emails.length) {
        const found = await tdb.query`
          SELECT lower(email) AS email FROM users WHERE school_id = ${request.schoolId}::uuid AND lower(email) = ANY(${emails})
        ` as any[]
        newStudents = emails.length - found.length
      }
      const fits = newStudents <= cap.room
      return reply.send({ ...cap, plan: TIER_NAMES[normalizeTier(cap.tier)], newStudents, fits,
        message: fits ? null : limitError(cap, newStudents).message })
    })

  app.post('/users/bulk', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        students: z.array(z.object({
          fullName: z.string().min(1),
          email: z.string().email(),
          admissionNo: z.string().optional(),
          classLevel: z.string(),
          classArm: z.string(),
          password: z.string().default('Student@1234'),
          phone: z.string().optional(),
          dateOfBirth: z.string().optional(),
        }))
      })

      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const tdb = tenantDb(request.schoolId)
      const errors: string[] = []
      const levels = await schoolLevels(request.schoolId)

      // Rows that would really add a student: a known class, an email not already
      // in the school, and not repeated earlier in the same file
      const existing = new Set((await tdb.query`
        SELECT lower(email) AS email FROM users WHERE school_id = ${request.schoolId}::uuid
      ` as any[]).map(r => r.email))
      const seen = new Set<string>()
      const toAdd: any[] = []
      let skipped = 0
      for (const s of body.data.students) {
        const email = s.email.toLowerCase()
        if (!levels.includes(s.classLevel)) {
          errors.push(`${s.email}: “${s.classLevel}” isn’t one of this school’s classes`)
          continue
        }
        if (existing.has(email) || seen.has(email)) { skipped++; continue }
        seen.add(email)
        toAdd.push({ ...s, email })
      }

      // Passwords hashed before the transaction so the school isn't locked for long
      for (const s of toAdd) s.passwordHash = await bcrypt.hash(s.password, 12)

      const result = await tdb.transaction(async (tx: any) => {
        const cap = await studentCapacity(tx, request.schoolId)
        if (toAdd.length > cap.room) return { limit: limitError(cap, toAdd.length) }
        let imported = 0
        for (const s of toAdd) {
          try {
            // a savepoint per row, so one bad row doesn't undo the rest
            const rows = await tx.savepoint((sp: any) => sp`
              INSERT INTO users (school_id, role, email, full_name, password_hash, admission_no, class_level, class_arm, phone, date_of_birth)
              VALUES (${request.schoolId}::uuid, 'student'::user_role, ${s.email}, ${s.fullName},
                      ${s.passwordHash}, ${s.admissionNo ?? null}, ${s.classLevel}, ${s.classArm},
                      ${s.phone ?? null}, ${s.dateOfBirth ?? null})
              ON CONFLICT (school_id, email) DO NOTHING
              RETURNING id
            `) as any[]
            if (rows.length) imported++
            else skipped++
          } catch (err: any) {
            errors.push(`${s.email}: ${err.message}`)
          }
        }
        return { imported }
      })
      if (result.limit) return reply.status(403).send({ ...result.limit, imported: 0, errors })

      return reply.send({ imported: result.imported, skipped, errors })
    })

  // Accounts the School Admin must never change: only the Proprietor (or super_admin)
  // manages these. Otherwise an Admin could deactivate the Bursar to regain fee
  // write access, or lock the Proprietor out.
  const PROTECTED_ROLES = ['bursar', 'proprietor', 'super_admin']

  app.patch('/users/:id/status', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const { isActive } = request.body as any
      if (typeof isActive !== 'boolean') return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const tdb = tenantDb(request.schoolId)

      const target = await tdb.query`
        SELECT role FROM users WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!target[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
      if (PROTECTED_ROLES.includes(target[0].role)) {
        return reply.status(403).send({ error: 'PROTECTED_ACCOUNT', message: 'Only the Proprietor can change this account.' })
      }
      if (id === request.user.id && isActive === false) {
        return reply.status(400).send({ error: 'CANNOT_DEACTIVATE_SELF' })
      }

      const result = await tdb.transaction(async (tx: any) => {
        // Switching a student back on counts towards the plan's limit
        if (isActive && target[0].role === 'student') {
          const [u] = await tx`SELECT is_active FROM users WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid` as any[]
          if (u && !u.is_active) {
            const cap = await studentCapacity(tx, request.schoolId)
            if (cap.room < 1) return { limit: limitError(cap, 1) }
          }
        }
        await tx`
          UPDATE users SET is_active = ${isActive}
          WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
        `
        return {}
      })
      if (result.limit) return reply.status(403).send(result.limit)
      return reply.send({ updated: true })
    })
      app.delete('/users/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)

      if (id === request.user.id) {
        return reply.status(400).send({ error: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account.' })
      }

      const targetRows = await tdb.query`
        SELECT role FROM users WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      ` as any[]
      const target = targetRows[0]
      if (!target) return reply.status(404).send({ error: 'NOT_FOUND' })

      if (!['teacher', 'school_admin'].includes(target.role)) {
        return reply.status(400).send({ error: 'UNSUPPORTED_ROLE', message: 'Only teacher and admin accounts can be permanently deleted. Use deactivate for students and parents.' })
      }

      if (target.role === 'school_admin') {
        const activeAdminCount = await tdb.query`
          SELECT COUNT(*) AS count FROM users
          WHERE school_id = ${request.schoolId}::uuid AND role = 'school_admin' AND is_active = true
        ` as any[]
        if (Number(activeAdminCount[0].count) <= 1) {
          return reply.status(400).send({ error: 'LAST_ADMIN', message: 'Cannot delete the last remaining active admin for this school.' })
        }
      }

      try {
        await tdb.query`
          DELETE FROM users WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
        `
        return reply.send({ deleted: true })
      } catch (err: any) {
        return reply.status(400).send({
          error: 'DELETE_BLOCKED',
          message: 'This person has existing records (results entered, attendance marked, etc.) linked to their account, so they cannot be permanently deleted. Please use Deactivate instead.',
        })
      }
    })
}
