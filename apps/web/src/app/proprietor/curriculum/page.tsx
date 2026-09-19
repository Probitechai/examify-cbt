'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { CLASS_LEVELS } from '@/lib/classLevels'

const API = process.env.NEXT_PUBLIC_API_URL
const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }
const lbl = { fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

export default function ProprietorCurriculumPage() {
  const router = useRouter()
  const [view, setView] = useState<'scheme' | 'coverage'>('scheme')
  const [sessions, setSessions] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [subjects, setSubjects] = useState<any[]>([])
  const [selectedSubject, setSelectedSubject] = useState('')
  const [scheme, setScheme] = useState<any[]>([])
  const [coverage, setCoverage] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => { loadSessions() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
  useEffect(() => { loadSubjects() }, [classLevel])

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
  async function loadSubjects() {
    const res = await apiFetch(`${API}/curriculum/subjects?classLevel=${classLevel}`)
    const data = await res.json()
    setSubjects(data.subjects ?? [])
  }
  async function loadScheme() {
    if (!selectedSubject || !selectedTerm) return
    setLoading(true)
    const res = await apiFetch(`${API}/curriculum/scheme?subjectId=${selectedSubject}&termId=${selectedTerm}&classLevel=${classLevel}`)
    const data = await res.json()
    setScheme(data.scheme ?? [])
    setLoading(false)
  }
  async function loadCoverage() {
    if (!selectedTerm) return
    setLoading(true)
    const res = await apiFetch(`${API}/curriculum/coverage?termId=${selectedTerm}&classLevel=${classLevel}`)
    const data = await res.json()
    setCoverage(data.coverage ?? [])
    setLoading(false)
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 900 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Curriculum</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of the scheme of work and coverage progress.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['scheme', 'coverage'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1.5px solid #e5e5e0', background: view === v ? '#1a6b4a' : 'white', color: view === v ? 'white' : '#6b6b65', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>
            {v === 'scheme' ? '📋 Scheme of Work' : '📊 Coverage'}
          </button>
        ))}
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: view === 'scheme' ? 'repeat(3, 1fr) auto' : 'repeat(2, 1fr) auto', gap: '1rem', alignItems: 'end' }}>
        <div><label style={lbl}>Term</label>
          <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
            <option value="">Select…</option>
            {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
          </select></div>
        <div><label style={lbl}>Class</label>
          <select style={sel} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
            {CLASS_LEVELS.map((c: string) => <option key={c}>{c}</option>)}
          </select></div>
        {view === 'scheme' && (
          <div><label style={lbl}>Subject</label>
            <select style={sel} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              <option value="">Select…</option>
              {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
        )}
        <button onClick={view === 'scheme' ? loadScheme : loadCoverage} disabled={loading || !selectedTerm}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {view === 'scheme' ? (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' }}>
          {scheme.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65', background: 'white', borderRadius: '14px', border: '1px solid #e5e5e0' }}>No scheme entries loaded yet.</p>
          ) : scheme.map((s: any) => (
            <div key={s.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '0.875rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.625rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af', marginRight: '0.625rem' }}>Week {s.week_number}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{s.topic}</span>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.625rem', borderRadius: 20, background: s.delivery_status === 'delivered' ? '#e8f5ee' : '#f7f7f5', color: s.delivery_status === 'delivered' ? '#0f4a32' : '#a0a09a' }}>
                {s.delivery_status ? s.delivery_status.replace('_', ' ') : 'Not recorded'}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Subject</span><span>Total topics</span><span>Coverage</span>
          </div>
          {coverage.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No coverage data loaded yet.</p>
          ) : coverage.map((c: any) => (
            <div key={c.subject_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.875rem' }}>
              <span>{c.subject_name}</span>
              <span style={{ color: '#6b6b65' }}>{c.total_topics}</span>
              <span style={{ fontWeight: 700, color: Number(c.coverage_pct ?? 0) >= 80 ? '#1a6b4a' : Number(c.coverage_pct ?? 0) >= 50 ? '#d97706' : '#dc2626' }}>{c.coverage_pct ?? 0}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}