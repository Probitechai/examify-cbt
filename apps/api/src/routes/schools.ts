import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb, db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { normalizeTier, TIER_NAMES, FEATURE_TIERS, featuresFor, TIER_STUDENT_LIMITS } from '../middleware/tier'
import { SECTIONS, SECTION_LEVELS, levelsFor, asSections, sectionOf } from '../lib/classLevels'
import { findStudent, studentAccess } from '../lib/teacherScope'

/**
 * Set a school's sections. Refuses to drop a section that still has active
 * students, so nobody's class disappears from the menus. Returns an error
 * body, or null when saved.
 */
export async function saveSections(schoolId: string, wanted: string[]) {
  const sections = SECTIONS.filter(s => wanted.includes(s))
  if (!sections.length) return { error: 'VALIDATION_ERROR', message: 'Choose at least one section.' }
  const keep = new Set(levelsFor(sections))
  const inUse = await db()`
    SELECT class_level, COUNT(*)::int AS n FROM users
    WHERE school_id = ${schoolId}::uuid AND role = 'student' AND is_active = true AND class_level IS NOT NULL
    GROUP BY class_level
  ` as any[]
  const blocked = inUse.filter(r => !keep.has(r.class_level) && sectionOf(r.class_level))
  if (blocked.length) {
    const list = blocked.map(r => `${r.class_level} (${r.n})`).join(', ')
    return { error: 'SECTION_IN_USE', message: `Students are still in ${list}. Move or deactivate them before removing that section.`, classes: blocked }
  }
  await db()`UPDATE schools SET sections = ${sections} WHERE id = ${schoolId}::uuid`
  return null
}

export async function schoolRoutes(app: FastifyInstance) {

  // ── Public: list active schools (no auth required) ─────────────────────────
app.get('/schools/public', async (request: any, reply: any) => {
  const rows = await db()`
    SELECT subdomain, name
    FROM schools
    WHERE is_active = true
    ORDER BY name
  ` as any[]
  return reply.send(rows)
})

  // ── Public: a school's class list (admissions form) ─────────────────────────
  app.get('/schools/public/class-levels/:subdomain', async (request: any, reply: any) => {
    const rows = await db()`SELECT sections FROM schools WHERE subdomain = ${(request.params as any).subdomain} AND is_active = true` as any[]
    if (!rows[0]) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })
    const sections = asSections(rows[0].sections)
    return reply.send({ sections, levels: levelsFor(sections) })
  })

  // ── This school's sections and class list (every signed-in role) ───────────
  app.get('/schools/class-levels', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const rows = await db()`SELECT sections FROM schools WHERE id = ${request.schoolId}::uuid` as any[]
      const sections = asSections(rows[0]?.sections)
      return reply.send({ sections, levels: levelsFor(sections), bySection: SECTION_LEVELS })
    })

  // ── This school's plan and which paid features it includes (every signed-in role)
  // The web app locks pages from this, using the same table the API enforces.
  app.get('/schools/plan', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const tier = normalizeTier(request.school?.subscriptionTier)
      return reply.send({ tier, planName: TIER_NAMES[tier], features: featuresFor(tier), featureTiers: FEATURE_TIERS, studentLimits: TIER_STUDENT_LIMITS })
    })

  // ── Get school settings ───────────────────────────────────────────────────
  app.get('/schools/settings', { preHandler: [authenticate, requireRole('school_admin', 'teacher', 'proprietor')] },
    async (request: any, reply: any) => {
      const rows = await db()`
        SELECT id, name, subdomain, logo_url, email, phone, subscription_tier, sections
        FROM schools WHERE id = ${request.schoolId}::uuid
      ` as any[]
      if (!rows[0]) return reply.send({})
      return reply.send({ ...rows[0], sections: asSections(rows[0].sections) })
    })

  // ── Update school settings (logo, etc.) ───────────────────────────────────
  app.patch('/schools/settings', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        logoUrl: z.string().url().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        sections: z.array(z.enum(['nursery', 'primary', 'secondary'])).min(1).optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      if (d.sections !== undefined) {
        const r = await saveSections(request.schoolId, d.sections)
        if (r) return reply.status(409).send(r)
      }
      if (d.logoUrl !== undefined) {
        await db()`UPDATE schools SET logo_url = ${d.logoUrl} WHERE id = ${request.schoolId}::uuid`
      }
      if (d.email !== undefined) {
        await db()`UPDATE schools SET email = ${d.email} WHERE id = ${request.schoolId}::uuid`
      }
      if (d.phone !== undefined) {
        await db()`UPDATE schools SET phone = ${d.phone} WHERE id = ${request.schoolId}::uuid`
      }
      return reply.send({ saved: true })
    })

  // ── Student photo ───────────────────────────────────────────────────────
  // The browser shrinks the picture to passport size and sends it here as an
  // image (data URL); it is kept with the student, so no storage bucket is needed.
  // photo: null removes it. An https link (photoUrl) is still accepted.
  const PHOTO_MAX = 300 * 1024
  app.get('/users/:id/photo', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      const student = await findStudent(tdb, request.schoolId, String(id))
      if (!student || !(await studentAccess(tdb, request, student)).allowed) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Student not found.' })
      }
      const rows = await tdb.query`SELECT photo_url FROM users WHERE id = ${student.id}::uuid` as any[]
      return reply.send({ photo: rows[0]?.photo_url || null })
    })

  app.patch('/users/:id/photo', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Student not found.' })
      }
      const schema = z.object({
        photo: z.string().regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/).max(PHOTO_MAX).nullable().optional(),
        photoUrl: z.string().url().startsWith('https://').max(1000).optional(),
      }).refine(b => b.photo !== undefined || b.photoUrl !== undefined)
      const body = schema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Send a JPEG, PNG or WebP photo under 300 KB.' })
      }
      const value = body.data.photo !== undefined ? body.data.photo : body.data.photoUrl!

      const rows = await db()`
        UPDATE users SET photo_url = ${value}
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid AND role = 'student'
        RETURNING id
      ` as any[]
      if (!rows.length) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Student not found.' })
      return reply.send({ saved: true, hasPhoto: value !== null })
    })
}
