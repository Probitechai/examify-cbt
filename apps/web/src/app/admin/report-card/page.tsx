'use client'
import { useState, useEffect } from 'react'

interface Session { id: string; name: string; is_active: boolean }
interface Term { id: string; name: string; term_number: number; is_active: boolean }
interface Student { id: string; full_name: string; admission_no: string; class_level: string; class_arm: string }
interface ReportCard {
  student: { full_name: string; admission_no: string; class_level: string; class_arm: string }
  school: { name: string }
  term: { term_name: string; session_name: string; start_date: string; end_date: string }
  results: { subject: string; ca_score: number; exam_score: number; total_score: number; grade: string; remark: string; teacher_comment: string; approved_at: string }[]
  summary: { total: number; average: number; position: string | null }
  config: { caWeight: number; examWeight: number }
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

function gradeBg(grade: string) {
  if (grade === 'A') return '#e8f5ee'
  if (grade === 'B') return '#eff6ff'
  if (grade === 'C') return '#fffbeb'
  if (grade === 'D' || grade === 'E') return '#fef3c7'
  return '#fef2f2'
}

export default function ReportCardPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [reportCard, setReportCard] = useState<ReportCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [error, setError] = useState('')
  const [schoolName, setSchoolName] = useState('')

  useEffect(() => { loadSessions() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
  useEffect(() => { if (classLevel) loadStudents() }, [classLevel, classArm])

  async function loadSessions() {
    const res = await fetch(`${API}/sessions`, { headers: hdrs() })
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: Session) => s.is_active)
    if (active) setSelectedSession(active.id)
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

  async function loadStudents() {
    setStudentsLoading(true)
    try {
      const params = new URLSearchParams({ role: 'student' })
      const res = await fetch(`${API}/users?${params}`, { headers: hdrs() })
      const data = await res.json()
      const all = data.users ?? []
      const filtered = all.filter((u: any) => {
        if (u.class_level !== classLevel) return false
        if (classArm && u.class_arm !== classArm) return false
        return true
      })
      setStudents(filtered)
      setSelectedStudent('')
    } catch {} finally { setStudentsLoading(false) }
  }

  async function loadReportCard() {
    if (!selectedTerm || !selectedStudent) { setError('Please select a term and student'); return }
    setLoading(true); setError(''); setReportCard(null)
    try {
      const params = new URLSearchParams({ termId: selectedTerm, studentId: selectedStudent })
      const res = await fetch(`${API}/results/report-card?${params}`, { headers: hdrs() })
      const data = await res.json()
      setReportCard(data.reportCard)
    } catch { setError('Failed to load report card') } finally { setLoading(false) }
  }

  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }

  const passedSubjects = reportCard?.results.filter(r => r.grade !== 'F').length ?? 0
  const failedSubjects = reportCard?.results.filter(r => r.grade === 'F').length ?? 0
  const overallGrade = reportCard ? (
    reportCard.summary.average >= 75 ? 'Excellent' :
    reportCard.summary.average >= 65 ? 'Very Good' :
    reportCard.summary.average >= 55 ? 'Good' :
    reportCard.summary.average >= 45 ? 'Fair' :
    reportCard.summary.average >= 40 ? 'Pass' : 'Fail'
  ) : ''

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 900 }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #report-card-print, #report-card-print * { visibility: visible; }
          #report-card-print { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Student Report Card</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Generate and print individual student report cards.</p>
      </div>

      {/* Filter panel */}
      <div className="no-print" style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
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
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Class level</label>
            <select style={sel} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Class arm</label>
            <select style={sel} value={classArm} onChange={e => setClassArm(e.target.value)}>
              <option value="">All arms</option>
              {CLASS_ARMS.map(a => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Student</label>
            <select style={sel} value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>
              <option value="">{studentsLoading ? 'Loading…' : 'Select student…'}</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button onClick={loadReportCard} disabled={loading}
              style={{ flex: 1, padding: '0.625rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Loading…' : 'Generate'}
            </button>
            {reportCard && (
              <button onClick={() => window.print()}
                style={{ flex: 1, padding: '0.625rem 1rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                🖨️ Print
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {!reportCard && !loading && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Select a student and click Generate</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>The report card shows all subject scores, grades and class position.</p>
        </div>
      )}

      {reportCard && (
        <div id="report-card-print" style={{ background: 'white', border: '2px solid #1a6b4a', borderRadius: '16px', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #1a6b4a 0%, #0f4a32 100%)', padding: '2rem', textAlign: 'center', color: 'white' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.375rem' }}>
              {reportCard.school.name || schoolName}
            </h1>
            <p style={{ fontSize: '1rem', opacity: 0.9, fontWeight: 500 }}>Student Academic Report Card</p>
            <p style={{ fontSize: '0.875rem', opacity: 0.75, marginTop: '0.25rem' }}>
              {reportCard.term.session_name} — {reportCard.term.term_name}
            </p>
          </div>

          {/* Student info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0', borderBottom: '1px solid #e5e5e0' }}>
            {[
              { label: 'Student Name', value: reportCard.student.full_name },
              { label: 'Admission No.', value: reportCard.student.admission_no ?? 'N/A' },
              { label: 'Class', value: `${reportCard.student.class_level} ${reportCard.student.class_arm ?? ''}` },
            ].map((item, i) => (
              <div key={i} style={{ padding: '1rem 1.5rem', borderRight: i < 2 ? '1px solid #e5e5e0' : 'none', background: '#f9f9f8' }}>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.375rem' }}>{item.label}</p>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* Results table */}
          <div style={{ padding: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
              <thead>
                <tr style={{ background: '#f7f7f5', borderBottom: '2px solid #e5e5e0' }}>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Subject</th>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const }}>CA ({reportCard.config.caWeight})</th>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const }}>Exam ({reportCard.config.examWeight})</th>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const }}>Total</th>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const }}>Grade</th>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const }}>Remark</th>
                </tr>
              </thead>
              <tbody>
                {reportCard.results.map((r, i) => (
                  <tr key={r.subject} style={{ borderBottom: '1px solid #f0f0ee', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 500, color: '#1a1a18' }}>{r.subject}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#3a3a36' }}>{r.ca_score ?? '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#3a3a36' }}>{r.exam_score ?? '—'}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: '#1a1a18', fontSize: '1rem' }}>
                      {r.total_score != null ? Number(r.total_score).toFixed(0) : '—'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '0.2rem 0.75rem', borderRadius: 20, background: gradeBg(r.grade), color: gradeColor(r.grade), fontWeight: 700, fontSize: '0.875rem' }}>
                        {r.grade}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#6b6b65', fontSize: '0.875rem' }}>{r.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary section */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Score', value: reportCard.summary.total.toFixed(0), color: '#1a1a18' },
                { label: 'Average', value: `${reportCard.summary.average.toFixed(1)}%`, color: reportCard.summary.average >= 75 ? '#1a6b4a' : reportCard.summary.average >= 45 ? '#d97706' : '#dc2626' },
                { label: 'Class Position', value: reportCard.summary.position ?? 'N/A', color: '#1e40af' },
                { label: 'Overall Remark', value: overallGrade, color: gradeColor(reportCard.summary.average >= 75 ? 'A' : reportCard.summary.average >= 65 ? 'B' : reportCard.summary.average >= 55 ? 'C' : reportCard.summary.average >= 40 ? 'D' : 'F') },
              ].map((item, i) => (
                <div key={i} style={{ background: '#f7f7f5', borderRadius: '10px', padding: '1rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>{item.label}</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 700, color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Subject summary */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ flex: 1, background: '#e8f5ee', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                <p style={{ fontSize: '0.78rem', color: '#0f4a32', fontWeight: 600, marginBottom: '0.25rem' }}>✅ Subjects Passed</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a6b4a' }}>{passedSubjects} of {reportCard.results.length}</p>
              </div>
              <div style={{ flex: 1, background: failedSubjects > 0 ? '#fef2f2' : '#f7f7f5', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                <p style={{ fontSize: '0.78rem', color: failedSubjects > 0 ? '#991b1b' : '#6b6b65', fontWeight: 600, marginBottom: '0.25rem' }}>❌ Subjects Failed</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: failedSubjects > 0 ? '#dc2626' : '#6b6b65' }}>{failedSubjects}</p>
              </div>
            </div>

            {/* Signature section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', borderTop: '1px solid #e5e5e0', paddingTop: '1.5rem' }}>
              {['Class Teacher', 'Head Teacher / Principal', 'Parent / Guardian'].map(role => (
                <div key={role} style={{ textAlign: 'center' }}>
                  <div style={{ borderBottom: '1.5px solid #1a1a18', marginBottom: '0.5rem', height: '2.5rem' }}></div>
                  <p style={{ fontSize: '0.78rem', color: '#6b6b65', fontWeight: 500 }}>{role}</p>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.72rem', color: '#a0a09a', textAlign: 'center', marginTop: '1.5rem' }}>
              Generated by Examify School Management System · {new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}