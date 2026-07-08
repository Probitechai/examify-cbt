'use client'
import { useState, useEffect } from 'react'

interface Session { id: string; name: string; is_active: boolean }
interface Term { id: string; name: string; is_active: boolean }
interface ResultRow {
  id: string
  student_name: string
  admission_no: string
  class_level: string
  class_arm: string
  subject: string
  ca_score: number
  exam_score: number
  total_score: number
  grade: string
  remark: string
  approved_at: string | null
  entered_by_name?: string
}

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']
const CLASS_ARMS = ['A','B','C','D','E','Science','Arts','Commercial','Social Science']
const SUBJECTS = ['Agricultural Science','Biology','Chemistry','Christian Religious Studies','Civic Education','Commerce','Computer Science','Economics','English Language','Financial Accounting','French','Further Mathematics','Geography','Government','History','Home Economics','Islamic Religious Studies','Literature in English','Mathematics','Music','Physical Education','Physics','Technical Drawing']

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

export default function ApprovalsPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [subject, setSubject] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved'>('pending')
  const [results, setResults] = useState<ResultRow[]>([])
  const [loading, setLoading] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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

  async function loadResults() {
    if (!selectedTerm || !classLevel) { setError('Please select a term and class'); return }
    setLoading(true); setError(''); setResults([])
    try {
      const params = new URLSearchParams({ termId: selectedTerm, classLevel })
      if (classArm) params.append('classArm', classArm)
      if (subject) params.append('subject', subject)
      const res = await fetch(`${API}/results?${params}`, { headers: hdrs() })
      const data = await res.json()
      setResults(data.results ?? [])
    } catch { setError('Failed to load results') } finally { setLoading(false) }
  }

  async function handleApprove(scope: 'all' | 'subject') {
    if (!selectedTerm || !classLevel) return
    if (!window.confirm(scope === 'all'
      ? `Approve ALL pending results for ${classLevel}${classArm ? ' ' + classArm : ''}? Parents will immediately see these results.`
      : `Approve all pending results for ${subject} — ${classLevel}${classArm ? ' ' + classArm : ''}?`
    )) return

    setApproving(true); setError('')
    try {
      const body: any = { termId: selectedTerm, classLevel }
      if (classArm) body.classArm = classArm
      if (scope === 'subject' && subject) body.subject = subject

      const res = await fetch(`${API}/results/approve`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Failed to approve')
      setSuccess(`Results approved successfully! Parents can now view them.`)
      setTimeout(() => setSuccess(''), 5000)
      loadResults()
    } catch { setError('Failed to approve results') } finally { setApproving(false) }
  }

  const filtered = results.filter(r => {
    if (filterStatus === 'pending') return !r.approved_at
    if (filterStatus === 'approved') return !!r.approved_at
    return true
  })

  const pendingCount = results.filter(r => !r.approved_at).length
  const approvedCount = results.filter(r => !!r.approved_at).length

  function gradeColor(grade: string) {
    if (grade === 'A') return '#0f4a32'
    if (grade === 'B') return '#1e40af'
    if (grade === 'C') return '#d97706'
    if (grade === 'D' || grade === 'E') return '#92400e'
    return '#dc2626'
  }

  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Result Approval</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Review and approve results before they become visible to parents.</p>
      </div>

      {/* Filter panel */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
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
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Subject (optional)</label>
            <select style={sel} value={subject} onChange={e => setSubject(e.target.value)}>
              <option value="">All subjects</option>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={loadResults} disabled={loading}
            style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {results.length > 0 && (
        <>
          {/* Stats + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {/* Filter tabs */}
              {[
                { key: 'all', label: `All (${results.length})` },
                { key: 'pending', label: `⏳ Pending (${pendingCount})`, color: '#d97706' },
                { key: 'approved', label: `✅ Approved (${approvedCount})`, color: '#1a6b4a' },
              ].map((f: any) => (
                <button key={f.key} onClick={() => setFilterStatus(f.key)}
                  style={{ padding: '0.375rem 0.875rem', border: `1.5px solid ${filterStatus === f.key ? (f.color ?? '#1a6b4a') : '#e5e5e0'}`, borderRadius: '20px', background: filterStatus === f.key ? (f.color ?? '#1a6b4a') : 'white', color: filterStatus === f.key ? 'white' : '#6b6b65', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {subject && pendingCount > 0 && (
                <button onClick={() => handleApprove('subject')} disabled={approving}
                  style={{ padding: '0.5rem 1.25rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: approving ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                  {approving ? 'Approving…' : `✅ Approve ${subject}`}
                </button>
              )}
              {pendingCount > 0 && (
                <button onClick={() => handleApprove('all')} disabled={approving}
                  style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: approving ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                  {approving ? 'Approving…' : `✅ Approve all ${pendingCount} pending`}
                </button>
              )}
            </div>
          </div>

          {/* Results table */}
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px 60px 100px 120px', gap: '0.5rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
              <span>Student</span>
              <span>Subject</span>
              <span style={{ textAlign: 'center' as const }}>CA</span>
              <span style={{ textAlign: 'center' as const }}>Exam</span>
              <span style={{ textAlign: 'center' as const }}>Total</span>
              <span style={{ textAlign: 'center' as const }}>Grade</span>
              <span style={{ textAlign: 'center' as const }}>Status</span>
              <span style={{ textAlign: 'center' as const }}>Approved</span>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                  {filterStatus === 'pending' ? '🎉' : '📭'}
                </p>
                <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>
                  {filterStatus === 'pending' ? 'No pending results — everything is approved!' : 'No results found for this filter.'}
                </p>
              </div>
            ) : filtered.map((r, i) => (
              <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px 60px 100px 120px', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', background: r.approved_at ? '#f9fdf9' : 'white' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{r.student_name}</p>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{r.class_level} {r.class_arm}</p>
                </div>
                <span style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{r.subject}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{r.ca_score ?? '—'}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{r.exam_score ?? '—'}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.95rem', fontWeight: 700, color: '#1a1a18' }}>{r.total_score != null ? Number(r.total_score).toFixed(0) : '—'}</span>
                <span style={{ textAlign: 'center' as const }}>
                  <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 20, background: '#f7f7f5', color: gradeColor(r.grade), fontWeight: 700, fontSize: '0.825rem' }}>
                    {r.grade}
                  </span>
                </span>
                <span style={{ textAlign: 'center' as const }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: r.approved_at ? '#e8f5ee' : '#fffbeb', color: r.approved_at ? '#0f4a32' : '#92400e' }}>
                    {r.approved_at ? 'APPROVED' : 'PENDING'}
                  </span>
                </span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.72rem', color: '#6b6b65' }}>
                  {r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && results.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Result Approval Queue</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Select a term and class then click Load to see results pending approval.</p>
        </div>
      )}
    </div>
  )
}