'use client'
import { useState, useEffect } from 'react'

interface Session { id: string; name: string; is_active: boolean }
interface Term { id: string; name: string; is_active: boolean }
interface StudentConduct {
  id: string
  full_name: string
  admission_no: string
  class_arm: string
  report_id: string | null
  class_teacher_remark: string | null
  punctuality: number | null
  neatness: number | null
  cooperation: number | null
  leadership: number | null
  participation: number | null
}

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']
const CLASS_ARMS = ['A','B','C','D','E','Science','Arts','Commercial','Social Science']
const TRAITS = [
  { key: 'punctuality', label: 'Punctuality' },
  { key: 'neatness', label: 'Neatness' },
  { key: 'cooperation', label: 'Cooperation' },
  { key: 'leadership', label: 'Leadership' },
  { key: 'participation', label: 'Participation' },
]
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent']
const RATING_COLORS = ['', '#dc2626', '#d97706', '#0284c7', '#1a6b4a', '#0f4a32']

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

export default function ConductPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [students, setStudents] = useState<StudentConduct[]>([])
  const [localData, setLocalData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)

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
    if (!selectedTerm || !classLevel) { setError('Please select a term and class'); return }
    setLoading(true); setError(''); setStudents([])
    try {
      const params = new URLSearchParams({ termId: selectedTerm, classLevel })
      if (classArm) params.append('classArm', classArm)
      const res = await fetch(`${API}/conduct?${params}`, { headers: hdrs() })
      const data = await res.json()
      const list = data.students ?? []
      setStudents(list)

      // Initialize local data from existing reports
      const local: Record<string, any> = {}
      for (const s of list) {
        local[s.id] = {
          class_teacher_remark: s.class_teacher_remark ?? '',
          punctuality: s.punctuality ?? 0,
          neatness: s.neatness ?? 0,
          cooperation: s.cooperation ?? 0,
          leadership: s.leadership ?? 0,
          participation: s.participation ?? 0,
        }
      }
      setLocalData(local)
    } catch { setError('Failed to load students') } finally { setLoading(false) }
  }

  function setField(studentId: string, field: string, value: any) {
    setLocalData(prev => ({ ...prev, [studentId]: { ...prev[studentId], [field]: value } }))
  }

  async function handleSaveAll() {
    if (!selectedTerm || students.length === 0) return
    setSaving(true); setError('')
    try {
      const reports = students.map(s => ({
        studentId: s.id,
        classTeacherRemark: localData[s.id]?.class_teacher_remark || undefined,
        punctuality: localData[s.id]?.punctuality || undefined,
        neatness: localData[s.id]?.neatness || undefined,
        cooperation: localData[s.id]?.cooperation || undefined,
        leadership: localData[s.id]?.leadership || undefined,
        participation: localData[s.id]?.participation || undefined,
      }))
      const res = await fetch(`${API}/conduct/bulk`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ termId: selectedTerm, reports })
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true); setTimeout(() => setSaved(false), 3000)
      loadStudents()
    } catch { setError('Failed to save conduct reports') } finally { setSaving(false) }
  }

  function RatingButtons({ studentId, field }: { studentId: string; field: string }) {
    const current = localData[studentId]?.[field] ?? 0
    return (
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {[1,2,3,4,5].map(v => (
          <button key={v} onClick={() => setField(studentId, field, current === v ? 0 : v)}
            title={RATING_LABELS[v]}
            style={{ width: 28, height: 28, borderRadius: '6px', border: `1.5px solid ${current >= v ? RATING_COLORS[v] : '#e5e5e0'}`, background: current >= v ? RATING_COLORS[v] : 'white', color: current >= v ? 'white' : '#a0a09a', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.1s' }}>
            {v}
          </button>
        ))}
        {current > 0 && <span style={{ fontSize: '0.72rem', color: RATING_COLORS[current], fontWeight: 600, alignSelf: 'center', marginLeft: '0.25rem' }}>{RATING_LABELS[current]}</span>}
      </div>
    )
  }

  const completedCount = students.filter(s => localData[s.id]?.class_teacher_remark).length
  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Conduct Reports</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Enter class teacher remarks and behaviour ratings for each student. These appear on the report card.</p>
      </div>

      {/* Filter panel */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Session</label>
            <select style={sel} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              <option value="">Select…</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (Active)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select…</option>
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
          <button onClick={loadStudents} disabled={loading}
            style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
            {loading ? 'Loading…' : 'Load students'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {saved && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ Conduct reports saved successfully!</div>}

      {students.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>{classLevel}{classArm ? ` ${classArm}` : ''} — {terms.find(t => t.id === selectedTerm)?.name}</p>
              <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>{completedCount} of {students.length} remarks entered</p>
            </div>
            <button onClick={handleSaveAll} disabled={saving}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : '💾 Save all reports'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {students.map((s, i) => {
              const data = localData[s.id] ?? {}
              const hasRemark = !!data.class_teacher_remark
              const hasRatings = TRAITS.some(t => data[t.key] > 0)
              const isExpanded = expandedStudent === s.id

              return (
                <div key={s.id} style={{ background: 'white', border: `1.5px solid ${hasRemark ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '12px', overflow: 'hidden' }}>
                  {/* Student header — always visible */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1.25rem', cursor: 'pointer', background: isExpanded ? '#f9f9f8' : 'white' }}
                    onClick={() => setExpandedStudent(isExpanded ? null : s.id)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.78rem', color: '#a0a09a', fontWeight: 600, minWidth: 20 }}>{i + 1}</span>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{s.full_name}</p>
                        <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{s.admission_no ?? '—'} · {s.class_arm ?? classArm}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {hasRemark && <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.625rem', borderRadius: 20, background: '#e8f5ee', color: '#0f4a32' }}>✓ Remark entered</span>}
                      {hasRatings && <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.625rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af' }}>✓ Ratings set</span>}
                      <span style={{ fontSize: '0.825rem', color: '#a0a09a' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded form */}
                  {isExpanded && (
                    <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e5e5e0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Class teacher remark */}
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a1a18', display: 'block', marginBottom: '0.375rem' }}>
                          Class Teacher's Remark
                        </label>
                        <textarea
                          value={data.class_teacher_remark ?? ''}
                          onChange={e => setField(s.id, 'class_teacher_remark', e.target.value)}
                          placeholder="e.g. A diligent student who shows great enthusiasm in class. Encourages peers and participates actively in school activities."
                          rows={3}
                          style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' as const }}
                        />
                      </div>

                      {/* Behaviour ratings */}
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a1a18', display: 'block', marginBottom: '0.75rem' }}>
                          Behaviour Ratings <span style={{ fontWeight: 400, color: '#6b6b65' }}>(1 = Poor, 5 = Excellent — optional)</span>
                        </label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                          {TRAITS.map(trait => (
                            <div key={trait.key} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              <span style={{ fontSize: '0.825rem', color: '#3a3a36', minWidth: 100 }}>{trait.label}</span>
                              <RatingButtons studentId={s.id} field={trait.key} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button onClick={handleSaveAll} disabled={saving}
              style={{ padding: '0.75rem 2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : '💾 Save all reports'}
            </button>
          </div>
        </>
      )}

      {!loading && students.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📝</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Select filters and click Load students</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Enter remarks and ratings for each student. These will appear on their report card.</p>
        </div>
      )}
    </div>
  )
}