'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { CLASS_LEVELS } from '@/lib/classLevels'
import { CLASS_ARMS } from '@/lib/classArms'

const API = process.env.NEXT_PUBLIC_API_URL
const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }
const lbl = { fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  present: { color: '#0f4a32', bg: '#e8f5ee' }, absent: { color: '#dc2626', bg: '#fef2f2' },
  late: { color: '#d97706', bg: '#fffbeb' }, excused: { color: '#1e40af', bg: '#eff6ff' },
}

export default function ProprietorAttendancePage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => { loadSessions() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])

  async function loadSessions() {
    const res = await apiFetch(`${API}/sessions`)
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: any) => s.is_active)
    if (active) setSelectedSession(active.id)
  }
  async function loadTerms(sessionId: string) {
    const res = await apiFetch(`${API}/sessions/${sessionId}/terms`)
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }
  async function loadRecords() {
    if (!selectedTerm) return
    setLoading(true)
    const params = new URLSearchParams({ termId: selectedTerm, classLevel })
    if (classArm) params.append('classArm', classArm)
    const res = await apiFetch(`${API}/attendance/history?${params}`)
    const data = await res.json()
    setRecords(data.records ?? [])
    setLoading(false); setLoaded(true)
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Attendance</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of daily attendance records for the whole term.</p>

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: '1rem', alignItems: 'end' }}>
        <div><label style={lbl}>Term</label>
          <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
            <option value="">Select…</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
          </select></div>
        <div><label style={lbl}>Class</label>
          <select style={sel} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
            {CLASS_LEVELS.map((c: string) => <option key={c}>{c}</option>)}
          </select></div>
        <div><label style={lbl}>Arm</label>
          <select style={sel} value={classArm} onChange={e => setClassArm(e.target.value)}>
            <option value="">All arms</option>
            {CLASS_ARMS.map((a: string) => <option key={a}>{a}</option>)}
          </select></div>
        <button onClick={loadRecords} disabled={loading || !selectedTerm}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {loaded && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden', maxHeight: 600, overflowY: 'auto' as const }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 2fr 100px 2fr', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0', position: 'sticky' as const, top: 0 }}>
            <span>Date</span><span>Student</span><span>Status</span><span>Remark</span>
          </div>
          {records.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No attendance records found for this selection.</p>
          ) : records.map((r, i) => {
            const cfg = STATUS_COLORS[r.status] ?? { color: '#6b6b65', bg: '#f7f7f5' }
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 2fr 100px 2fr', gap: '0.75rem', padding: '0.625rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.825rem' }}>
                <span style={{ color: '#6b6b65' }}>{new Date(r.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
                <span>{r.student_name}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color, width: 'fit-content', textTransform: 'capitalize' as const }}>{r.status}</span>
                <span style={{ color: '#6b6b65' }}>{r.remark ?? '—'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}