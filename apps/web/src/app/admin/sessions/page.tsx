'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Session {
  id: string
  name: string
  is_active: boolean
  term_count: number
  created_at: string
}

interface Term {
  id: string
  name: string
  term_number: number
  start_date: string
  end_date: string
  is_active: boolean
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

export default function SessionsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [terms, setTerms] = useState<Term[]>([])
  const [termsLoading, setTermsLoading] = useState(false)
  const [showSessionForm, setShowSessionForm] = useState(false)
  const [showTermForm, setShowTermForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Session form state
  const [sessionName, setSessionName] = useState('')
  const [sessionActive, setSessionActive] = useState(false)

  // Term form state
  const [termName, setTermName] = useState('')
  const [termNumber, setTermNumber] = useState(1)
  const [termStart, setTermStart] = useState('')
  const [termEnd, setTermEnd] = useState('')
  const [termActive, setTermActive] = useState(false)

  useEffect(() => { loadSessions() }, [])

  async function loadSessions() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/sessions`, { headers: hdrs() })
      const data = await res.json()
      setSessions(data.sessions ?? [])
    } catch {}
    setLoading(false)
  }

  async function loadTerms(sessionId: string) {
    setTermsLoading(true)
    try {
      const res = await fetch(`${API}/sessions/${sessionId}/terms`, { headers: hdrs() })
      const data = await res.json()
      setTerms(data.terms ?? [])
    } catch {}
    setTermsLoading(false)
  }

  async function handleCreateSession() {
    if (!sessionName.trim()) { setError('Session name is required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/sessions`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ name: sessionName.trim(), isActive: sessionActive })
      })
      if (!res.ok) throw new Error('Failed to create session')
      setSessionName(''); setSessionActive(false); setShowSessionForm(false)
      loadSessions()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleActivateSession(id: string) {
    await fetch(`${API}/sessions/${id}/activate`, { method: 'PATCH', headers: hdrs(), body: '{}' })
    loadSessions()
    if (selectedSession?.id === id) setSelectedSession(prev => prev ? { ...prev, is_active: true } : null)
  }

  async function handleDeleteSession(id: string, name: string) {
    if (!window.confirm(`Delete session "${name}"? All terms in this session will also be deleted.`)) return
    await fetch(`${API}/sessions/${id}`, { method: 'DELETE', headers: hdrs() })
    if (selectedSession?.id === id) { setSelectedSession(null); setTerms([]) }
    loadSessions()
  }

  async function handleCreateTerm() {
    if (!termName.trim() || !termStart || !termEnd) { setError('All term fields are required'); return }
    if (!selectedSession) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/sessions/${selectedSession.id}/terms`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ name: termName.trim(), termNumber, startDate: termStart, endDate: termEnd, isActive: termActive })
      })
      if (!res.ok) throw new Error('Failed to create term')
      setTermName(''); setTermStart(''); setTermEnd(''); setTermActive(false); setShowTermForm(false)
      loadTerms(selectedSession.id)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function handleActivateTerm(id: string) {
    await fetch(`${API}/terms/${id}/activate`, { method: 'PATCH', headers: hdrs(), body: '{}' })
    if (selectedSession) loadTerms(selectedSession.id)
  }

  async function handleDeleteTerm(id: string, name: string) {
    if (!window.confirm(`Delete term "${name}"?`)) return
    await fetch(`${API}/terms/${id}`, { method: 'DELETE', headers: hdrs() })
    if (selectedSession) loadTerms(selectedSession.id)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
  const lbl = { fontSize: '0.825rem', fontWeight: 500 as const, color: '#1a1a18', display: 'block' as const, marginBottom: '0.4rem' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Academic Sessions</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Manage school years and terms. Set one session and one term as active at a time.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

        {/* Left panel — Sessions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Sessions</h2>
            <button onClick={() => { setShowSessionForm(true); setError('') }}
              style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + New session
            </button>
          </div>

          {showSessionForm && (
            <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={lbl}>Session name (e.g. 2026/2027)</label>
                <input style={inp} value={sessionName} onChange={e => setSessionName(e.target.value)} placeholder="e.g. 2026/2027" autoFocus />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input type="checkbox" id="sessionActive" checked={sessionActive} onChange={e => setSessionActive(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                <label htmlFor="sessionActive" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Set as active session</label>
              </div>
              {error && <p style={{ fontSize: '0.825rem', color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleCreateSession} disabled={saving}
                  style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save session'}
                </button>
                <button onClick={() => { setShowSessionForm(false); setError('') }}
                  style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📅</p>
              <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>No sessions yet</p>
              <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Create your first academic session above.</p>
            </div>
          ) : sessions.map(s => (
            <div key={s.id}
              onClick={() => { setSelectedSession(s); loadTerms(s.id); setShowTermForm(false) }}
              style={{ background: 'white', border: `1.5px solid ${selectedSession?.id === s.id ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.625rem', cursor: 'pointer', transition: 'border-color 0.15s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{s.name}</span>
                    {s.is_active && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: '#e8f5ee', color: '#0f4a32' }}>ACTIVE</span>}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{s.term_count} term{Number(s.term_count) !== 1 ? 's' : ''}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.375rem' }} onClick={e => e.stopPropagation()}>
                  {!s.is_active && (
                    <button onClick={() => handleActivateSession(s.id)}
                      style={{ padding: '0.3rem 0.625rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer' }}>
                      Set active
                    </button>
                  )}
                  <button onClick={() => handleDeleteSession(s.id, s.name)}
                    style={{ padding: '0.3rem 0.625rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right panel — Terms */}
        <div>
          {!selectedSession ? (
            <div style={{ background: '#f7f7f5', border: '1.5px dashed #d0d0c8', borderRadius: '12px', padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👈</p>
              <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Select a session to manage its terms</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Terms — {selectedSession.name}</h2>
                  <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>Up to 3 terms per session</p>
                </div>
                {terms.length < 3 && (
                  <button onClick={() => { setShowTermForm(true); setError(''); setTermNumber(terms.length + 1) }}
                    style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                    + Add term
                  </button>
                )}
              </div>

              {showTermForm && (
                <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                    <div>
                      <label style={lbl}>Term name</label>
                      <select style={inp} value={termName} onChange={e => { setTermName(e.target.value); setTermNumber(parseInt(e.target.value.split(' ')[0] === 'First' ? '1' : e.target.value.split(' ')[0] === 'Second' ? '2' : '3')) }}>
                        <option value="">Select term…</option>
                        <option value="First Term">First Term</option>
                        <option value="Second Term">Second Term</option>
                        <option value="Third Term">Third Term</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Term number</label>
                      <select style={inp} value={termNumber} onChange={e => setTermNumber(Number(e.target.value))}>
                        <option value={1}>1st</option>
                        <option value={2}>2nd</option>
                        <option value={3}>3rd</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Start date</label>
                      <input style={inp} type="date" value={termStart} onChange={e => setTermStart(e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>End date</label>
                      <input style={inp} type="date" value={termEnd} onChange={e => setTermEnd(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                    <input type="checkbox" id="termActive" checked={termActive} onChange={e => setTermActive(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                    <label htmlFor="termActive" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Set as active term</label>
                  </div>
                  {error && <p style={{ fontSize: '0.825rem', color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={handleCreateTerm} disabled={saving}
                      style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                      {saving ? 'Saving…' : 'Save term'}
                    </button>
                    <button onClick={() => { setShowTermForm(false); setError('') }}
                      style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {termsLoading ? (
                <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Loading terms…</p>
              ) : terms.length === 0 ? (
                <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📋</p>
                  <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>No terms yet</p>
                  <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Add up to 3 terms for this session.</p>
                </div>
              ) : terms.map(t => (
                <div key={t.id} style={{ background: 'white', border: `1.5px solid ${t.is_active ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.625rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>{t.name}</span>
                        {t.is_active && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: '#e8f5ee', color: '#0f4a32' }}>ACTIVE</span>}
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>
                        {formatDate(t.start_date)} → {formatDate(t.end_date)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      {!t.is_active && (
                        <button onClick={() => handleActivateTerm(t.id)}
                          style={{ padding: '0.3rem 0.625rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer' }}>
                          Set active
                        </button>
                      )}
                      <button onClick={() => handleDeleteTerm(t.id, t.name)}
                        style={{ padding: '0.3rem 0.625rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}