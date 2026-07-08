'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Student {
  id: string
  full_name: string
  admission_no: string
  class_level: string
  class_arm: string
  photo_url?: string
}
interface DashboardItem {
  student: Student
  activeTerm: { term_id: string; term_name: string; session_name: string } | null
  resultSummary: { subject_count: number; average: number; failed: number } | null
  attendanceSummary: { present: number; absent: number; late: number; total_days: number } | null
  feeSummary: { totalFees: number; totalPaid: number; balance: number } | null
}

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}
function getSubdomain() {
  try {
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? ''
  } catch {}
  return ''
}
function hdrs() {
  return { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}
function formatAmount(n: number) {
  return `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
}
const API = process.env.NEXT_PUBLIC_API_URL

export default function ParentDashboard() {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<DashboardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [parentName, setParentName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'results' | 'attendance' | 'fees'>('results')
  const [results, setResults] = useState<any>(null)
  const [attendance, setAttendance] = useState<any>(null)
  const [fees, setFees] = useState<any>(null)
  const [sectionLoading, setSectionLoading] = useState(false)
  const [announcements, setAnnouncements] = useState<any[]>([])

  useEffect(() => {
    // Verify role
    try {
      const token = getToken()
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.role !== 'parent') { router.push('/login'); return }
      setParentName(payload.fullName ?? '')
    } catch { router.push('/login'); return }
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      const [dashRes, meRes, annRes] = await Promise.all([
        fetch(`${API}/parents/dashboard`, { headers: hdrs() }),
        fetch(`${API}/auth/me`, { headers: hdrs() }),
        fetch(`${API}/announcements`, { headers: hdrs() }),
      ])
      const dashData = await dashRes.json()
      const meData = await meRes.json()
      const annData = annRes.ok ? await annRes.json() : {}
      setDashboard(dashData.dashboard ?? [])
      setSchoolName(meData.user?.school?.name ?? '')
      setAnnouncements(annData.announcements ?? [])

      // Auto-select first student
      if (dashData.dashboard?.length > 0) {
        setSelectedStudent(dashData.dashboard[0].student.id)
      }
    } catch {} finally { setLoading(false) }
  }

  async function loadSection(section: 'results' | 'attendance' | 'fees', studentId: string, termId: string) {
    setSectionLoading(true)
    setActiveSection(section)
    try {
      const params = new URLSearchParams({ studentId, termId })
      const res = await fetch(`${API}/parents/${section}?${params}`, { headers: hdrs() })
      const data = await res.json()
      if (section === 'results') setResults(data)
      if (section === 'attendance') setAttendance(data)
      if (section === 'fees') setFees(data)
    } catch {} finally { setSectionLoading(false) }
  }

  function handleLogout() {
    document.cookie = 'examify_token=; Max-Age=0; path=/'
    router.push('/login')
  }

  const currentItem = dashboard.find(d => d.student.id === selectedStudent)
  const termId = currentItem?.activeTerm?.term_id

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</p>
        <p style={{ color: '#6b6b65' }}>Loading your dashboard…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a6b4a 0%, #0f4a32 100%)', padding: '1rem 1.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem', marginBottom: '0.2rem' }}>{schoolName}</p>
            <h1 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 600 }}>Welcome, {parentName.split(' ')[0]} 👋</h1>
          </div>
          <button onClick={handleLogout}
            style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', color: 'white', fontSize: '0.825rem', cursor: 'pointer' }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem' }}>

        {dashboard.length === 0 ? (
          <div style={{ background: 'white', borderRadius: '14px', padding: '3rem', textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👨‍👩‍👧</p>
            <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>No students linked yet</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Please contact your school administrator to link your ward to this account.</p>
          </div>
        ) : (
          <>
            {/* Student selector (if multiple children) */}
            {dashboard.length > 1 && (
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {dashboard.map(d => (
                  <button key={d.student.id}
                    onClick={() => { setSelectedStudent(d.student.id); setResults(null); setAttendance(null); setFees(null) }}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 1rem', background: selectedStudent === d.student.id ? '#1a6b4a' : 'white', border: `1.5px solid ${selectedStudent === d.student.id ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '10px', cursor: 'pointer' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: '#f0f0ee', flexShrink: 0 }}>
                      {d.student.photo_url ? (
                        <img src={d.student.photo_url} alt={d.student.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>👤</span>}
                    </div>
                    <span style={{ fontSize: '0.875rem', fontWeight: 500, color: selectedStudent === d.student.id ? 'white' : '#1a1a18', whiteSpace: 'nowrap' as const }}>{d.student.full_name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Student overview card */}
            {currentItem && (
              <>
                <div style={{ background: 'white', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1rem', border: '1px solid #e5e5e0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: '#f0f0ee', flexShrink: 0, border: '2px solid #e5e5e0' }}>
                      {currentItem.student.photo_url ? (
                        <img src={currentItem.student.photo_url} alt={currentItem.student.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : <span style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>👤</span>}
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.2rem' }}>{currentItem.student.full_name}</h2>
                      <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>
                        {currentItem.student.class_level} {currentItem.student.class_arm} &nbsp;·&nbsp;
                        Adm: {currentItem.student.admission_no ?? 'N/A'} &nbsp;·&nbsp;
                        {currentItem.activeTerm ? `${currentItem.activeTerm.session_name} — ${currentItem.activeTerm.term_name}` : 'No active term'}
                      </p>
                    </div>
                  </div>

                  {/* Quick stats */}
                  {currentItem.activeTerm && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                      {/* Results */}
                      <div style={{ background: '#f0faf4', borderRadius: '10px', padding: '0.875rem', cursor: 'pointer', border: '1.5px solid transparent' }}
                        onClick={() => { setActiveSection('results'); if (termId) loadSection('results', currentItem.student.id, termId) }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0f4a32', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.375rem' }}>📊 Results</p>
                        {currentItem.resultSummary && Number(currentItem.resultSummary.subject_count) > 0 ? (
                          <>
                            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a' }}>{Math.round(Number(currentItem.resultSummary.average))}%</p>
                            <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{currentItem.resultSummary.subject_count} subjects</p>
                          </>
                        ) : <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>No results yet</p>}
                      </div>

                      {/* Attendance */}
                      <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '0.875rem', cursor: 'pointer' }}
                        onClick={() => { setActiveSection('attendance'); if (termId) loadSection('attendance', currentItem.student.id, termId) }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1e40af', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.375rem' }}>📋 Attendance</p>
                        {currentItem.attendanceSummary && Number(currentItem.attendanceSummary.total_days) > 0 ? (
                          <>
                            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e40af' }}>
                              {Math.round((Number(currentItem.attendanceSummary.present) / Number(currentItem.attendanceSummary.total_days)) * 100)}%
                            </p>
                            <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{currentItem.attendanceSummary.total_days} days recorded</p>
                          </>
                        ) : <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>No records yet</p>}
                      </div>

                      {/* Fees */}
                      <div style={{ background: currentItem.feeSummary && currentItem.feeSummary.balance > 0 ? '#fef2f2' : '#f0faf4', borderRadius: '10px', padding: '0.875rem', cursor: 'pointer' }}
                        onClick={() => { setActiveSection('fees'); if (termId) loadSection('fees', currentItem.student.id, termId) }}>
                        <p style={{ fontSize: '0.72rem', fontWeight: 600, color: currentItem.feeSummary && currentItem.feeSummary.balance > 0 ? '#991b1b' : '#0f4a32', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.375rem' }}>💰 Fees</p>
                        {currentItem.feeSummary ? (
                          <>
                            <p style={{ fontSize: '1rem', fontWeight: 700, color: currentItem.feeSummary.balance > 0 ? '#dc2626' : '#1a6b4a' }}>
                              {currentItem.feeSummary.balance > 0 ? `Owing: ${formatAmount(currentItem.feeSummary.balance)}` : '✓ Fully paid'}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Paid: {formatAmount(currentItem.feeSummary.totalPaid)}</p>
                          </>
                        ) : <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>No fee data</p>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Section tabs */}
                <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem', width: 'fit-content' }}>
                  {([
                    { key: 'results', label: '📊 Results' },
                    { key: 'attendance', label: '📋 Attendance' },
                    { key: 'fees', label: '💰 Fees' },
                  ] as const).map(tab => (
                    <button key={tab.key}
                      onClick={() => { if (termId) loadSection(tab.key, currentItem.student.id, termId) }}
                      style={{ padding: '0.625rem 1.25rem', fontSize: '0.825rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeSection === tab.key ? '#1a6b4a' : 'transparent', color: activeSection === tab.key ? 'white' : '#6b6b65' }}>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {sectionLoading && (
                  <div style={{ background: 'white', borderRadius: '14px', padding: '2rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
                    <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Loading…</p>
                  </div>
                )}

                {/* Results section */}
                {activeSection === 'results' && results && !sectionLoading && (
                  <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e5e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>Academic Results</p>
                        <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>{results.term?.term_name} — {results.term?.session_name}</p>
                      </div>
                      {results.summary && (
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.825rem' }}>
                          <span style={{ color: '#6b6b65' }}>Average: <strong style={{ color: '#1a6b4a' }}>{results.summary.average}%</strong></span>
                          {results.summary.position && <span style={{ color: '#6b6b65' }}>Position: <strong style={{ color: '#1e40af' }}>{results.summary.position}</strong></span>}
                        </div>
                      )}
                    </div>
                    {results.results?.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>No approved results yet for this term.</p>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 60px 1fr', gap: '0.5rem', padding: '0.5rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                          <span>Subject</span><span style={{ textAlign: 'center' as const }}>CA</span><span style={{ textAlign: 'center' as const }}>Exam</span><span style={{ textAlign: 'center' as const }}>Total</span><span style={{ textAlign: 'center' as const }}>Grade</span><span>Remark</span>
                        </div>
                        {results.results?.map((r: any, i: number) => (
                          <div key={r.subject} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 60px 1fr', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{r.subject}</span>
                            <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{r.ca_score ?? '—'}</span>
                            <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{r.exam_score ?? '—'}</span>
                            <span style={{ textAlign: 'center' as const, fontSize: '0.95rem', fontWeight: 700, color: '#1a1a18' }}>{r.total_score != null ? Number(r.total_score).toFixed(0) : '—'}</span>
                            <span style={{ textAlign: 'center' as const }}>
                              <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 20, background: r.grade === 'A' ? '#e8f5ee' : r.grade === 'B' ? '#eff6ff' : r.grade === 'F' ? '#fef2f2' : '#fffbeb', color: r.grade === 'A' ? '#0f4a32' : r.grade === 'B' ? '#1e40af' : r.grade === 'F' ? '#dc2626' : '#92400e', fontWeight: 700, fontSize: '0.825rem' }}>
                                {r.grade}
                              </span>
                            </span>
                            <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{r.remark}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Attendance section */}
                {activeSection === 'attendance' && attendance && !sectionLoading && (
                  <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e5e0' }}>
                      <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.75rem' }}>Attendance Record</p>
                      {attendance.summary && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                          {[
                            { label: 'Present', value: attendance.summary.present, color: '#0f4a32', bg: '#e8f5ee' },
                            { label: 'Absent', value: attendance.summary.absent, color: '#dc2626', bg: '#fef2f2' },
                            { label: 'Late', value: attendance.summary.late, color: '#d97706', bg: '#fffbeb' },
                            { label: 'Excused', value: attendance.summary.excused, color: '#1e40af', bg: '#eff6ff' },
                          ].map(item => (
                            <div key={item.label} style={{ background: item.bg, borderRadius: '8px', padding: '0.625rem', textAlign: 'center' }}>
                              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: item.color }}>{item.value}</p>
                              <p style={{ fontSize: '0.72rem', color: item.color, fontWeight: 500 }}>{item.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {attendance.records?.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>No attendance records yet.</p>
                      </div>
                    ) : (
                      <div style={{ maxHeight: 400, overflowY: 'auto' as const }}>
                        {attendance.records?.map((r: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 1.25rem', borderTop: '1px solid #e5e5e0' }}>
                            <span style={{ fontSize: '0.875rem', color: '#1a1a18' }}>{new Date(r.date).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {r.remark && <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{r.remark}</span>}
                              <span style={{ padding: '0.2rem 0.75rem', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: r.status === 'present' ? '#e8f5ee' : r.status === 'absent' ? '#fef2f2' : r.status === 'late' ? '#fffbeb' : '#eff6ff', color: r.status === 'present' ? '#0f4a32' : r.status === 'absent' ? '#dc2626' : r.status === 'late' ? '#d97706' : '#1e40af' }}>
                                {r.status.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Fees section */}
                {activeSection === 'fees' && fees && !sectionLoading && (
                  <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e5e5e0' }}>
                      <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.75rem' }}>Fee Statement</p>
                      {fees.summary && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                          {[
                            { label: 'Total Fees', value: formatAmount(fees.summary.totalFees), color: '#1a1a18', bg: '#f7f7f5' },
                            { label: 'Amount Paid', value: formatAmount(fees.summary.totalPaid), color: '#1a6b4a', bg: '#e8f5ee' },
                            { label: 'Balance', value: formatAmount(fees.summary.balance), color: fees.summary.balance > 0 ? '#dc2626' : '#1a6b4a', bg: fees.summary.balance > 0 ? '#fef2f2' : '#e8f5ee' },
                          ].map(item => (
                            <div key={item.label} style={{ background: item.bg, borderRadius: '10px', padding: '0.875rem', textAlign: 'center' }}>
                              <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.375rem' }}>{item.label}</p>
                              <p style={{ fontSize: '1rem', fontWeight: 700, color: item.color }}>{item.value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Fee breakdown */}
                    {fees.structures?.map((f: any, i: number) => (
                      <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0' }}>
                        <div>
                          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{f.name}</p>
                          <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.1rem' }}>{f.is_mandatory ? 'Mandatory' : 'Optional'}</p>
                        </div>
                        <div style={{ textAlign: 'right' as const }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: f.balance > 0 ? '#dc2626' : '#1a6b4a' }}>
                            {f.balance > 0 ? `Owing: ${formatAmount(f.balance)}` : '✓ Paid'}
                          </p>
                          <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Paid: {formatAmount(f.totalPaid)} of {formatAmount(f.amount)}</p>
                        </div>
                      </div>
                    ))}
                    {/* Payment history */}
                    {fees.payments?.length > 0 && (
                      <div style={{ borderTop: '2px solid #e5e5e0' }}>
                        <p style={{ padding: '0.75rem 1.25rem', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: '#f7f7f5' }}>Payment History</p>
                        {fees.payments.map((p: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 1.25rem', borderTop: '1px solid #e5e5e0' }}>
                            <div>
                              <p style={{ fontSize: '0.825rem', fontWeight: 500, color: '#1a1a18' }}>{p.fee_name}</p>
                              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{new Date(p.payment_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} · {p.payment_method.replace('_', ' ')}</p>
                            </div>
                            <div style={{ textAlign: 'right' as const }}>
                              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a6b4a' }}>{formatAmount(p.amount_paid)}</p>
                              <p style={{ fontSize: '0.68rem', color: '#a0a09a' }}>Rcpt: {p.receipt_number}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Announcements */}
        {announcements.length > 0 && (
          <div style={{ marginTop: '1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.875rem' }}>📢 Announcements</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {announcements.map(a => (
                <div key={a.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{a.title}</p>
                    <p style={{ fontSize: '0.72rem', color: '#a0a09a', flexShrink: 0, marginLeft: '1rem' }}>
                      {new Date(a.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <p style={{ fontSize: '0.825rem', color: '#3a3a36', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>{a.body}</p>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.5rem' }}>From: {a.posted_by_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}