'use client'
import { useState, useEffect } from 'react'

interface Term { id: string; name: string; term_number: number; is_active: boolean }
interface Session { id: string; name: string; is_active: boolean }
interface StudentEntry {
  id: string
  full_name: string
  admission_no: string
  class_arm: string
  result_id: string | null
  ca_score: number | null
  exam_score: number | null
  total_score: number | null
  grade: string | null
  remark: string | null
  teacher_comment: string | null
  approved_at: string | null
}

const SUBJECTS = ['Agricultural Science','Biology','Chemistry','Christian Religious Studies','Civic Education','Commerce','Computer Science','Economics','English Language','Financial Accounting','French','Further Mathematics','Geography','Government','History','Home Economics','Islamic Religious Studies','Literature in English','Mathematics','Music','Physical Education','Physics','Technical Drawing']
const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']
const CLASS_ARMS = ['A','B','C','D','E','Science','Arts','Commercial','Social Science']

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}
function getSubdomain() {
  try {
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? 'greensprings'
  } catch {}
  return 'greensprings'
}
function hdrs() {
  return { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}
const API = process.env.NEXT_PUBLIC_API_URL

export default function ResultEntryPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedSession, setSelectedSession] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [subject, setSubject] = useState('English Language')
  const [students, setStudents] = useState<StudentEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [localScores, setLocalScores] = useState<Record<string, { ca: string; exam: string; comment: string }>>({})

  useEffect(() => { loadSessions() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])

  async function loadSessions() {
    const res = await fetch(`${API}/sessions`, { headers: hdrs() })
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: Session) => s.is_active)
    if (active) setSelectedSession(active.id)
  }

  async function loadTerms(sessionId: string) {
    const res = await fetch(`${API}/sessions/${sessionId}/terms`, { headers: hdrs() })
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: Term) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadStudents() {
    if (!selectedTerm || !classLevel || !subject) {
      setError('Please select a term, class level and subject')
      return
    }
    setLoading(true); setError(''); setStudents([]); setLocalScores({})
    try {
      const params = new URLSearchParams({ termId: selectedTerm, classLevel, subject })
      if (classArm) params.append('classArm', classArm)
      const res = await fetch(`${API}/results/entry?${params}`, { headers: hdrs() })
      const data = await res.json()
      const list = data.students ?? []
      setStudents(list)
      const scores: Record<string, { ca: string; exam: string; comment: string }> = {}
      for (const s of list) {
        scores[s.id] = {
          ca: s.ca_score != null ? String(s.ca_score) : '',
          exam: s.exam_score != null ? String(s.exam_score) : '',
          comment: s.teacher_comment ?? '',
        }
      }
      setLocalScores(scores)
    } catch (e: any) { setError('Failed to load students') } finally { setLoading(false) }
  }

  function setScore(studentId: string, field: 'ca' | 'exam' | 'comment', value: string) {
    setLocalScores(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }))
  }

  function getTotal(studentId: string): number {
    const s = localScores[studentId]
    if (!s) return 0
    return (parseFloat(s.ca) || 0) + (parseFloat(s.exam) || 0)
  }

  async function handleSaveAll() {
    if (!selectedTerm || students.length === 0) return
    setSaving(true); setError('')
    try {
      const results = students.map(s => ({
        studentId: s.id,
        caScore: localScores[s.id]?.ca !== '' ? parseFloat(localScores[s.id]?.ca) || null : null,
        examScore: localScores[s.id]?.exam !== '' ? parseFloat(localScores[s.id]?.exam) || null : null,
        teacherComment: localScores[s.id]?.comment || undefined,
      }))
      const res = await fetch(`${API}/results/bulk`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ termId: selectedTerm, subject, results })
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      loadStudents()
    } catch (e: any) { setError('Failed to save results') } finally { setSaving(false) }
  }

  const inp = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const, width: '100%' }
  const sel = { ...inp, cursor: 'pointer' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Result Entry</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Enter CA and exam scores for each student. Grades are computed automatically.</p>
      </div>

      {/* Filter panel */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Session</label>
            <select style={sel} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              <option value="">Select session…</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (Active)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select term…</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Class</label>
            <select style={sel} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Arm</label>
            <select style={sel} value={classArm} onChange={e => setClassArm(e.target.value)}>
              <option value="">All arms</option>
              {CLASS_ARMS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Subject</label>
            <select style={sel} value={subject} onChange={e => setSubject(e.target.value)}>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <button onClick={loadStudents} disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
              {loading ? 'Loading…' : 'Load students'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {saved && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>
          ✅ Results saved successfully!
        </div>
      )}

      {students.length > 0 && (
        <>
          {/* Header info */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>
                {subject} — {classLevel}{classArm ? ` ${classArm}` : ''}
              </p>
              <p style={{ fontSize: '0.8rem', color: '#6b6b65', marginTop: '0.2rem' }}>
                {students.length} student{students.length !== 1 ? 's' : ''} · {terms.find(t => t.id === selectedTerm)?.name}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>CA + Exam = Total → Grade</p>
              <button onClick={handleSaveAll} disabled={saving}
                style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : '💾 Save all results'}
              </button>
            </div>
          </div>

          {/* Score entry table */}
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 80px 80px 60px 50px 120px 1fr', gap: '0.5rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
              <span>#</span>
              <span>Student name</span>
              <span>Adm. No.</span>
              <span>CA (40)</span>
              <span>Exam (60)</span>
              <span>Total</span>
              <span>Grade</span>
              <span>Remark</span>
              <span>Teacher comment</span>
            </div>
            {students.map((s, i) => {
              const total = getTotal(s.id)
              const isApproved = !!s.approved_at
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 80px 80px 60px 50px 120px 1fr', gap: '0.5rem', padding: '0.625rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', background: isApproved ? '#f0faf4' : 'white' }}>
                  <span style={{ fontSize: '0.78rem', color: '#a0a09a', fontWeight: 600 }}>{i + 1}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>
                    {s.full_name}
                    {isApproved && <span style={{ fontSize: '0.65rem', marginLeft: '0.375rem', color: '#0f4a32', fontWeight: 700 }}>✓ Approved</span>}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#6b6b65' }}>{s.admission_no ?? '—'}</span>
                  <input
                    style={{ ...inp, textAlign: 'center' as const, background: isApproved ? '#f0faf4' : '#f7f7f5' }}
                    type="number" min={0} max={40} step={0.5}
                    value={localScores[s.id]?.ca ?? ''}
                    onChange={e => setScore(s.id, 'ca', e.target.value)}
                    disabled={isApproved}
                    placeholder="0"
                  />
                  <input
                    style={{ ...inp, textAlign: 'center' as const, background: isApproved ? '#f0faf4' : '#f7f7f5' }}
                    type="number" min={0} max={60} step={0.5}
                    value={localScores[s.id]?.exam ?? ''}
                    onChange={e => setScore(s.id, 'exam', e.target.value)}
                    disabled={isApproved}
                    placeholder="0"
                  />
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: total >= 75 ? '#1a6b4a' : total >= 45 ? '#d97706' : '#dc2626', textAlign: 'center' as const }}>
                    {total > 0 ? total.toFixed(1) : '—'}
                  </span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18', textAlign: 'center' as const }}>
                    {s.grade ?? (total > 0 ? '…' : '—')}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{s.remark ?? '—'}</span>
                  <input
                    style={{ ...inp, fontSize: '0.78rem', background: isApproved ? '#f0faf4' : '#f7f7f5' }}
                    value={localScores[s.id]?.comment ?? ''}
                    onChange={e => setScore(s.id, 'comment', e.target.value)}
                    disabled={isApproved}
                    placeholder="Optional comment…"
                  />
                </div>
              )
            })}
          </div>

          {/* Bottom save button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button onClick={handleSaveAll} disabled={saving}
              style={{ padding: '0.75rem 2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : '💾 Save all results'}
            </button>
          </div>
        </>
      )}

      {!loading && students.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📝</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Select filters above and click "Load students"</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Choose a term, class level, and subject to start entering results.</p>
        </div>
      )}
    </div>
  )
}