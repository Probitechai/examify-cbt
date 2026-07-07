'use client'
import { useState, useEffect } from 'react'

interface Session { id: string; name: string; is_active: boolean }
interface Term { id: string; name: string; is_active: boolean }
interface StudentAttendance {
  id: string
  full_name: string
  admission_no: string
  class_arm: string
  status: 'present' | 'absent' | 'late' | 'excused' | null
  remark: string | null
  record_id: string | null
}
interface AttendanceSummary {
  id: string
  full_name: string
  admission_no: string
  present: number
  absent: number
  late: number
  excused: number
  total_days: number
}

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']
const CLASS_ARMS = ['A','B','C','D','E','Science','Arts','Commercial','Social Science']
const STATUS_CONFIG = {
  present: { label: 'Present', color: '#0f4a32', bg: '#e8f5ee', icon: '✓' },
  absent:  { label: 'Absent',  color: '#dc2626', bg: '#fef2f2', icon: '✗' },
  late:    { label: 'Late',    color: '#d97706', bg: '#fffbeb', icon: '⏰' },
  excused: { label: 'Excused', color: '#1e40af', bg: '#eff6ff', icon: '📋' },
}

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

function today() {
  return new Date().toISOString().split('T')[0]
}

export default function AttendancePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [date, setDate] = useState(today())
  const [activeTab, setActiveTab] = useState<'mark' | 'summary'>('mark')
  const [students, setStudents] = useState<StudentAttendance[]>([])
  const [summary, setSummary] = useState<AttendanceSummary[]>([])
  const [localStatus, setLocalStatus] = useState<Record<string, { status: StudentAttendance['status']; remark: string }>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [alreadyMarked, setAlreadyMarked] = useState(false)
  const [error, setError] = useState('')

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

  async function loadAttendance() {
    if (!selectedTerm || !classLevel || !date) { setError('Please select a term, class and date'); return }
    setLoading(true); setError(''); setStudents([])
    try {
      const params = new URLSearchParams({ termId: selectedTerm, date, classLevel })
      if (classArm) params.append('classArm', classArm)
      const res = await fetch(`${API}/attendance?${params}`, { headers: hdrs() })
      const data = await res.json()
      const list = data.students ?? []
      setStudents(list)
      setAlreadyMarked(data.alreadyMarked ?? false)

      // Initialize local status
      const statusMap: Record<string, { status: StudentAttendance['status']; remark: string }> = {}
      for (const s of list) {
        statusMap[s.id] = { status: s.status ?? 'present', remark: s.remark ?? '' }
      }
      setLocalStatus(statusMap)
    } catch { setError('Failed to load students') } finally { setLoading(false) }
  }

  async function loadSummary() {
    if (!selectedTerm || !classLevel) { setError('Please select a term and class'); return }
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ termId: selectedTerm, classLevel })
      if (classArm) params.append('classArm', classArm)
      const res = await fetch(`${API}/attendance/summary?${params}`, { headers: hdrs() })
      const data = await res.json()
      setSummary(data.summary ?? [])
    } catch { setError('Failed to load summary') } finally { setLoading(false) }
  }

  function markAll(status: StudentAttendance['status']) {
    const updated: Record<string, { status: StudentAttendance['status']; remark: string }> = {}
    for (const s of students) {
      updated[s.id] = { status, remark: localStatus[s.id]?.remark ?? '' }
    }
    setLocalStatus(updated)
  }

  async function handleSave() {
    if (!selectedTerm || students.length === 0) return
    setSaving(true); setError('')
    try {
      const records = students.map(s => ({
        studentId: s.id,
        status: localStatus[s.id]?.status ?? 'present',
        remark: localStatus[s.id]?.remark || undefined,
      }))
      const res = await fetch(`${API}/attendance`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ termId: selectedTerm, date, classLevel, classArm: classArm || undefined, records })
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true); setAlreadyMarked(true)
      setTimeout(() => setSaved(false), 3000)
    } catch { setError('Failed to save attendance') } finally { setSaving(false) }
  }

  const presentCount = Object.values(localStatus).filter(s => s.status === 'present').length
  const absentCount = Object.values(localStatus).filter(s => s.status === 'absent').length
  const lateCount = Object.values(localStatus).filter(s => s.status === 'late').length
  const excusedCount = Object.values(localStatus).filter(s => s.status === 'excused').length

  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' as const, width: '100%' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Attendance</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Mark daily attendance and view attendance summaries.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
        {([{ key: 'mark', label: '✏️ Mark Attendance' }, { key: 'summary', label: '📊 Attendance Summary' }] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.75rem 1.5rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65', transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'mark' ? 'repeat(5, 1fr) auto' : 'repeat(4, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
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
          {activeTab === 'mark' && (
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Date</label>
              <input style={sel} type="date" value={date} onChange={e => setDate(e.target.value)} max={today()} />
            </div>
          )}
          <div>
            <button
              onClick={activeTab === 'mark' ? loadAttendance : loadSummary}
              disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const, width: '100%' }}>
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {saved && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ Attendance saved successfully!</div>}

      {/* MARK ATTENDANCE TAB */}
      {activeTab === 'mark' && students.length > 0 && (
        <>
          {/* Quick stats + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <span key={key} style={{ padding: '0.3rem 0.75rem', borderRadius: 20, background: cfg.bg, color: cfg.color, fontSize: '0.78rem', fontWeight: 600 }}>
                  {cfg.icon} {cfg.label}: {key === 'present' ? presentCount : key === 'absent' ? absentCount : key === 'late' ? lateCount : excusedCount}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {alreadyMarked && <span style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 500 }}>⚠️ Already marked — editing</span>}
              <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>Mark all:</span>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <button key={key} onClick={() => markAll(key as any)}
                  style={{ padding: '0.3rem 0.75rem', background: cfg.bg, border: `1.5px solid ${cfg.color}`, borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, color: cfg.color, cursor: 'pointer' }}>
                  {cfg.icon} All {cfg.label}
                </button>
              ))}
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : '💾 Save'}
              </button>
            </div>
          </div>

          {/* Student list */}
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 1fr 300px 1fr', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
              <span>#</span><span>Student</span><span>Adm. No.</span><span>Arm</span><span>Status</span><span>Remark</span>
            </div>
            {students.map((s, i) => {
              const current = localStatus[s.id]
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 1fr 300px 1fr', gap: '1rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#a0a09a', fontWeight: 600 }}>{i + 1}</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{s.full_name}</span>
                  <span style={{ fontSize: '0.8rem', color: '#6b6b65' }}>{s.admission_no ?? '—'}</span>
                  <span style={{ fontSize: '0.8rem', color: '#6b6b65' }}>{s.class_arm ?? '—'}</span>
                  <div style={{ display: 'flex', gap: '0.375rem' }}>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <button key={key} onClick={() => setLocalStatus(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: key as any } }))}
                        style={{ flex: 1, padding: '0.375rem 0.25rem', border: `1.5px solid ${current?.status === key ? cfg.color : '#e5e5e0'}`, borderRadius: '6px', background: current?.status === key ? cfg.bg : 'white', fontSize: '0.72rem', fontWeight: 600, color: current?.status === key ? cfg.color : '#a0a09a', cursor: 'pointer', transition: 'all 0.1s' }}>
                        {cfg.icon}
                      </button>
                    ))}
                  </div>
                  <input
                    style={{ padding: '0.375rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.78rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }}
                    value={current?.remark ?? ''}
                    onChange={e => setLocalStatus(prev => ({ ...prev, [s.id]: { ...prev[s.id], remark: e.target.value } }))}
                    placeholder="Optional remark…"
                  />
                </div>
              )
            })}
          </div>

          {/* Bottom save */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '0.75rem 2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : '💾 Save attendance'}
            </button>
          </div>
        </>
      )}

      {/* SUMMARY TAB */}
      {activeTab === 'summary' && summary.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 80px 80px 80px 80px 80px 100px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>#</span><span>Student</span><span>Adm. No.</span>
            <span style={{ textAlign: 'center' as const, color: '#0f4a32' }}>Present</span>
            <span style={{ textAlign: 'center' as const, color: '#dc2626' }}>Absent</span>
            <span style={{ textAlign: 'center' as const, color: '#d97706' }}>Late</span>
            <span style={{ textAlign: 'center' as const, color: '#1e40af' }}>Excused</span>
            <span style={{ textAlign: 'center' as const }}>Total</span>
            <span style={{ textAlign: 'center' as const }}>Attendance %</span>
          </div>
          {summary.map((s, i) => {
            const attendance = s.total_days > 0 ? Math.round((Number(s.present) / Number(s.total_days)) * 100) : 0
            const attendanceColor = attendance >= 75 ? '#1a6b4a' : attendance >= 50 ? '#d97706' : '#dc2626'
            return (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 80px 80px 80px 80px 80px 100px', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#a0a09a', fontWeight: 600 }}>{i + 1}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{s.full_name}</span>
                <span style={{ fontSize: '0.8rem', color: '#6b6b65' }}>{s.admission_no ?? '—'}</span>
                <span style={{ textAlign: 'center' as const, fontWeight: 600, color: '#0f4a32' }}>{s.present}</span>
                <span style={{ textAlign: 'center' as const, fontWeight: 600, color: '#dc2626' }}>{s.absent}</span>
                <span style={{ textAlign: 'center' as const, fontWeight: 600, color: '#d97706' }}>{s.late}</span>
                <span style={{ textAlign: 'center' as const, fontWeight: 600, color: '#1e40af' }}>{s.excused}</span>
                <span style={{ textAlign: 'center' as const, color: '#6b6b65' }}>{s.total_days}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, height: 6, background: '#e5e5e0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${attendance}%`, height: '100%', background: attendanceColor, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: attendanceColor, minWidth: 32 }}>{attendance}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && students.length === 0 && summary.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>
            {activeTab === 'mark' ? 'Select filters and click Load' : 'Select filters and click Load'}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>
            {activeTab === 'mark' ? 'Mark present, absent, late or excused for each student.' : 'View attendance summary for the selected class and term.'}
          </p>
        </div>
      )}
    </div>
  )
}