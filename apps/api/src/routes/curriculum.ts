import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { requireTier } from '../middleware/tier'

// Default Nigerian curriculum subjects per class level
const NIGERIAN_SUBJECTS = {
  JSS: [
    { name: 'English Language', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Mathematics', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Basic Science', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Basic Technology', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Social Studies', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Civic Education', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Christian Religious Studies', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Islamic Religious Studies', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'French', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Agricultural Science', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Home Economics', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Computer Studies', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Creative Arts', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Physical Education', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Music', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
    { name: 'Business Studies', category: 'elective', levels: ['JSS1','JSS2','JSS3'] },
  ],
  SS: [
    { name: 'English Language', category: 'core', levels: ['SS1','SS2','SS3'] },
    { name: 'Mathematics', category: 'core', levels: ['SS1','SS2','SS3'] },
    { name: 'Civic Education', category: 'core', levels: ['SS1','SS2','SS3'] },
    { name: 'Physics', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Chemistry', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Biology', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Further Mathematics', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Economics', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Government', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'History', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Geography', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Commerce', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Financial Accounting', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Literature in English', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Christian Religious Studies', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Islamic Religious Studies', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Agricultural Science', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Technical Drawing', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Computer Science', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'French', category: 'elective', levels: ['SS1','SS2','SS3'] },
    { name: 'Physical Education', category: 'elective', levels: ['SS1','SS2','SS3'] },
  ],
}

const BRITISH_SUBJECTS = [
  { name: 'English', category: 'core', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Mathematics', category: 'core', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Science', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
  { name: 'Physics', category: 'core', levels: ['SS1','SS2','SS3'] },
  { name: 'Chemistry', category: 'core', levels: ['SS1','SS2','SS3'] },
  { name: 'Biology', category: 'core', levels: ['SS1','SS2','SS3'] },
  { name: 'History', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Geography', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Art & Design', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Music', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Physical Education', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Computing', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Modern Foreign Languages', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'PSHE', category: 'elective', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
]

const CAMBRIDGE_SUBJECTS = [
  { name: 'First Language English', category: 'core', levels: ['SS1','SS2','SS3'] },
  { name: 'Mathematics', category: 'core', levels: ['SS1','SS2','SS3'] },
  { name: 'Physics', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Chemistry', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Biology', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Combined Science', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Economics', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Business Studies', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Accounting', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'History', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Geography', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Computer Science', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Literature in English', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'French', category: 'elective', levels: ['SS1','SS2','SS3'] },
  { name: 'Art & Design', category: 'elective', levels: ['SS1','SS2','SS3'] },
]

export async function curriculumRoutes(app: FastifyInstance) {

  // ── CURRICULUM SETTINGS ───────────────────────────────────────────────────

  app.get('/curriculum/settings', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT * FROM curriculum_settings WHERE school_id = ${request.schoolId}::uuid
      ` as any[]
      return reply.send({ settings: rows[0] ?? null })
    })

  app.post('/curriculum/settings', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        curriculumType: z.enum(['nigerian','british','cambridge','montessori','ib','hybrid']),
        secondaryCurriculum: z.enum(['nigerian','british','cambridge','montessori','ib']).optional(),
        academicYear: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        INSERT INTO curriculum_settings (school_id, curriculum_type, secondary_curriculum, academic_year)
        VALUES (${request.schoolId}::uuid, ${d.curriculumType}, ${d.secondaryCurriculum ?? null}, ${d.academicYear ?? null})
        ON CONFLICT (school_id) DO UPDATE SET
          curriculum_type = EXCLUDED.curriculum_type,
          secondary_curriculum = EXCLUDED.secondary_curriculum,
          academic_year = EXCLUDED.academic_year,
          updated_at = now()
      `
      return reply.send({ saved: true })
    })

  // ── LOAD DEFAULT SUBJECTS FOR A CURRICULUM ────────────────────────────────
  app.post('/curriculum/load-defaults', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        curriculumType: z.enum(['nigerian','british','cambridge','montessori','ib','hybrid']),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const { curriculumType } = body.data
      const tdb = tenantDb(request.schoolId)

      let subjects: any[] = []
      if (curriculumType === 'nigerian') {
        subjects = [...NIGERIAN_SUBJECTS.JSS, ...NIGERIAN_SUBJECTS.SS]
      } else if (curriculumType === 'british') {
        subjects = BRITISH_SUBJECTS
      } else if (curriculumType === 'cambridge') {
        subjects = CAMBRIDGE_SUBJECTS
      }

      let loaded = 0
      for (const s of subjects) {
        const name = s.name
        const category = s.category
        const levels = s.levels
        await tdb.query`
          INSERT INTO curriculum_subjects (school_id, name, category, class_levels, curriculum_type)
          VALUES (${request.schoolId}::uuid, ${name}, ${category}, ${levels}, ${curriculumType})
          ON CONFLICT (school_id, name, curriculum_type) DO NOTHING
        `
        loaded++
      }
      return reply.send({ loaded })
    })

  // ── SUBJECTS ──────────────────────────────────────────────────────────────

  app.get('/curriculum/subjects', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { classLevel, curriculumType } = request.query as any
      const tdb = tenantDb(request.schoolId)
      let subjects: any[]
      if (classLevel && curriculumType) {
        subjects = await tdb.query`
          SELECT id, name, code, category, class_levels, curriculum_type, is_active, sort_order
          FROM curriculum_subjects
          WHERE school_id = ${request.schoolId}::uuid
          AND is_active = true
          AND ${classLevel} = ANY(class_levels)
          AND curriculum_type = ${curriculumType}
          ORDER BY sort_order ASC, name ASC
        ` as any[]
      } else if (classLevel) {
        subjects = await tdb.query`
          SELECT id, name, code, category, class_levels, curriculum_type, is_active, sort_order
          FROM curriculum_subjects
          WHERE school_id = ${request.schoolId}::uuid
          AND is_active = true
          AND ${classLevel} = ANY(class_levels)
          ORDER BY sort_order ASC, name ASC
        ` as any[]
      } else {
        subjects = await tdb.query`
          SELECT id, name, code, category, class_levels, curriculum_type, is_active, sort_order
          FROM curriculum_subjects
          WHERE school_id = ${request.schoolId}::uuid
          ORDER BY curriculum_type ASC, sort_order ASC, name ASC
        ` as any[]
      }
      return reply.send({ subjects })
    })

  app.post('/curriculum/subjects', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        name: z.string().min(1),
        code: z.string().optional(),
        classLevels: z.array(z.string()).min(1),
        category: z.enum(['core','elective','vocational','extracurricular']).default('elective'),
        curriculumType: z.enum(['nigerian','british','cambridge','montessori','ib','hybrid']).default('nigerian'),
        sortOrder: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO curriculum_subjects (school_id, name, code, class_levels, category, curriculum_type, sort_order)
        VALUES (${request.schoolId}::uuid, ${d.name}, ${d.code ?? null}, ${d.classLevels}, ${d.category}, ${d.curriculumType}, ${d.sortOrder ?? 0})
        RETURNING id, name, code, category, class_levels, curriculum_type, is_active
      ` as any[]
      return reply.status(201).send({ subject: rows[0] })
    })

  app.patch('/curriculum/subjects/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        name: z.string().optional(),
        code: z.string().optional(),
        classLevels: z.array(z.string()).optional(),
        category: z.enum(['core','elective','vocational','extracurricular']).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)
      if (d.name !== undefined) {
        await tdb.query`UPDATE curriculum_subjects SET name = ${d.name} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.classLevels !== undefined) {
        await tdb.query`UPDATE curriculum_subjects SET class_levels = ${d.classLevels} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.category !== undefined) {
        await tdb.query`UPDATE curriculum_subjects SET category = ${d.category} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.isActive !== undefined) {
        await tdb.query`UPDATE curriculum_subjects SET is_active = ${d.isActive} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      return reply.send({ updated: true })
    })

  app.delete('/curriculum/subjects/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        DELETE FROM curriculum_subjects WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
      return reply.send({ deleted: true })
    })

  // ── SCHEME OF WORK ────────────────────────────────────────────────────────

  app.get('/curriculum/scheme', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { subjectId, termId, classLevel } = request.query as any
      if (!subjectId || !termId || !classLevel) return reply.status(400).send({ error: 'subjectId, termId and classLevel required' })
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT s.id, s.week_number, s.topic, s.sub_topics, s.objectives,
               s.resources, s.assessment_method, s.created_at,
               ld.delivery_status, ld.delivered_date, ld.notes AS delivery_notes,
               u.full_name AS delivered_by
        FROM scheme_of_work s
        LEFT JOIN lesson_delivery ld ON ld.scheme_id = s.id
        LEFT JOIN users u ON u.id = ld.teacher_id
        WHERE s.school_id = ${request.schoolId}::uuid
        AND s.subject_id = ${subjectId}::uuid
        AND s.term_id = ${termId}::uuid
        AND s.class_level = ${classLevel}
        ORDER BY s.week_number ASC
      ` as any[]
      return reply.send({ scheme: rows })
    })

  app.post('/curriculum/scheme', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        subjectId: z.string().uuid(),
        termId: z.string().uuid(),
        classLevel: z.string().min(1),
        classArm: z.string().optional(),
        weekNumber: z.number().int().min(1).max(15),
        topic: z.string().min(1),
        subTopics: z.array(z.string()).optional(),
        objectives: z.array(z.string()).optional(),
        resources: z.string().optional(),
        assessmentMethod: z.string().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO scheme_of_work (
          school_id, subject_id, term_id, class_level, class_arm,
          week_number, topic, sub_topics, objectives, resources,
          assessment_method, created_by
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.subjectId}::uuid, ${d.termId}::uuid,
          ${d.classLevel}, ${d.classArm ?? null}, ${d.weekNumber},
          ${d.topic}, ${d.subTopics ?? []}, ${d.objectives ?? []},
          ${d.resources ?? null}, ${d.assessmentMethod ?? null},
          ${request.user.id}::uuid
        )
        ON CONFLICT (school_id, subject_id, term_id, class_level, week_number) DO UPDATE SET
          topic = EXCLUDED.topic,
          sub_topics = EXCLUDED.sub_topics,
          objectives = EXCLUDED.objectives,
          resources = EXCLUDED.resources,
          assessment_method = EXCLUDED.assessment_method,
          updated_at = now()
        RETURNING id, week_number, topic
      ` as any[]
      return reply.status(201).send({ entry: rows[0] })
    })

  app.delete('/curriculum/scheme/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM scheme_of_work WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // ── LESSON DELIVERY ───────────────────────────────────────────────────────

  app.post('/curriculum/delivery', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        schemeId: z.string().uuid(),
        deliveredDate: z.string(),
        deliveryStatus: z.enum(['delivered','partial','not_delivered','rescheduled']),
        actualTopic: z.string().optional(),
        notes: z.string().optional(),
        attendanceCount: z.number().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        INSERT INTO lesson_delivery (
          school_id, scheme_id, teacher_id, delivered_date,
          delivery_status, actual_topic, notes, attendance_count
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.schemeId}::uuid,
          ${request.user.id}::uuid, ${d.deliveredDate}::date,
          ${d.deliveryStatus}, ${d.actualTopic ?? null},
          ${d.notes ?? null}, ${d.attendanceCount ?? null}
        )
        ON CONFLICT (school_id, scheme_id, teacher_id, delivered_date) DO UPDATE SET
          delivery_status = EXCLUDED.delivery_status,
          actual_topic = EXCLUDED.actual_topic,
          notes = EXCLUDED.notes,
          attendance_count = EXCLUDED.attendance_count
      `
      // Update coverage
      await updateCoverage(request.schoolId, d.schemeId, tdb)
      return reply.send({ saved: true })
    })

  // ── COVERAGE REPORT ───────────────────────────────────────────────────────

  app.get('/curriculum/coverage', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel required' })
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        SELECT
          cs.id AS subject_id, cs.name AS subject_name, cs.category,
          COUNT(s.id) AS total_topics,
          COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'delivered') AS delivered,
          COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'partial') AS partial,
          COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'not_delivered') AS not_delivered,
          ROUND(
            COUNT(ld.id) FILTER (WHERE ld.delivery_status IN ('delivered','partial'))::numeric
            / NULLIF(COUNT(s.id), 0) * 100, 1
          ) AS coverage_pct
        FROM curriculum_subjects cs
        LEFT JOIN scheme_of_work s ON s.subject_id = cs.id
          AND s.term_id = ${termId}::uuid
          AND s.class_level = ${classLevel}
          AND s.school_id = ${request.schoolId}::uuid
        LEFT JOIN lesson_delivery ld ON ld.scheme_id = s.id
        WHERE cs.school_id = ${request.schoolId}::uuid
        AND cs.is_active = true
        AND ${classLevel} = ANY(cs.class_levels)
        GROUP BY cs.id, cs.name, cs.category
        ORDER BY cs.name ASC
      ` as any[]
      return reply.send({ coverage: rows })
    })
}

// Helper — update coverage stats after lesson delivery
async function updateCoverage(schoolId: string, schemeId: string, tdb: any) {
  try {
    const schemeRows = await tdb.query`
      SELECT subject_id, term_id, class_level FROM scheme_of_work
      WHERE id = ${schemeId}::uuid AND school_id = ${schoolId}::uuid
    ` as any[]
    if (!schemeRows[0]) return
    const { subject_id, term_id, class_level } = schemeRows[0]

    const stats = await tdb.query`
      SELECT
        COUNT(s.id) AS total,
        COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'delivered') AS delivered,
        COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'partial') AS partial,
        COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'not_delivered') AS not_delivered
      FROM scheme_of_work s
      LEFT JOIN lesson_delivery ld ON ld.scheme_id = s.id
      WHERE s.subject_id = ${subject_id}::uuid
      AND s.term_id = ${term_id}::uuid
      AND s.class_level = ${class_level}
      AND s.school_id = ${schoolId}::uuid
    ` as any[]

    const s = stats[0]
    const pct = s.total > 0 ? Math.round(((Number(s.delivered) + Number(s.partial)) / Number(s.total)) * 100 * 10) / 10 : 0

    await tdb.query`
      INSERT INTO curriculum_coverage (
        school_id, subject_id, term_id, class_level,
        total_topics, delivered_topics, partial_topics, not_delivered_topics,
        coverage_percentage, last_updated
      )
      VALUES (
        ${schoolId}::uuid, ${subject_id}::uuid, ${term_id}::uuid, ${class_level},
        ${Number(s.total)}, ${Number(s.delivered)}, ${Number(s.partial)},
        ${Number(s.not_delivered)}, ${pct}, now()
      )
      ON CONFLICT (school_id, subject_id, term_id, class_level) DO UPDATE SET
        total_topics = EXCLUDED.total_topics,
        delivered_topics = EXCLUDED.delivered_topics,
        partial_topics = EXCLUDED.partial_topics,
        not_delivered_topics = EXCLUDED.not_delivered_topics,
        coverage_percentage = EXCLUDED.coverage_percentage,
        last_updated = now()
    `
  } catch (err: any) {
    console.error('[CURRICULUM] Coverage update error:', err.message)
  }
}
