'use client'
// Exam timetable (Standard plan). The School Admin builds the term's paper and
// CBT sittings and publishes them to students and parents; teachers can view
// it and see their invigilation duties.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { useAuthStore } from '@/hooks/useAuth'
import { useClassLevels } from '@/lib/classLevels'
import { CLASS_ARMS } from '@/lib/classArms'
import { call, errorText, S, PageHeader, Banner, Modal, Field, TermPicker, useTerms } from '@/components/finance/ui'
import { ExamTimetableView, PrintStyles, Sitting, fmtDay, fmtTime } from '@/components/examTimetable'

interface Header { id: string; title: string; instructions: string | null; published_at: string | null }
interface Cbt { id: string; title: string; subject: string; class_level: string; class_arms: string[] | null; scheduled_at: string; duration_minutes: number; status: string }

const blank = { examDate: '', startTime: '09:00', endTime: '11:00', classLevel: '', classArm: '', subject: '', paper: '', mode: 'paper' as 'paper' | 'cbt', examId: '', venue: '', invigilatorId: '', notes: '' }

// CBT exams store a timestamp; the timetable uses Nigerian date and time
function lagosParts(iso: string, addMins = 0) {
  const d = new Date(new Date(iso).getTime() + addMins * 60000)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` }
}

export default function ExamTimetablePage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'school_admin'
  const t = useTerms()
  const levels = useClassLevels()
  const [header, setHeader] = useState<Header | null>(null)
  const [entries, setEntries] = useState<Sitting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'info'; text: string } | null>(null)
  const [classFilter, setClassFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [editing, setEditing] = useState<{ id: string | null; form: typeof blank } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [invigilators, setInvigilators] = useState<{ id: string; full_name: string }[]>([])
  const [cbtExams, setCbtExams] = useState<Cbt[]>([])
  const [headerEdit, setHeaderEdit] = useState<{ title: string; instructions: string } | null>(null)
  const [busy, setBusy] = useState('')

  useEffect(() => { checkAuth(router, ['school_admin', 'teacher']) }, [])

  async function load() {
    if (!t.termId) return
    setLoading(true); setError('')
    const r = await call(`/exam-timetable?termId=${t.termId}`)
    if (!r.ok) setError(errorText(r.data, 'Could not load the exam timetable.'))
    else { setHeader(r.data.timetable); setEntries(r.data.entries ?? []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [t.termId])
  useEffect(() => {
    call('/exam-timetable/invigilators').then(r => setInvigilators(r.data.invigilators ?? []))
    if (isAdmin) call('/exams').then(r => setCbtExams((r.data.exams ?? []).filter((x: Cbt) => x.status !== 'cancelled')))
  }, [isAdmin])

  const shown = useMemo(() => entries.filter(e =>
    (!classFilter || e.class_level === classFilter) && (!mineOnly || e.invigilator_id === user?.id)), [entries, classFilter, mineOnly, user?.id])
  const termName = t.terms.find(x => x.id === t.termId)?.name ?? ''
  const published = !!header?.published_at
  const myDuties = entries.filter(e => e.invigilator_id === user?.id).length

  function openNew() {
    setFormError('')
    const last = entries[entries.length - 1]
    setEditing({ id: null, form: { ...blank, examDate: last?.exam_date ?? '', classLevel: classFilter || levels[0] || '' } })
  }
  function openEdit(s: Sitting) {
    setFormError('')
    setEditing({ id: s.id, form: { examDate: s.exam_date, startTime: s.start_time, endTime: s.end_time, classLevel: s.class_level, classArm: s.class_arm,
      subject: s.subject, paper: s.paper ?? '', mode: s.mode, examId: s.exam_id ?? '', venue: s.venue ?? '', invigilatorId: s.invigilator_id ?? '', notes: s.notes ?? '' } })
  }
  function pickCbt(id: string) {
    if (!editing) return
    const x = cbtExams.find(c => c.id === id)
    if (!x) { setEditing({ ...editing, form: { ...editing.form, examId: '' } }); return }
    const s = lagosParts(x.scheduled_at), e = lagosParts(x.scheduled_at, x.duration_minutes)
    setEditing({ ...editing, form: { ...editing.form, examId: x.id, subject: x.subject, classLevel: x.class_level,
      classArm: x.class_arms?.length === 1 ? x.class_arms[0] : editing.form.classArm, examDate: s.date, startTime: s.time, endTime: e.date === s.date ? e.time : '23:59' } })
  }

  async function save() {
    if (!editing) return
    const f = editing.form
    if (!f.examDate || !f.subject.trim() || !f.classLevel) { setFormError('Fill in the date, class and subject.'); return }
    setSaving(true); setFormError('')
    const body = { termId: t.termId, ...f, examId: f.mode === 'cbt' && f.examId ? f.examId : null, invigilatorId: f.invigilatorId || null,
      paper: f.paper || null, venue: f.venue || null, notes: f.notes || null }
    const r = editing.id
      ? await call(`/exam-timetable/entries/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      : await call('/exam-timetable/entries', { method: 'POST', body: JSON.stringify(body) })
    setSaving(false)
    if (!r.ok) { setFormError(errorText(r.data, 'Could not save this sitting.')); return }
    setEditing(null)
    const w: string[] = r.data.warnings ?? []
    setNotice(w.length ? { tone: 'warning', text: `Saved. Note: ${w.join(' ')}` } : { tone: 'success', text: editing.id ? 'Sitting updated.' : 'Sitting added.' })
    load()
  }

  async function remove(s: Sitting) {
    if (!window.confirm(`Remove ${s.subject} for ${s.class_level}${s.class_arm ? ' ' + s.class_arm : ''} on ${fmtDay(s.exam_date)}?`)) return
    const r = await call(`/exam-timetable/entries/${s.id}`, { method: 'DELETE' })
    if (!r.ok) setNotice({ tone: 'warning', text: errorText(r.data) }); else load()
  }

  async function importCbt() {
    setBusy('import')
    const r = await call('/exam-timetable/import-cbt', { method: 'POST', body: JSON.stringify({ termId: t.termId }) })
    setBusy('')
    if (!r.ok) { setNotice({ tone: 'warning', text: errorText(r.data) }); return }
    const { added, moved, clashes } = r.data
    const parts = [added ? `${added} CBT sitting${added === 1 ? '' : 's'} added` : '', moved ? `${moved} moved to the exam’s new time` : ''].filter(Boolean)
    const head = parts.length ? parts.join(', ') + '.' : 'Every scheduled CBT exam in this term is already on the timetable.'
    setNotice({ tone: clashes.length ? 'warning' : 'success', text: clashes.length ? `${head} Not added because of a clash: ${clashes.join(' ')}` : `${head} Exams still in draft aren’t included.` })
    load()
  }

  async function setPublished(on: boolean) {
    if (on && !window.confirm('Publish this timetable? Students and parents will see it straight away, and an announcement goes to everyone.')) return
    if (!on && !window.confirm('Take the timetable down? Students and parents will no longer see it.')) return
    setBusy('publish')
    const r = await call('/exam-timetable/publish', { method: 'POST', body: JSON.stringify({ termId: t.termId, published: on }) })
    setBusy('')
    if (!r.ok) { setNotice({ tone: 'warning', text: errorText(r.data) }); return }
    setNotice({ tone: 'success', text: on ? `Published. Students and parents can see it now${r.data.announced ? ', and an announcement was posted' : ''}.` : 'Taken down. Students and parents can no longer see it.' })
    load()
  }

  async function saveHeader() {
    if (!headerEdit) return
    const r = await call('/exam-timetable', { method: 'PUT', body: JSON.stringify({ termId: t.termId, title: headerEdit.title, instructions: headerEdit.instructions || null }) })
    if (!r.ok) { setNotice({ tone: 'warning', text: errorText(r.data) }); return }
    setHeaderEdit(null); load()
  }

  const f = editing?.form
  const setF = (patch: Partial<typeof blank>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } })
  const cbtForClass = cbtExams.filter(x => !f?.classLevel || x.class_level === f.classLevel)

  return (
    <div style={S.page}>
      <PrintStyles />
      <div className="no-print">
        <PageHeader
          title="Exam Timetable"
          subtitle={isAdmin ? 'Plan every paper and CBT sitting for the term, then publish it to students and parents.' : 'The term’s exam sittings. Rows marked YOU are your invigilation duties.'}
          actions={<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button style={S.btnGhost} onClick={() => window.print()} disabled={!entries.length}>🖨 Print</button>
            {isAdmin && <button style={S.btnGhost} onClick={importCbt} disabled={!t.termId || busy === 'import'}>{busy === 'import' ? 'Copying…' : '⇩ Copy in CBT exams'}</button>}
            {isAdmin && <button style={S.btn} onClick={openNew} disabled={!t.termId}>+ Add sitting</button>}
          </div>}
        />
        <div style={{ ...S.card, display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TermPicker t={t} />
          <div style={{ minWidth: 160 }}>
            <label style={S.label}>Class</label>
            <select style={S.input} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {levels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {!isAdmin && myDuties > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', paddingBottom: '0.5rem' }}>
              <input type="checkbox" checked={mineOnly} onChange={e => setMineOnly(e.target.checked)} /> Only my invigilation ({myDuties})
            </label>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem', paddingBottom: '0.3rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: 12,
              background: published ? '#e8f5ee' : '#fffbeb', color: published ? '#0f4a32' : '#92400e' }}>
              {published ? 'PUBLISHED' : 'DRAFT — not visible to students or parents'}
            </span>
            {isAdmin && (published
              ? <button style={S.btnGhost} onClick={() => setPublished(false)} disabled={busy === 'publish'}>Take down</button>
              : <button style={S.btn} onClick={() => setPublished(true)} disabled={busy === 'publish' || !entries.length}>Publish</button>)}
          </div>
        </div>
        {notice && <Banner tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
      </div>

      {/* Title and instructions, printed at the top */}
      <div style={{ ...S.card }}>
        {headerEdit ? (
          <div className="no-print" style={{ display: 'grid', gap: '0.75rem' }}>
            <Field label="Title"><input style={S.input} value={headerEdit.title} onChange={e => setHeaderEdit({ ...headerEdit, title: e.target.value })} /></Field>
            <Field label="Instructions for students (printed at the top)">
              <textarea style={{ ...S.input, minHeight: 80 }} value={headerEdit.instructions} placeholder="e.g. Arrive 30 minutes early. Bring two HB pencils. Phones are not allowed in the hall."
                onChange={e => setHeaderEdit({ ...headerEdit, instructions: e.target.value })} />
            </Field>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button style={S.btn} onClick={saveHeader} disabled={!headerEdit.title.trim()}>Save</button>
              <button style={S.btnGhost} onClick={() => setHeaderEdit(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1a1a18' }}>{header?.title ?? 'Examination Timetable'}{termName && <span style={{ fontWeight: 500, color: '#6b6b65' }}> · {termName}</span>}{classFilter && <span style={{ fontWeight: 500, color: '#6b6b65' }}> · {classFilter}</span>}</div>
              {header?.instructions
                ? <p style={{ fontSize: '0.86rem', color: '#3a3a36', marginTop: '0.4rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{header.instructions}</p>
                : isAdmin && <p className="no-print" style={{ fontSize: '0.82rem', color: '#a0a09a', marginTop: '0.4rem' }}>No instructions yet. Add the rules students should know before the exams.</p>}
            </div>
            {isAdmin && <button className="no-print" style={{ ...S.btnSmall, alignSelf: 'flex-start' }}
              onClick={() => setHeaderEdit({ title: header?.title ?? 'Examination Timetable', instructions: header?.instructions ?? '' })}>Edit</button>}
          </div>
        )}
      </div>

      {loading ? <p style={{ color: '#6b6b65', padding: '1rem' }}>Loading…</p> : (
        <ExamTimetableView
          entries={shown}
          staff
          highlightInvigilator={isAdmin ? undefined : user?.id}
          actions={isAdmin ? (s) => <>
            <button style={S.btnSmall} onClick={() => openEdit(s)}>Edit</button>{' '}
            <button style={S.btnDanger} onClick={() => remove(s)}>Remove</button>
          </> : undefined}
          empty={isAdmin
            ? <>No sittings for this term yet. Use <strong>+ Add sitting</strong> for paper exams, or <strong>Copy in CBT exams</strong> to bring in the CBT exams you’ve scheduled.</>
            : 'The exam timetable for this term hasn’t been set up yet.'}
        />
      )}

      {editing && f && (
        <Modal title={editing.id ? 'Edit sitting' : 'Add a sitting'} onClose={() => setEditing(null)} width={560}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Field label="Type">
              <select style={S.input} value={f.mode} onChange={e => setF({ mode: e.target.value as any, examId: '' })}>
                <option value="paper">Paper (written)</option>
                <option value="cbt">CBT (on Examify)</option>
              </select>
            </Field>
            {f.mode === 'cbt' ? (
              <Field label="CBT exam" hint="Fills in the subject, date and time">
                <select style={S.input} value={f.examId} onChange={e => pickCbt(e.target.value)}>
                  <option value="">Not linked</option>
                  {cbtForClass.map(x => <option key={x.id} value={x.id}>{x.title} ({x.class_level}{x.status === 'draft' ? ', draft' : ''})</option>)}
                </select>
              </Field>
            ) : <div />}
            <Field label="Class">
              <select style={S.input} value={f.classLevel} onChange={e => setF({ classLevel: e.target.value, examId: '' })}>
                <option value="">Choose…</option>
                {levels.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Arm">
              <select style={S.input} value={f.classArm} onChange={e => setF({ classArm: e.target.value })}>
                <option value="">All arms</option>
                {CLASS_ARMS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Subject"><input style={S.input} value={f.subject} onChange={e => setF({ subject: e.target.value })} placeholder="e.g. Mathematics" /></Field>
            <Field label="Paper (optional)"><input style={S.input} value={f.paper} onChange={e => setF({ paper: e.target.value })} placeholder="e.g. Paper 1 (Objective)" /></Field>
            <Field label="Date"><input type="date" style={S.input} value={f.examDate} onChange={e => setF({ examDate: e.target.value })} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <Field label="Starts"><input type="time" style={S.input} value={f.startTime} onChange={e => setF({ startTime: e.target.value })} /></Field>
              <Field label="Ends"><input type="time" style={S.input} value={f.endTime} onChange={e => setF({ endTime: e.target.value })} /></Field>
            </div>
            <Field label="Venue"><input style={S.input} value={f.venue} onChange={e => setF({ venue: e.target.value })} placeholder={f.mode === 'cbt' ? 'e.g. ICT Lab' : 'e.g. Main Hall'} /></Field>
            <Field label="Invigilator">
              <select style={S.input} value={f.invigilatorId} onChange={e => setF({ invigilatorId: e.target.value })}>
                <option value="">Not assigned</option>
                {invigilators.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Note for students (optional)"><input style={S.input} value={f.notes} onChange={e => setF({ notes: e.target.value })} placeholder="e.g. Bring a mathematical set" /></Field>
            </div>
          </div>
          {f.examDate && f.startTime && f.endTime && (
            <p style={{ fontSize: '0.8rem', color: '#6b6b65', marginTop: '0.75rem' }}>{fmtDay(f.examDate)}, {fmtTime(f.startTime)} – {fmtTime(f.endTime)}</p>
          )}
          {formError && <div style={{ marginTop: '0.75rem' }}><Banner tone="error">{formError}</Banner></div>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
            <button style={S.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
            <button style={S.btn} onClick={save} disabled={saving}>{saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add sitting'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
