import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { requireTier } from '../middleware/tier'

const NIGERIAN_JSS = [
  { name: 'English Language', category: 'core', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Mathematics', category: 'core', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
  { name: 'Basic Science', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
  { name: 'Basic Technology', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
  { name: 'Social Studies', category: 'core', levels: ['JSS1','JSS2','JSS3'] },
  { name: 'Civic Education', category: 'core', levels: ['JSS1','JSS2','JSS3','SS1','SS2','SS3'] },
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
]

const NIGERIAN_SS = [
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
]

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

  // SETTINGS
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
      const ct = body.data.curriculumType
      const sc = body.data.secondaryCurriculum ?? null
      const ay = body.data.academicYear ?? null
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        INSERT INTO curriculum_settings (school_id, curriculum_type, secondary_curriculum, academic_year)
        VALUES (${request.schoolId}::uuid, ${ct}, ${sc}, ${ay})
        ON CONFLICT (school_id) DO UPDATE SET
          curriculum_type = EXCLUDED.curriculum_type,
          secondary_curriculum = EXCLUDED.secondary_curriculum,
          academic_year = EXCLUDED.academic_year,
          updated_at = now()
      `
      return reply.send({ saved: true })
    })

  // LOAD DEFAULTS
  app.post('/curriculum/load-defaults', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        curriculumType: z.enum(['nigerian','british','cambridge','montessori','ib','hybrid']),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const ct = body.data.curriculumType
      const tdb = tenantDb(request.schoolId)
      let subjects: any[] = []
      if (ct === 'nigerian') {
        subjects = [...NIGERIAN_JSS, ...NIGERIAN_SS]
      } else if (ct === 'british') {
        subjects = BRITISH_SUBJECTS
      } else if (ct === 'cambridge') {
        subjects = CAMBRIDGE_SUBJECTS
      }
      let loaded = 0
      for (const s of subjects) {
        const sname = s.name
        const scat = s.category
        const slev = s.levels
        await tdb.query`
          INSERT INTO curriculum_subjects (school_id, name, category, class_levels, curriculum_type)
          VALUES (${request.schoolId}::uuid, ${sname}, ${scat}, ${slev}, ${ct})
          ON CONFLICT (school_id, name, curriculum_type) DO NOTHING
        `
        loaded++
      }
      return reply.send({ loaded })
    })

  // GET SUBJECTS
  app.get('/curriculum/subjects', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { classLevel, curriculumType } = request.query as any
      const tdb = tenantDb(request.schoolId)
      let subjects: any[]
      const cl = classLevel ? String(classLevel) : null
      const cv = curriculumType ? String(curriculumType) : null
      if (cl && cv) {
        subjects = await tdb.query`
          SELECT id, name, code, category, class_levels, curriculum_type, is_active, sort_order
          FROM curriculum_subjects
          WHERE school_id = ${request.schoolId}::uuid
          AND is_active = true
          AND ${cl} = ANY(class_levels)
          AND curriculum_type = ${cv}
          ORDER BY sort_order ASC, name ASC
        ` as any[]
      } else if (cl) {
        subjects = await tdb.query`
          SELECT id, name, code, category, class_levels, curriculum_type, is_active, sort_order
          FROM curriculum_subjects
          WHERE school_id = ${request.schoolId}::uuid
          AND is_active = true
          AND ${cl} = ANY(class_levels)
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

  // ADD SUBJECT
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
      const sname = d.name
      const scode = d.code ?? null
      const slev = d.classLevels
      const scat = d.category
      const sct = d.curriculumType
      const sord = d.sortOrder ?? 0
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO curriculum_subjects (school_id, name, code, class_levels, category, curriculum_type, sort_order)
        VALUES (${request.schoolId}::uuid, ${sname}, ${scode}, ${slev}, ${scat}, ${sct}, ${sord})
        RETURNING id, name, code, category, class_levels, curriculum_type, is_active
      ` as any[]
      return reply.status(201).send({ subject: rows[0] })
    })

  // UPDATE SUBJECT
  app.patch('/curriculum/subjects/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const schema = z.object({
        name: z.string().optional(),
        classLevels: z.array(z.string()).optional(),
        category: z.enum(['core','elective','vocational','extracurricular']).optional(),
        isActive: z.boolean().optional(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
      const d = body.data
      const tdb = tenantDb(request.schoolId)
      if (d.name !== undefined) {
        const val = d.name
        await tdb.query`UPDATE curriculum_subjects SET name = ${val} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.classLevels !== undefined) {
        const val = d.classLevels
        await tdb.query`UPDATE curriculum_subjects SET class_levels = ${val} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.category !== undefined) {
        const val = d.category
        await tdb.query`UPDATE curriculum_subjects SET category = ${val} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      if (d.isActive !== undefined) {
        const val = d.isActive
        await tdb.query`UPDATE curriculum_subjects SET is_active = ${val} WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      }
      return reply.send({ updated: true })
    })

  // DELETE SUBJECT
  app.delete('/curriculum/subjects/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM curriculum_subjects WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // GET SCHEME OF WORK
  app.get('/curriculum/scheme', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { subjectId, termId, classLevel } = request.query as any
      if (!subjectId || !termId || !classLevel) return reply.status(400).send({ error: 'subjectId, termId and classLevel required' })
      const sid = String(subjectId)
      const tid = String(termId)
      const cl = String(classLevel)
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
        AND s.subject_id = ${sid}::uuid
        AND s.term_id = ${tid}::uuid
        AND s.class_level = ${cl}
        ORDER BY s.week_number ASC
      ` as any[]
      return reply.send({ scheme: rows })
    })

  // ADD SCHEME ENTRY
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
      const sid = d.subjectId
      const tid = d.termId
      const cl = d.classLevel
      const ca = d.classArm ?? null
      const wn = d.weekNumber
      const tp = d.topic
      const st = d.subTopics ?? []
      const ob = d.objectives ?? []
      const rs = d.resources ?? null
      const am = d.assessmentMethod ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)
      const rows = await tdb.query`
        INSERT INTO scheme_of_work (
          school_id, subject_id, term_id, class_level, class_arm,
          week_number, topic, sub_topics, objectives, resources,
          assessment_method, created_by
        )
        VALUES (
          ${request.schoolId}::uuid, ${sid}::uuid, ${tid}::uuid,
          ${cl}, ${ca}, ${wn}, ${tp}, ${st}, ${ob}, ${rs}, ${am}, ${uid}::uuid
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

  // DELETE SCHEME ENTRY
  app.delete('/curriculum/scheme/:id', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { id } = request.params as any
      const tdb = tenantDb(request.schoolId)
      await tdb.query`DELETE FROM scheme_of_work WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid`
      return reply.send({ deleted: true })
    })

  // RECORD LESSON DELIVERY
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
      const scid = d.schemeId
      const dd = d.deliveredDate
      const ds = d.deliveryStatus
      const at = d.actualTopic ?? null
      const nt = d.notes ?? null
      const ac = d.attendanceCount ?? null
      const uid = request.user.id
      const tdb = tenantDb(request.schoolId)
      await tdb.query`
        INSERT INTO lesson_delivery (
          school_id, scheme_id, teacher_id, delivered_date,
          delivery_status, actual_topic, notes, attendance_count
        )
        VALUES (
          ${request.schoolId}::uuid, ${scid}::uuid, ${uid}::uuid, ${dd}::date,
          ${ds}, ${at}, ${nt}, ${ac}
        )
        ON CONFLICT (school_id, scheme_id, teacher_id, delivered_date) DO UPDATE SET
          delivery_status = EXCLUDED.delivery_status,
          actual_topic = EXCLUDED.actual_topic,
          notes = EXCLUDED.notes,
          attendance_count = EXCLUDED.attendance_count
      `
      await updateCoverage(request.schoolId, scid, tdb)
      return reply.send({ saved: true })
    })

  // COVERAGE REPORT
  app.get('/curriculum/coverage', { preHandler: [authenticate, requireRole('school_admin', 'teacher')] },
    async (request: any, reply: any) => {
      const { termId, classLevel } = request.query as any
      if (!termId || !classLevel) return reply.status(400).send({ error: 'termId and classLevel required' })
      const tid = String(termId)
      const cl = String(classLevel)
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
          AND s.term_id = ${tid}::uuid
          AND s.class_level = ${cl}
          AND s.school_id = ${request.schoolId}::uuid
        LEFT JOIN lesson_delivery ld ON ld.scheme_id = s.id
        WHERE cs.school_id = ${request.schoolId}::uuid
        AND cs.is_active = true
        AND ${cl} = ANY(cs.class_levels)
        GROUP BY cs.id, cs.name, cs.category
        ORDER BY cs.name ASC
      ` as any[]
      return reply.send({ coverage: rows })
    })
}

async function updateCoverage(schoolId: string, schemeId: string, tdb: any) {
  try {
    const schemeRows = await tdb.query`
      SELECT subject_id, term_id, class_level FROM scheme_of_work
      WHERE id = ${schemeId}::uuid AND school_id = ${schoolId}::uuid
    ` as any[]
    if (!schemeRows[0]) return
    const subjectId = schemeRows[0].subject_id
    const termId = schemeRows[0].term_id
    const classLevel = schemeRows[0].class_level

    const stats = await tdb.query`
      SELECT
        COUNT(s.id) AS total,
        COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'delivered') AS delivered,
        COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'partial') AS partial,
        COUNT(ld.id) FILTER (WHERE ld.delivery_status = 'not_delivered') AS not_delivered
      FROM scheme_of_work s
      LEFT JOIN lesson_delivery ld ON ld.scheme_id = s.id
      WHERE s.subject_id = ${subjectId}::uuid
      AND s.term_id = ${termId}::uuid
      AND s.class_level = ${classLevel}
      AND s.school_id = ${schoolId}::uuid
    ` as any[]

    const s = stats[0]
    const total = Number(s.total)
    const delivered = Number(s.delivered)
    const partial = Number(s.partial)
    const notDelivered = Number(s.not_delivered)
    const pct = total > 0 ? Math.round(((delivered + partial) / total) * 100 * 10) / 10 : 0

    await tdb.query`
      INSERT INTO curriculum_coverage (
        school_id, subject_id, term_id, class_level,
        total_topics, delivered_topics, partial_topics, not_delivered_topics,
        coverage_percentage, last_updated
      )
      VALUES (
        ${schoolId}::uuid, ${subjectId}::uuid, ${termId}::uuid, ${classLevel},
        ${total}, ${delivered}, ${partial}, ${notDelivered}, ${pct}, now()
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