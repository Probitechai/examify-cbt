'use client'
import { useState, useEffect, useRef } from 'react'

interface Session { id: string; name: string; is_active: boolean }
interface Term { id: string; name: string; term_number: number; is_active: boolean }
interface StudentRow {
  studentId: string
  studentName: string
  admissionNo: string
  classArm: string
  subjects: Record<string, { caScore: number; examScore: number; total: number; grade: string; remark: string }>
  total: number
  average: number
  position: number | null
}
interface Broadsheet {
  termInfo: { term_name: string; session_name: string }
  classLevel: string
  classArm: string
  subjects: string[]
  students: StudentRow[]
  config: { caWeight: number; examWeight: number; showPosition: boolean }
}

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

function gradeColor(grade: string) {
  if (grade === 'A') return '#0f4a32'
  if (grade === 'B') return '#1e40af'
  if (grade === 'C') return '#d97706'
  if (grade === 'D' || grade === 'E') return '#92400e'
  return '#dc2626'
}

export default function BroadsheetPage() {
  const printRef = useRef<HTMLDivElement>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [broadsheet, setBroadsheet] = useState<Broadsheet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [schoolName, setSchoolName] = useState('')

  useEffect(() => { loadSessions() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])

  async function loadSessions() {
    const res = await fetch(`${API}/sessions`, { headers: hdrs() })
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: Session) => s.is_active)
    if (active) setSelectedSession(active.id)

    // Get school name from /auth/me
    try {
      const meRes = await fetch(`${API}/auth/me`, { headers: hdrs() })
      const meData = await meRes.json()
      setSchoolName(meData.user?.school?.name ?? '')
    } catch {}
  }

  async function loadTerms(sessionId: string) {
    const res = await fetch(`${API}/sessions/${sessionId}/terms`, { headers: hdrs() })
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: Term) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadBroadsheet() {
    if (!selectedTerm || !classLevel) { setError('Please select a term and class level'); return }
    setLoading(true); setError(''); setBroadsheet(null)
    try {
      const params = new URLSearchParams({ termId: selectedTerm, classLevel })
      if (classArm) params.append('classArm', classArm)
      const res = await fetch(`${API}/results/broadsheet?${params}`, { headers: hdrs() })
      const data = await res.json()
      setBroadsheet(data.broadsheet)
    } catch { setError('Failed to load broadsheet') } finally { setLoading(false) }
  }

  function handlePrint() {
    window.print()
  }

  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' as const }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #broadsheet-print, #broadsheet-print * { visibility: visible; }
          #broadsheet-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          table { border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #333; padding: 3px 5px; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Class Broadsheet</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Full class result sheet showing all subjects, grades and positions.</p>
      </div>

      {/* Filter panel */}
      <div className="no-print" style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
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
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={loadBroadsheet} disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
              {loading ? 'Loading…' : 'Generate'}
            </button>
            {broadsheet && (
              <button onClick={handlePrint}
                style={{ padding: '0.625rem 1.25rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                🖨️ Print
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {!broadsheet && !loading && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Select filters and click Generate</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>The broadsheet shows all students and subjects in one view.</p>
        </div>
      )}

      {broadsheet && broadsheet.students.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</p>
          <p style={{ fontWeight: 600, color: '#1a1a18' }}>No results found</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginTop: '0.25rem' }}>No scores have been entered for this class and term yet.</p>
        </div>
      )}

      {broadsheet && broadsheet.students.length > 0 && (
        <div id="broadsheet-print" ref={printRef}>
          {/* School header */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1.5rem', background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.375rem' }}>{schoolName || 'School Name'}</h2>
            <p style={{ fontSize: '1rem', color: '#3a3a36', fontWeight: 500 }}>
              {broadsheet.termInfo.session_name} — {broadsheet.termInfo.term_name}
            </p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginTop: '0.25rem' }}>
              Class: {broadsheet.classLevel} {broadsheet.classArm !== 'All' ? broadsheet.classArm : ''} &nbsp;|&nbsp;
              Total students: {broadsheet.students.length} &nbsp;|&nbsp;
              CA: {broadsheet.config.caWeight}% / Exam: {broadsheet.config.examWeight}%
            </p>
          </div>

          {/* Broadsheet table */}
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#1a6b4a', color: 'white' }}>
                  <th style={{ padding: '0.625rem 0.75rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' as const, position: 'sticky' as const, left: 0, background: '#1a6b4a' }}>S/N</th>
                  <th style={{ padding: '0.625rem 0.75rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' as const, position: 'sticky' as const, left: 32, background: '#1a6b4a', minWidth: 160 }}>Student Name</th>
                  <th style={{ padding: '0.625rem 0.75rem', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' as const }}>Adm. No.</th>
                  {broadsheet.subjects.map(sub => (
                    <th key={sub} colSpan={2} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600, borderLeft: '1px solid rgba(255,255,255,0.2)', whiteSpace: 'nowrap' as const, fontSize: '0.72rem' }}>
                      {sub.length > 10 ? sub.slice(0, 10) + '…' : sub}
                    </th>
                  ))}
                  <th style={{ padding: '0.625rem 0.75rem', textAlign: 'center', fontWeight: 600, borderLeft: '2px solid rgba(255,255,255,0.4)', whiteSpace: 'nowrap' as const }}>Total</th>
                  <th style={{ padding: '0.625rem 0.75rem', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' as const }}>Avg</th>
                  {broadsheet.config.showPosition && <th style={{ padding: '0.625rem 0.75rem', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' as const }}>Pos</th>}
                </tr>
                <tr style={{ background: '#0f4a32', color: 'white' }}>
                  <th style={{ padding: '0.3rem 0.75rem', position: 'sticky' as const, left: 0, background: '#0f4a32' }}></th>
                  <th style={{ padding: '0.3rem 0.75rem', position: 'sticky' as const, left: 32, background: '#0f4a32' }}></th>
                  <th></th>
                  {broadsheet.subjects.map(sub => (
                    <>
                      <th key={`${sub}-score`} style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.65rem', borderLeft: '1px solid rgba(255,255,255,0.2)' }}>Score</th>
                      <th key={`${sub}-grade`} style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.65rem' }}>Grade</th>
                    </>
                  ))}
                  <th style={{ borderLeft: '2px solid rgba(255,255,255,0.4)' }}></th>
                  <th></th>
                  {broadsheet.config.showPosition && <th></th>}
                </tr>
              </thead>
              <tbody>
                {broadsheet.students.map((student, i) => (
                  <tr key={student.studentId} style={{ background: i % 2 === 0 ? 'white' : '#f9f9f8' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: '#6b6b65', position: 'sticky' as const, left: 0, background: i % 2 === 0 ? 'white' : '#f9f9f8' }}>{i + 1}</td>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 500, color: '#1a1a18', position: 'sticky' as const, left: 32, background: i % 2 === 0 ? 'white' : '#f9f9f8', whiteSpace: 'nowrap' as const }}>
                      {student.studentName}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: '#6b6b65' }}>{student.admissionNo ?? '—'}</td>
                    {broadsheet.subjects.map(sub => {
                      const r = student.subjects[sub]
                      return (
                        <>
                          <td key={`${student.studentId}-${sub}-score`} style={{ padding: '0.5rem 0.625rem', textAlign: 'center', color: '#1a1a18', borderLeft: '1px solid #e5e5e0', fontWeight: 500 }}>
                            {r ? Number(r.total).toFixed(0) : '—'}
                          </td>
                          <td key={`${student.studentId}-${sub}-grade`} style={{ padding: '0.5rem 0.625rem', textAlign: 'center', fontWeight: 700, color: r ? gradeColor(r.grade) : '#a0a09a' }}>
                            {r?.grade ?? '—'}
                          </td>
                        </>
                      )
                    })}
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: '#1a1a18', borderLeft: '2px solid #e5e5e0' }}>
                      {student.total.toFixed(0)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 600, color: student.average >= 75 ? '#1a6b4a' : student.average >= 45 ? '#d97706' : '#dc2626' }}>
                      {student.average.toFixed(1)}
                    </td>
                    {broadsheet.config.showPosition && (
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: 700, color: student.position === 1 ? '#d97706' : '#1a1a18' }}>
                        {student.position ?? '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f7f7f5', borderTop: '2px solid #e5e5e0' }}>
                  <td colSpan={3} style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#1a1a18' }}>Class statistics</td>
                  {broadsheet.subjects.map(sub => {
                    const scores = broadsheet.students.map(s => s.subjects[sub]?.total ?? 0).filter(s => s > 0)
                    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—'
                    const highest = scores.length > 0 ? Math.max(...scores).toFixed(0) : '—'
                    return (
                      <>
                        <td key={`stat-${sub}-avg`} colSpan={2} style={{ padding: '0.5rem 0.625rem', textAlign: 'center', fontSize: '0.72rem', color: '#6b6b65', borderLeft: '1px solid #e5e5e0' }}>
                          Avg: {avg}<br />High: {highest}
                        </td>
                      </>
                    )
                  })}
                  <td colSpan={broadsheet.config.showPosition ? 3 : 2} style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontSize: '0.78rem', color: '#6b6b65', borderLeft: '2px solid #e5e5e0' }}>
                    {broadsheet.students.length} students
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p style={{ fontSize: '0.72rem', color: '#a0a09a', textAlign: 'center', marginTop: '1rem' }}>
            Generated by Examify School Management System · {new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      )}
    </div>
  )
}