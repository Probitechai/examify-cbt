import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { gateRoutes } from '../middleware/tier'
import { asSections, levelsFor } from '../lib/classLevels'

// ─────────────────────────────────────────────────────────────────────────────
// Exam timetable (Standard plan)
// One timetable per term holding every sitting, paper or CBT, with venue and
// invigilator. The School Admin builds it; teachers and the Proprietor can
// view it while it's a draft; once published, students see their class's
// sittings and parents see their children's.
// Times are school-local (Nigeria). CBT exams store a timestamp, so they are
// read in Africa/Lagos when copied in.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = 'Africa/Lagos'
const uuid = z.string().uuid()
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 09:00')

const entrySchema = z.object({
  termId: uuid,
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  startTime: hhmm,
  endTime: hhmm,
  classLevel: z.string().trim().min(1),
  classArm: z.string().trim().max(40).optional().default(''),
  subject: z.string().trim().min(1, 'Enter the subject').max(120),
  paper: z.string().trim().max(120).optional().nullable(),
  mode: z.enum(['paper', 'cbt']),
  examId: uuid.optional().nullable(),
  venue: z.string().trim().max(120).optional().nullable(),
  invigilatorId: uuid.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
})

export async function examTimetableRoutes(app: FastifyInstance) {
  gateRoutes(app, 'examTimetable')

  const STAFF_VIEW = [authenticate, requireRole('school_admin', 'teacher', 'proprietor')]
  const ADMIN = [authenticate, requireRole('school_admin')]

  async function termFor(tdb: any, schoolId: string, termId?: string) {
    const rows = termId
      ? await tdb.query`SELECT id, name, start_date, end_date FROM terms WHERE id = ${termId}::uuid AND school_id = ${schoolId}::uuid` as any[]
      : await tdb.query`SELECT id, name, start_date, end_date FROM terms WHERE school_id = ${schoolId}::uuid AND is_active = true ORDER BY created_at DESC LIMIT 1` as any[]
    return rows[0] ?? null
  }

  async function header(tdb: any, schoolId: string, termId: string) {
    const rows = await tdb.query`
      SELECT id, term_id, title, instructions, published_at FROM exam_timetables
      WHERE school_id = ${schoolId}::uuid AND term_id = ${termId}::uuid
    ` as any[]
    return rows[0] ?? null
  }

  async function ensureHeader(tdb: any, schoolId: string, termId: string) {
    const rows = await tdb.query`
      INSERT INTO exam_timetables (school_id, term_id) VALUES (${schoolId}::uuid, ${termId}::uuid)
      ON CONFLICT (school_id, term_id) DO UPDATE SET updated_at = exam_timetables.updated_at
      RETURNING id, published_at
    ` as any[]
    return rows[0]
  }

  // Every sitting in a timetable, with the invigilator's name and, for CBT
  // sittings, whether the linked CBT exam has since moved
  async function entriesOf(tdb: any, timetableId: string, filter?: { classLevel?: string; classArm?: string }) {
    const lvl = filter?.classLevel ?? null
    const arm = filter?.classArm ?? null
    return await tdb.query`
      SELECT e.id, to_char(e.exam_date, 'YYYY-MM-DD') AS exam_date,
             to_char(e.start_time, 'HH24:MI') AS start_time, to_char(e.end_time, 'HH24:MI') AS end_time,
             e.class_level, e.class_arm, e.subject, e.paper, e.mode, e.exam_id, e.venue, e.notes,
             e.invigilator_id, inv.full_name AS invigilator_name,
             x.title AS exam_title, x.status AS exam_status,
             CASE WHEN x.id IS NULL THEN false ELSE
               (to_char(x.scheduled_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') <> to_char(e.exam_date, 'YYYY-MM-DD')
                OR to_char(x.scheduled_at AT TIME ZONE ${TZ}, 'HH24:MI') <> to_char(e.start_time, 'HH24:MI'))
             END AS out_of_sync
      FROM exam_timetable_entries e
      LEFT JOIN users inv ON inv.id = e.invigilator_id
      LEFT JOIN exams x ON x.id = e.exam_id
      WHERE e.timetable_id = ${timetableId}::uuid
        AND (${lvl}::text IS NULL OR e.class_level = ${lvl})
        AND (${arm}::text IS NULL OR e.class_arm = '' OR e.class_arm = ${arm})
      ORDER BY e.exam_date, e.start_time, e.class_level, e.class_arm, e.subject
    ` as any[]
  }

  // Validates a sitting and finds clashes. Returns { error } or { warnings }.
  async function check(tdb: any, schoolId: string, d: z.infer<typeof entrySchema>, timetableId: string | null, selfId: string | null, term: any) {
    const [s] = await tdb.query`SELECT sections FROM schools WHERE id = ${schoolId}::uuid` as any[]
    const levels = levelsFor(asSections(s?.sections))
    if (!levels.includes(d.classLevel)) {
      return { error: { status: 400, body: { error: 'UNKNOWN_CLASS', message: `${d.classLevel} isn’t one of this school’s classes.` } } }
    }
    if (d.endTime <= d.startTime) {
      return { error: { status: 400, body: { error: 'BAD_TIME', message: 'The end time must be after the start time.' } } }
    }
    const day = d.examDate
    const start = term.start_date ? String(term.start_date instanceof Date ? term.start_date.toISOString() : term.start_date).slice(0, 10) : null
    const end = term.end_date ? String(term.end_date instanceof Date ? term.end_date.toISOString() : term.end_date).slice(0, 10) : null
    if ((start && day < start) || (end && day > end)) {
      return { error: { status: 400, body: { error: 'OUTSIDE_TERM', message: `${term.name} runs from ${start ?? '…'} to ${end ?? '…'}. Pick a date in the term.` } } }
    }
    if (d.mode === 'paper' && d.examId) {
      return { error: { status: 400, body: { error: 'BAD_LINK', message: 'Only a CBT sitting can be linked to a CBT exam.' } } }
    }
    if (d.examId) {
      const [x] = await tdb.query`SELECT class_level FROM exams WHERE id = ${d.examId}::uuid AND school_id = ${schoolId}::uuid` as any[]
      if (!x) return { error: { status: 400, body: { error: 'EXAM_NOT_FOUND', message: 'That CBT exam wasn’t found.' } } }
      if (x.class_level !== d.classLevel) {
        return { error: { status: 400, body: { error: 'BAD_LINK', message: `That CBT exam is for ${x.class_level}, not ${d.classLevel}.` } } }
      }
    }
    if (d.invigilatorId) {
      const [u] = await tdb.query`
        SELECT 1 FROM users WHERE id = ${d.invigilatorId}::uuid AND school_id = ${schoolId}::uuid
          AND role IN ('teacher', 'school_admin') AND is_active = true
      ` as any[]
      if (!u) return { error: { status: 400, body: { error: 'BAD_INVIGILATOR', message: 'The invigilator must be an active teacher or admin of this school.' } } }
    }
    if (!timetableId) return { warnings: [] as string[] }

    const self = selfId ?? '00000000-0000-0000-0000-000000000000'
    const arm = d.classArm ?? ''
    // Same class (and an overlapping arm) can't sit two papers at once
    const classClash = await tdb.query`
      SELECT subject, class_arm, to_char(start_time, 'HH24:MI') AS st, to_char(end_time, 'HH24:MI') AS et
      FROM exam_timetable_entries
      WHERE timetable_id = ${timetableId}::uuid AND id <> ${self}::uuid
        AND exam_date = ${day}::date AND start_time < ${d.endTime}::time AND end_time > ${d.startTime}::time
        AND class_level = ${d.classLevel} AND (class_arm = '' OR ${arm} = '' OR class_arm = ${arm})
      LIMIT 1
    ` as any[]
    if (classClash[0]) {
      const c = classClash[0]
      const who = `${d.classLevel}${c.class_arm ? ' ' + c.class_arm : ''}`
      return { error: { status: 409, body: { error: 'CLASS_CLASH', message: `${who} already sits ${c.subject} from ${c.st} to ${c.et} that day.` } } }
    }
    // One invigilator can't be in two rooms at once (sharing a hall is fine)
    if (d.invigilatorId) {
      const inv = await tdb.query`
        SELECT e.subject, e.class_level, e.venue, to_char(e.start_time, 'HH24:MI') AS st, u.full_name
        FROM exam_timetable_entries e JOIN users u ON u.id = e.invigilator_id
        WHERE e.timetable_id = ${timetableId}::uuid AND e.id <> ${self}::uuid
          AND e.invigilator_id = ${d.invigilatorId}::uuid
          AND e.exam_date = ${day}::date AND e.start_time < ${d.endTime}::time AND e.end_time > ${d.startTime}::time
          AND lower(trim(coalesce(e.venue, ''))) <> lower(trim(${d.venue ?? ''}))
        LIMIT 1
      ` as any[]
      if (inv[0]) {
        const c = inv[0]
        return { error: { status: 409, body: { error: 'INVIGILATOR_CLASH', message: `${c.full_name} is invigilating ${c.class_level} ${c.subject} in ${c.venue || 'another room'} at ${c.st}.` } } }
      }
    }
    // Sharing a venue is common (an exam hall), so it's only a warning
    const warnings: string[] = []
    if (d.venue) {
      const v = await tdb.query`
        SELECT class_level, class_arm, subject FROM exam_timetable_entries
        WHERE timetable_id = ${timetableId}::uuid AND id <> ${self}::uuid
          AND exam_date = ${day}::date AND start_time < ${d.endTime}::time AND end_time > ${d.startTime}::time
          AND lower(trim(coalesce(venue, ''))) = lower(trim(${d.venue}))
      ` as any[]
      if (v.length) warnings.push(`${d.venue} is also used then by ${v.map((x: any) => `${x.class_level}${x.class_arm ? ' ' + x.class_arm : ''} ${x.subject}`).join(', ')}.`)
    }
    return { warnings }
  }

  // ── The term's timetable (staff) ──────────────────────────────────────────
  app.get('/exam-timetable', { preHandler: STAFF_VIEW }, async (request: any, reply: any) => {
    const { termId } = request.query as any
    if (termId && !uuid.safeParse(termId).success) return reply.status(400).send({ error: 'BAD_TERM' })
    const tdb = tenantDb(request.schoolId)
    const term = await termFor(tdb, request.schoolId, termId)
    if (!term) return reply.send({ term: null, timetable: null, entries: [] })
    const tt = await header(tdb, request.schoolId, term.id)
    const entries = tt ? await entriesOf(tdb, tt.id) : []
    return reply.send({ term: { id: term.id, name: term.name }, timetable: tt, entries })
  })

  // ── Title and instructions ────────────────────────────────────────────────
  app.put('/exam-timetable', { preHandler: ADMIN }, async (request: any, reply: any) => {
    const b = z.object({
      termId: uuid,
      title: z.string().trim().min(1).max(150),
      instructions: z.string().trim().max(2000).optional().nullable(),
    }).safeParse(request.body)
    if (!b.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', issues: b.error.flatten() })
    const tdb = tenantDb(request.schoolId)
    if (!(await termFor(tdb, request.schoolId, b.data.termId))) return reply.status(404).send({ error: 'TERM_NOT_FOUND' })
    const rows = await tdb.query`
      INSERT INTO exam_timetables (school_id, term_id, title, instructions)
      VALUES (${request.schoolId}::uuid, ${b.data.termId}::uuid, ${b.data.title}, ${b.data.instructions ?? null})
      ON CONFLICT (school_id, term_id) DO UPDATE SET title = EXCLUDED.title, instructions = EXCLUDED.instructions, updated_at = now()
      RETURNING id, term_id, title, instructions, published_at
    ` as any[]
    return reply.send({ timetable: rows[0] })
  })

  // ── Add a sitting ─────────────────────────────────────────────────────────
  app.post('/exam-timetable/entries', { preHandler: ADMIN }, async (request: any, reply: any) => {
    const b = entrySchema.safeParse(request.body)
    if (!b.success) {
      const f = b.error.flatten()
      const first = Object.values(f.fieldErrors).flat()[0] ?? f.formErrors[0]
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: first ?? 'Check the details.', issues: f })
    }
    const d = b.data
    const tdb = tenantDb(request.schoolId)
    const term = await termFor(tdb, request.schoolId, d.termId)
    if (!term) return reply.status(404).send({ error: 'TERM_NOT_FOUND' })
    const tt = await ensureHeader(tdb, request.schoolId, term.id)
    const res = await check(tdb, request.schoolId, d, tt.id, null, term)
    if ('error' in res && res.error) return reply.status(res.error.status).send(res.error.body)
    try {
      const rows = await tdb.query`
        INSERT INTO exam_timetable_entries (school_id, timetable_id, exam_date, start_time, end_time, class_level, class_arm,
          subject, paper, mode, exam_id, venue, invigilator_id, notes, created_by)
        VALUES (${request.schoolId}::uuid, ${tt.id}::uuid, ${d.examDate}::date, ${d.startTime}::time, ${d.endTime}::time,
          ${d.classLevel}, ${d.classArm ?? ''}, ${d.subject}, ${d.paper || null}, ${d.mode}, ${d.examId ?? null},
          ${d.venue || null}, ${d.invigilatorId ?? null}, ${d.notes || null}, ${request.user.id}::uuid)
        RETURNING id
      ` as any[]
      return reply.status(201).send({ id: rows[0].id, warnings: res.warnings })
    } catch (e: any) {
      if (e.code === '23505') return reply.status(409).send({ error: 'ALREADY_LISTED', message: 'That CBT exam is already on the timetable for this arm.' })
      throw e
    }
  })

  // ── Change a sitting ──────────────────────────────────────────────────────
  app.patch('/exam-timetable/entries/:id', { preHandler: ADMIN }, async (request: any, reply: any) => {
    const { id } = request.params as any
    if (!uuid.safeParse(id).success) return reply.status(404).send({ error: 'NOT_FOUND' })
    const b = entrySchema.safeParse(request.body)
    if (!b.success) {
      const f = b.error.flatten()
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: Object.values(f.fieldErrors).flat()[0] ?? 'Check the details.', issues: f })
    }
    const d = b.data
    const tdb = tenantDb(request.schoolId)
    const [row] = await tdb.query`
      SELECT e.timetable_id, t.term_id FROM exam_timetable_entries e JOIN exam_timetables t ON t.id = e.timetable_id
      WHERE e.id = ${id}::uuid AND e.school_id = ${request.schoolId}::uuid
    ` as any[]
    if (!row) return reply.status(404).send({ error: 'NOT_FOUND' })
    const term = await termFor(tdb, request.schoolId, row.term_id)
    const res = await check(tdb, request.schoolId, d, row.timetable_id, id, term)
    if ('error' in res && res.error) return reply.status(res.error.status).send(res.error.body)
    try {
      await tdb.query`
        UPDATE exam_timetable_entries SET exam_date = ${d.examDate}::date, start_time = ${d.startTime}::time, end_time = ${d.endTime}::time,
          class_level = ${d.classLevel}, class_arm = ${d.classArm ?? ''}, subject = ${d.subject}, paper = ${d.paper || null},
          mode = ${d.mode}, exam_id = ${d.examId ?? null}, venue = ${d.venue || null}, invigilator_id = ${d.invigilatorId ?? null},
          notes = ${d.notes || null}, updated_at = now()
        WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid
      `
    } catch (e: any) {
      if (e.code === '23505') return reply.status(409).send({ error: 'ALREADY_LISTED', message: 'That CBT exam is already on the timetable for this arm.' })
      throw e
    }
    return reply.send({ updated: true, warnings: res.warnings })
  })

  app.delete('/exam-timetable/entries/:id', { preHandler: ADMIN }, async (request: any, reply: any) => {
    const { id } = request.params as any
    if (!uuid.safeParse(id).success) return reply.status(404).send({ error: 'NOT_FOUND' })
    const tdb = tenantDb(request.schoolId)
    const rows = await tdb.query`DELETE FROM exam_timetable_entries WHERE id = ${id}::uuid AND school_id = ${request.schoolId}::uuid RETURNING id` as any[]
    if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND' })
    return reply.send({ deleted: true })
  })

  // ── Copy in (or refresh) the term's scheduled CBT exams ───────────────────
  // Adds a CBT sitting for each scheduled or open CBT exam in the term (one per
  // arm the exam is set for) and moves already-listed ones to the exam's
  // current date and time. Draft and cancelled exams are left out.
  app.post('/exam-timetable/import-cbt', { preHandler: ADMIN }, async (request: any, reply: any) => {
    const b = z.object({ termId: uuid }).safeParse(request.body)
    if (!b.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
    const tdb = tenantDb(request.schoolId)
    const term = await termFor(tdb, request.schoolId, b.data.termId)
    if (!term) return reply.status(404).send({ error: 'TERM_NOT_FOUND' })
    const tt = await ensureHeader(tdb, request.schoolId, term.id)
    const start = term.start_date ?? null, end = term.end_date ?? null
    const exams = await tdb.query`
      SELECT id, subject, class_level, class_arms, duration_minutes, title,
             to_char(scheduled_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS d,
             to_char(scheduled_at AT TIME ZONE ${TZ}, 'HH24:MI') AS st,
             to_char(LEAST((scheduled_at AT TIME ZONE ${TZ}) + make_interval(mins => duration_minutes),
                           date_trunc('day', scheduled_at AT TIME ZONE ${TZ}) + interval '23 hours 59 minutes'), 'HH24:MI') AS et
      FROM exams
      WHERE school_id = ${request.schoolId}::uuid AND status IN ('scheduled', 'active')
        AND (${start}::date IS NULL OR (scheduled_at AT TIME ZONE ${TZ})::date >= ${start}::date)
        AND (${end}::date IS NULL OR (scheduled_at AT TIME ZONE ${TZ})::date <= ${end}::date)
      ORDER BY scheduled_at
    ` as any[]
    let added = 0, moved = 0
    const clashes: string[] = []
    for (const x of exams) {
      const arms: string[] = Array.isArray(x.class_arms) && x.class_arms.length ? x.class_arms : ['']
      for (const arm of arms) {
        const [existing] = await tdb.query`
          SELECT id, to_char(exam_date, 'YYYY-MM-DD') AS d, to_char(start_time, 'HH24:MI') AS st, to_char(end_time, 'HH24:MI') AS et
          FROM exam_timetable_entries WHERE exam_id = ${x.id}::uuid AND class_arm = ${arm}
        ` as any[]
        if (existing && existing.d === x.d && existing.st === x.st && existing.et === x.et) continue
        // Clash check as for a hand-entered sitting; a clashing exam is reported, not added
        const d = { termId: term.id, examDate: x.d, startTime: x.st, endTime: x.et, classLevel: x.class_level, classArm: arm,
          subject: x.subject, mode: 'cbt' as const, examId: x.id }
        const res = await check(tdb, request.schoolId, d as any, tt.id, existing?.id ?? null, term)
        if ('error' in res && res.error) { clashes.push(`${x.title} (${x.class_level}${arm ? ' ' + arm : ''}): ${res.error.body.message}`); continue }
        if (existing) {
          await tdb.query`UPDATE exam_timetable_entries SET exam_date = ${x.d}::date, start_time = ${x.st}::time, end_time = ${x.et}::time, updated_at = now() WHERE id = ${existing.id}::uuid`
          moved++
        } else {
          await tdb.query`
            INSERT INTO exam_timetable_entries (school_id, timetable_id, exam_date, start_time, end_time, class_level, class_arm, subject, mode, exam_id, created_by)
            VALUES (${request.schoolId}::uuid, ${tt.id}::uuid, ${x.d}::date, ${x.st}::time, ${x.et}::time, ${x.class_level}, ${arm}, ${x.subject}, 'cbt', ${x.id}::uuid, ${request.user.id}::uuid)
          `
          added++
        }
      }
    }
    return reply.send({ added, moved, clashes })
  })

  // ── Publish to students and parents (or take it down) ─────────────────────
  app.post('/exam-timetable/publish', { preHandler: ADMIN }, async (request: any, reply: any) => {
    const b = z.object({ termId: uuid, published: z.boolean(), announce: z.boolean().optional().default(true) }).safeParse(request.body)
    if (!b.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })
    const tdb = tenantDb(request.schoolId)
    const term = await termFor(tdb, request.schoolId, b.data.termId)
    if (!term) return reply.status(404).send({ error: 'TERM_NOT_FOUND' })
    const tt = await header(tdb, request.schoolId, term.id)
    if (!tt) return reply.status(400).send({ error: 'EMPTY', message: 'Add at least one sitting before publishing.' })
    if (b.data.published) {
      const [{ n }] = await tdb.query`SELECT COUNT(*)::int AS n FROM exam_timetable_entries WHERE timetable_id = ${tt.id}::uuid` as any[]
      if (!n) return reply.status(400).send({ error: 'EMPTY', message: 'Add at least one sitting before publishing.' })
    }
    const rows = await tdb.query`
      UPDATE exam_timetables
      SET published_at = ${b.data.published ? new Date() : null}, published_by = ${b.data.published ? request.user.id : null}, updated_at = now()
      WHERE id = ${tt.id}::uuid RETURNING id, title, published_at
    ` as any[]
    let announced = false
    if (b.data.published && b.data.announce && !tt.published_at) {
      // Best effort: tell students and parents in their portals
      try {
        await tdb.query`
          INSERT INTO announcements (school_id, title, body, audience, posted_by)
          VALUES (${request.schoolId}::uuid, ${`${rows[0].title}: ${term.name}`},
                  ${`The exam timetable for ${term.name} is out. Students can see it on their dashboard, and parents in the Exams tab for each child.`},
                  'all', ${request.user.id}::uuid)
        `
        announced = true
      } catch (e: any) { request.log?.warn?.({ err: e.message }, 'exam timetable announcement failed') }
    }
    return reply.send({ timetable: rows[0], announced })
  })

  // ── Published timetable for a student, or a parent's children ─────────────
  app.get('/exam-timetable/mine', { preHandler: [authenticate, requireRole('student', 'parent')] }, async (request: any, reply: any) => {
    const { termId } = request.query as any
    if (termId && !uuid.safeParse(termId).success) return reply.status(400).send({ error: 'BAD_TERM' })
    const tdb = tenantDb(request.schoolId)
    const term = await termFor(tdb, request.schoolId, termId)
    const tt = term ? await header(tdb, request.schoolId, term.id) : null
    if (!term || !tt || !tt.published_at) return reply.send({ term: term ? { id: term.id, name: term.name } : null, timetable: null, students: [] })

    const kids = request.user.role === 'student'
      ? await tdb.query`SELECT id, full_name, class_level, class_arm FROM users WHERE id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid` as any[]
      : await tdb.query`
          SELECT u.id, u.full_name, u.class_level, u.class_arm FROM parent_student_links l
          JOIN users u ON u.id = l.student_id
          WHERE l.parent_id = ${request.user.id}::uuid AND l.school_id = ${request.schoolId}::uuid AND u.is_active = true
          ORDER BY u.full_name
        ` as any[]
    const students = []
    for (const k of kids) {
      const entries = k.class_level
        ? (await entriesOf(tdb, tt.id, { classLevel: k.class_level, classArm: k.class_arm ?? '' }))
            .map(({ invigilator_id, out_of_sync, exam_status, ...rest }: any) => rest)
        : []
      students.push({ id: k.id, name: k.full_name, classLevel: k.class_level, classArm: k.class_arm, entries })
    }
    return reply.send({
      term: { id: term.id, name: term.name },
      timetable: { title: tt.title, instructions: tt.instructions, published_at: tt.published_at },
      students,
    })
  })

  // ── Invigilators to choose from (staff) ───────────────────────────────────
  app.get('/exam-timetable/invigilators', { preHandler: STAFF_VIEW }, async (request: any, reply: any) => {
    const tdb = tenantDb(request.schoolId)
    const rows = await tdb.query`
      SELECT id, full_name, role FROM users
      WHERE school_id = ${request.schoolId}::uuid AND role IN ('teacher', 'school_admin') AND is_active = true
      ORDER BY full_name
    ` as any[]
    return reply.send({ invigilators: rows })
  })
}
