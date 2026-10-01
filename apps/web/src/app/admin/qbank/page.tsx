'use client'
// Question Bank (teachers and School Admins). Everyone sees the school's bank and
// can use any question in their exams; teachers edit and remove their own,
// School Admins any. Duplicate makes your own editable copy.
import { apiFetch, checkAuth, getToken, parseJWT } from '@/lib/auth'
import { QUESTION_TYPE_LABELS, showAccepted } from '@/lib/questions'
import { useClassLevels } from '@/lib/classLevels'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL
const PAGE = 50

interface Question {
  id: string; type: string; subject: string; class_level: string; topic: string | null
  question_text: string; options: { key: string; text: string }[] | null; correct_answer: string
  explanation: string | null; marks: number; difficulty: string | null
  created_by: string; created_by_name: string; created_at: string; canEdit: boolean
}

const inp = { padding: '0.55rem 0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: 8, fontSize: '0.85rem', fontFamily: 'inherit', color: '#1a1a18' }
const btn = (primary = false) => ({ padding: '0.55rem 1rem', borderRadius: 8, border: primary ? 'none' : '1.5px solid #e5e5e0', background: primary ? '#1a6b4a' : 'white', color: primary ? 'white' : '#3a3a36', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const })
const small = { padding: '0.3rem 0.6rem', border: '1px solid #e5e5e0', borderRadius: 6, background: 'white', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', color: '#3a3a36' }
const TYPE_COLORS: Record<string, [string, string]> = { mcq: ['#eff6ff', '#1e40af'], true_false: ['#f0fdf4', '#166534'], short_answer: ['#fff7ed', '#9a3412'], fill_blank: ['#ecfeff', '#155e75'], essay: ['#f5f3ff', '#6d28d9'] }

export default function QuestionBankPage() {
  const router = useRouter()
  const levels = useClassLevels()
  const [isTeacher, setIsTeacher] = useState(false)
  useEffect(() => { setIsTeacher(parseJWT(getToken())?.role === 'teacher') }, [])
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [subjects, setSubjects] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')            // search applied after a short pause
  const [subject, setSubject] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [type, setType] = useState('')
  const [mine, setMine] = useState(false)
  const [offset, setOffset] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { checkAuth(router, ['school_admin', 'teacher']) }, [])
  useEffect(() => { const t = setTimeout(() => setQuery(search.trim()), 350); return () => clearTimeout(t) }, [search])
  useEffect(() => { setOffset(0) }, [query, subject, classLevel, type, mine])
  useEffect(() => { load() }, [query, subject, classLevel, type, mine, offset])

  async function load() {
    setLoading(true)
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
    if (query) p.set('q', query); if (subject) p.set('subject', subject); if (classLevel) p.set('classLevel', classLevel)
    if (type) p.set('type', type); if (mine) p.set('mine', '1')
    try {
      const res = await apiFetch(`${API}/questions?${p}`)
      const data = await res.json()
      setQuestions(data.questions ?? []); setTotal(data.total ?? 0); setSubjects(data.subjects ?? [])
    } catch { setNotice({ ok: false, text: 'Could not load the questions.' }) }
    setLoading(false)
  }

  async function duplicate(q: Question) {
    const res = await apiFetch(`${API}/questions/${q.id}/duplicate`, { method: 'POST', body: '{}' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setNotice({ ok: false, text: data.message ?? 'Could not duplicate.' }); return }
    router.push(`/admin/qbank/${data.questionId}/edit`)
  }

  async function remove(q: Question) {
    if (!window.confirm(`Remove this question from the bank?\n\n“${q.question_text.slice(0, 120)}”\n\nExams that already use it keep it.`)) return
    const res = await apiFetch(`${API}/questions/${q.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setNotice({ ok: false, text: data.message ?? 'Could not remove it.' }); return }
    setNotice({ ok: true, text: 'Question removed from the bank.' }); load()
  }

  const filtersOn = !!(query || subject || classLevel || type || mine)

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1100, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18' }}>Question Bank</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>
            {total} question{total === 1 ? '' : 's'}{filtersOn ? ' match' : ' in the school’s bank'}.
            {isTeacher ? ' Use any of them in your exams; you can edit the ones you added.' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={btn()} onClick={() => router.push('/admin/qbank/import')}>⇪ Import from spreadsheet</button>
          <button style={btn(true)} onClick={() => router.push('/admin/qbank/add')}>+ New question</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, padding: '0.75rem', marginBottom: '1rem' }}>
        <input style={{ ...inp, flex: '1 1 220px' }} placeholder="Search questions or topics…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={inp} value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="">All subjects</option>{subjects.map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={inp} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
          <option value="">All classes</option>{levels.map(l => <option key={l}>{l}</option>)}
        </select>
        <select style={inp} value={type} onChange={e => setType(e.target.value)}>
          <option value="">All types</option>{Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', color: '#3a3a36' }}>
          <input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Only mine
        </label>
      </div>

      {notice && (
        <div onClick={() => setNotice(null)} style={{ padding: '0.7rem 1rem', borderRadius: 10, marginBottom: '1rem', fontSize: '0.85rem', cursor: 'pointer',
          background: notice.ok ? '#e8f5ee' : '#fef2f2', color: notice.ok ? '#0f4a32' : '#b91c1c', border: `1px solid ${notice.ok ? '#b7dfc8' : '#fecaca'}` }}>{notice.text}</div>
      )}

      {loading ? <p style={{ color: '#6b6b65', padding: '1rem' }}>Loading…</p> : questions.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, padding: '3rem', textAlign: 'center', color: '#6b6b65' }}>
          {filtersOn ? 'No questions match these filters.' : <>No questions yet. Add one, or import a whole set from a spreadsheet.</>}
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden' }}>
          {questions.map((q, i) => {
            const [bg, fg] = TYPE_COLORS[q.type] ?? ['#f7f7f5', '#3a3a36']
            const expanded = open === q.id
            return (
              <div key={q.id} style={{ borderTop: i ? '1px solid #f0f0ee' : 'none', padding: '0.85rem 1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen(expanded ? null : q.id)}>
                    <p style={{ fontSize: '0.9rem', color: '#1a1a18', lineHeight: 1.45, whiteSpace: expanded ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.question_text}</p>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.35rem', fontSize: '0.72rem', color: '#6b6b65', alignItems: 'center' }}>
                      <span style={{ background: bg, color: fg, fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 10 }}>{QUESTION_TYPE_LABELS[q.type] ?? q.type}</span>
                      <span>{q.subject}</span>·<span>{q.class_level}</span>{q.topic && <>·<span>{q.topic}</span></>}
                      ·<span>{Number(q.marks)} mark{Number(q.marks) === 1 ? '' : 's'}</span>{q.difficulty && <>·<span>{q.difficulty}</span></>}
                      ·<span>by {q.canEdit && isTeacher ? 'you' : q.created_by_name}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    {q.canEdit && <button style={small} onClick={() => router.push(`/admin/qbank/${q.id}/edit`)}>Edit</button>}
                    <button style={small} onClick={() => duplicate(q)} title="Make your own editable copy">Duplicate</button>
                    {q.canEdit && <button style={{ ...small, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => remove(q)}>Remove</button>}
                  </div>
                </div>
                {expanded && (
                  <div style={{ marginTop: '0.6rem', padding: '0.7rem 0.85rem', background: '#f7f7f5', borderRadius: 8, fontSize: '0.84rem', color: '#3a3a36', lineHeight: 1.55 }}>
                    {q.type === 'mcq' && (q.options ?? []).map(o => (
                      <div key={o.key} style={{ fontWeight: o.key === q.correct_answer ? 700 : 400, color: o.key === q.correct_answer ? '#0f4a32' : undefined }}>
                        {o.key}. {o.text}{o.key === q.correct_answer ? '  ✓' : ''}
                      </div>
                    ))}
                    {q.type === 'true_false' && <div>Answer: <strong>{q.correct_answer}</strong></div>}
                    {(q.type === 'short_answer' || q.type === 'fill_blank') && <div>Accepted: <strong>{showAccepted(q.correct_answer)}</strong></div>}
                    {q.type === 'essay' && <div>{q.explanation ? <>Marking guide: {q.explanation}</> : 'Marked by the teacher (no marking guide).'}</div>}
                    {q.type !== 'essay' && q.explanation && <div style={{ marginTop: '0.35rem', color: '#6b6b65' }}>Explanation: {q.explanation}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {total > PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', fontSize: '0.85rem', color: '#6b6b65' }}>
          <button style={small} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>← Newer</button>
          <span>{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
          <button style={small} disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Older →</button>
        </div>
      )}
    </div>
  )
}
