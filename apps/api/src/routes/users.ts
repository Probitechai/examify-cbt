import type { FastifyInstance } from 'fastify'
import * as bcrypt from 'bcryptjs'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { levelsFor, asSections } from '../lib/classLevels'
import { authenticate, requireRole } from '../middleware/auth'
import { getStudentLimit, normalizeTier, TIER_NAMES } from '../middleware/tier'
import { sendEmail } from '../lib/email'
import { loginCredentialsEmail } from '../emails/templates'
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

      // Check student limit for the school's tier
      if (d.role === 'student') {
        const tier = normalizeTier(request.school?.subscriptionTier)
        const tierLimit = getStudentLimit(tier)
        const countRows = await tdb.query`
          SELECT COUNT(*) AS student_count FROM users
          WHERE school_id = ${request.schoolId}::uuid AND role = 'student' AND is_active = true
        ` as any[]
        const currentCount = Number(countRows[0]?.student_count ?? 0)
        if (currentCount >= tierLimit) {
          return reply.status(403).send({
            error: 'STUDENT_LIMIT_REACHED',
            message: `Your ${TIER_NAMES[tier]} plan allows up to ${tierLimit} students. Please upgrade to add more.`,
          })
        }
      }

      const rows = await tdb.query`
        INSERT INTO users (school_id, role, email, full_name, password_hash, admission_no, class_level, class_arm, phone, date_of_birth)
        VALUES (${request.schoolId}::uuid, ${d.role}::user_role, ${d.email.toLowerCase()}, ${d.fullName},
                ${passwordHash}, ${d.admissionNo ?? null}, ${d.classLevel ?? null}, ${d.classArm ?? null},
                ${d.phone ?? null}, ${d.dateOfBirth ?? null})
        RETURNING id
      ` as any[]

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
      let imported = 0
      const errors: string[] = []
      const levels = await schoolLevels(request.schoolId)

      for (const s of body.data.students) {
        if (!levels.includes(s.classLevel)) {
          errors.push(`${s.email}: “${s.classLevel}” isn’t one of this school’s classes`)
          continue
        }
        try {
          const passwordHash = await bcrypt.hash(s.password, 12)
          await tdb.query`
            INSERT INTO users (school_id, role, email, full_name, password_hash, admission_no, class_level, class_arm, phone, date_of_birth)
            VALUES (${request.schoolId}::uuid, 'student'::user_role, ${s.email.toLowerCase()}, ${s.fullName},
                    ${passwordHash}, ${s.admissionNo ?? null}, ${s.classLevel}, ${s.classArm},
                    ${s.phone ?? null}, ${s.dateOfBirth ?? null})
            ON CONFLICT (school_id, email) DO NOTHING
          `
          imported++
        } catch (err: any) {
          errors.push(`${s.email}: ${err.message}`)
        }
      }

      return reply.send({ imported, errors })
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

      await tdb.query`
        UPDATE users SET is_active = ${isActive}
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
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
