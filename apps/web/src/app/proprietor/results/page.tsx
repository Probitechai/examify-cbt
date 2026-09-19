'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { CLASS_LEVELS } from '@/lib/classLevels'
import { CLASS_ARMS } from '@/lib/classArms'

const API = process.env.NEXT_PUBLIC_API_URL
const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }
const lbl = { fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

export default function ProprietorResultsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [results, setResults] = useState<any[]>([])
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
  async function loadResults() {
    if (!selectedTerm) return
    setLoading(true)
    const params = new URLSearchParams({ termId: selectedTerm, classLevel })
    if (classArm) params.append('classArm', classArm)
    const res = await apiFetch(`${API}/results?${params}`)
    const data = await res.json()
    setResults(data.results ?? [])
    setLoading(false); setLoaded(true)
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Results</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of student results by term and class.</p>

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
        <button onClick={loadResults} disabled={loading || !selectedTerm}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {loaded && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 80px 80px 60px 100px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Student</span><span>Class</span><span>Subject</span><span>CA</span><span>Exam</span><span>Total</span><span>Grade</span><span>Status</span>
          </div>
          {results.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No results found for this selection.</p>
          ) : results.map(r => (
            <div key={`${r.student_id}-${r.subject}`} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 80px 80px 80px 60px 100px', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.875rem' }}>
              <span>{r.student_name}</span>
              <span style={{ color: '#6b6b65' }}>{r.class_level} {r.class_arm}</span>
              <span style={{ color: '#6b6b65' }}>{r.subject}</span>
              <span>{r.ca_score ?? '—'}</span>
              <span>{r.exam_score ?? '—'}</span>
              <span style={{ fontWeight: 600 }}>{r.total_score ?? '—'}</span>
              <span style={{ fontWeight: 700, color: '#1a6b4a' }}>{r.grade ?? '—'}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: r.approved_at ? '#e8f5ee' : '#fffbeb', color: r.approved_at ? '#0f4a32' : '#92400e', width: 'fit-content' }}>
                {r.approved_at ? 'Approved' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}