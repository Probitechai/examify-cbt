'use client'
import { useState, useEffect } from 'react'

interface Session { id: string; name: string; is_active: boolean }
interface Term { id: string; name: string; is_active: boolean }
interface TimetableEntry {
  id: string
  day: string
  period: number
  subject: string
  teacher_name: string | null
  start_time: string | null
  end_time: string | null
  venue: string | null
  class_arm: string | null
}

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday']
const PERIODS = [1,2,3,4,5,6,7,8]
const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']
const CLASS_ARMS = ['A','B','C','D','E','Science','Arts','Commercial','Social Science']
const SUBJECTS = ['Agricultural Science','Biology','Chemistry','Christian Religious Studies','Civic Education','Commerce','Computer Science','Economics','English Language','Financial Accounting','French','Further Mathematics','Geography','Government','History','Home Economics','Islamic Religious Studies','Literature in English','Mathematics','Music','Physical Education','Physics','Technical Drawing','Assembly','Break','Lunch','Games','Library']

const DAY_COLORS: Record<string, string> = {
  Monday: '#1a6b4a', Tuesday: '#1e40af', Wednesday: '#7e22ce',
  Thursday: '#d97706', Friday: '#dc2626'
}
const DAY_BG: Record<string, string> = {
  Monday: '#e8f5ee', Tuesday: '#eff6ff', Wednesday: '#f5f3ff',
  Thursday: '#fffbeb', Friday: '#fef2f2'
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

export default function TimetablePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('A')
  const [entries, setEntries] = useState<TimetableEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  // Add entry form
  const [showForm, setShowForm] = useState(false)
  const [formDay, setFormDay] = useState('Monday')
  const [formPeriod, setFormPeriod] = useState(1)
  const [formSubject, setFormSubject] = useState('Mathematics')
  const [formTeacher, setFormTeacher] = useState('')
  const [formStart, setFormStart] = useState('08:00')
  const [formEnd, setFormEnd] = useState('08:40')
  const [formVenue, setFormVenue] = useState('')
  const [saving, setSaving] = useState(false)
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

  async function loadTimetable() {
    if (!selectedTerm || !classLevel) { setError('Please select a term and class'); return }
    setLoading(true); setError(''); setEntries([])
    try {
      const params = new URLSearchParams({ termId: selectedTerm, classLevel })
      if (classArm) params.append('classArm', classArm)
      const res = await fetch(`${API}/timetable?${params}`, { headers: hdrs() })
      const data = await res.json()
      setEntries(data.entries ?? [])
    } catch { setError('Failed to load timetable') } finally { setLoading(false) }
  }

  async function handleAddEntry() {
    if (!selectedTerm || !classLevel || !formSubject) { setError('All required fields must be filled'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/timetable`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          termId: selectedTerm,
          classLevel,
          classArm: classArm || undefined,
          day: formDay,
          period: formPeriod,
          subject: formSubject,
          teacherName: formTeacher || undefined,
          startTime: formStart || undefined,
          endTime: formEnd || undefined,
          venue: formVenue || undefined,
        })
      })
      if (!res.ok) throw new Error('Failed to save')
      setSuccess('Entry saved!'); setTimeout(() => setSuccess(''), 2000)
      setShowForm(false)
      loadTimetable()
    } catch { setError('Failed to save entry') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await fetch(`${API}/timetable/${id}`, { method: 'DELETE', headers: hdrs() })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  async function handleClearAll() {
    if (!window.confirm(`Clear entire timetable for ${classLevel} ${classArm}?`)) return
    const params = new URLSearchParams({ termId: selectedTerm, classLevel })
    if (classArm) params.append('classArm', classArm)
    await fetch(`${API}/timetable?${params}`, { method: 'DELETE', headers: hdrs() })
    setEntries([])
  }

  // Build grid structure
  function getEntry(day: string, period: number) {
    return entries.find(e => e.day === day && e.period === period)
  }

  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }
  const inp = { ...sel, cursor: 'text' as const }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <style>{`@media print { .no-print { display: none !important; } body * { visibility: hidden; } #timetable-print, #timetable-print * { visibility: visible; } #timetable-print { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>

      <div className="no-print" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Class Timetable</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Build and manage weekly class timetables for each class.</p>
      </div>

      {/* Filter panel */}
      <div className="no-print" style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
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
          <button onClick={loadTimetable} disabled={loading}
            style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Add entry form */}
      {showForm && (
        <div className="no-print" style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Add / Edit Timetable Entry</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Day</label>
              <select style={sel} value={formDay} onChange={e => setFormDay(e.target.value)}>
                {DAYS.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Period</label>
              <select style={sel} value={formPeriod} onChange={e => setFormPeriod(Number(e.target.value))}>
                {PERIODS.map(p => <option key={p} value={p}>Period {p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Subject</label>
              <select style={sel} value={formSubject} onChange={e => setFormSubject(e.target.value)}>
                {SUBJECTS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Teacher name (optional)</label>
              <input style={inp} value={formTeacher} onChange={e => setFormTeacher(e.target.value)} placeholder="e.g. Mr. Adewale" />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Start time</label>
              <input style={inp} type="time" value={formStart} onChange={e => setFormStart(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>End time</label>
              <input style={inp} type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Venue (optional)</label>
            <input style={{ ...inp, width: '33%' }} value={formVenue} onChange={e => setFormVenue(e.target.value)} placeholder="e.g. Room 12, Lab 2" />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleAddEntry} disabled={saving}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : '💾 Save entry'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding: '0.625rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Timetable display */}
      {entries.length > 0 || loading ? (
        <>
          {/* Actions bar */}
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>{classLevel} {classArm} Timetable</p>
              <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>{entries.length} periods scheduled</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setView(view === 'grid' ? 'list' : 'grid')}
                style={{ padding: '0.5rem 1rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#1a1a18', cursor: 'pointer' }}>
                {view === 'grid' ? '☰ List view' : '⊞ Grid view'}
              </button>
              <button onClick={() => setShowForm(true)}
                style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                + Add entry
              </button>
              <button onClick={() => window.print()}
                style={{ padding: '0.5rem 1rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                🖨️ Print
              </button>
              <button onClick={handleClearAll}
                style={{ padding: '0.5rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.825rem', color: '#dc2626', cursor: 'pointer' }}>
                🗑️ Clear all
              </button>
            </div>
          </div>

          <div id="timetable-print">
            {/* Print header */}
            <div style={{ textAlign: 'center', marginBottom: '1rem', display: 'none' }} className="print-only">
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{classLevel} {classArm} — Weekly Timetable</h2>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>{terms.find(t => t.id === selectedTerm)?.name}</p>
            </div>

            {view === 'grid' ? (
              /* Grid view */
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.75rem', background: '#f7f7f5', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textAlign: 'center', borderBottom: '2px solid #e5e5e0', width: 80 }}>Period</th>
                      {DAYS.map(day => (
                        <th key={day} style={{ padding: '0.75rem', background: DAY_BG[day], fontSize: '0.825rem', fontWeight: 700, color: DAY_COLORS[day], textAlign: 'center', borderBottom: `2px solid ${DAY_COLORS[day]}`, borderLeft: '1px solid #e5e5e0' }}>
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(period => (
                      <tr key={period} style={{ borderBottom: '1px solid #e5e5e0' }}>
                        <td style={{ padding: '0.625rem', textAlign: 'center', background: '#f7f7f5', fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65' }}>
                          P{period}
                        </td>
                        {DAYS.map(day => {
                          const entry = getEntry(day, period)
                          return (
                            <td key={day} style={{ padding: '0.5rem', borderLeft: '1px solid #e5e5e0', verticalAlign: 'top', minWidth: 120, minHeight: 60 }}>
                              {entry ? (
                                <div style={{ background: DAY_BG[day], borderRadius: '8px', padding: '0.5rem 0.625rem', position: 'relative' as const }}>
                                  <p style={{ fontSize: '0.825rem', fontWeight: 600, color: DAY_COLORS[day], marginBottom: '0.2rem' }}>{entry.subject}</p>
                                  {entry.teacher_name && <p style={{ fontSize: '0.68rem', color: '#6b6b65' }}>{entry.teacher_name}</p>}
                                  {(entry.start_time || entry.end_time) && (
                                    <p style={{ fontSize: '0.65rem', color: '#a0a09a', marginTop: '0.1rem' }}>{entry.start_time}{entry.end_time ? ` - ${entry.end_time}` : ''}</p>
                                  )}
                                  {entry.venue && <p style={{ fontSize: '0.65rem', color: '#a0a09a' }}>📍 {entry.venue}</p>}
                                  <button onClick={() => handleDelete(entry.id)}
                                    className="no-print"
                                    style={{ position: 'absolute' as const, top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: 'rgba(220,38,38,0.1)', border: 'none', cursor: 'pointer', fontSize: '0.6rem', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <div className="no-print"
                                  onClick={() => { setFormDay(day); setFormPeriod(period); setShowForm(true) }}
                                  style={{ height: 52, borderRadius: '8px', border: '1.5px dashed #e5e5e0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d0d0c8', fontSize: '0.72rem', transition: 'all 0.1s' }}
                                  onMouseEnter={e => { (e.target as HTMLElement).style.background = '#f7f7f5'; (e.target as HTMLElement).style.borderColor = '#1a6b4a' }}
                                  onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.borderColor = '#e5e5e0' }}>
                                  + Add
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* List view */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {DAYS.map(day => {
                  const dayEntries = entries.filter(e => e.day === day).sort((a, b) => a.period - b.period)
                  if (dayEntries.length === 0) return null
                  return (
                    <div key={day} style={{ background: 'white', border: `1.5px solid ${DAY_COLORS[day]}`, borderRadius: '14px', overflow: 'hidden' }}>
                      <div style={{ background: DAY_BG[day], padding: '0.75rem 1.25rem', borderBottom: `1px solid ${DAY_COLORS[day]}` }}>
                        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: DAY_COLORS[day] }}>{day}</p>
                      </div>
                      {dayEntries.map(entry => (
                        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', borderTop: '1px solid #f0f0ee' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: DAY_COLORS[day], background: DAY_BG[day], padding: '0.2rem 0.5rem', borderRadius: 20 }}>P{entry.period}</span>
                            <div>
                              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{entry.subject}</p>
                              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
                                {entry.teacher_name && `${entry.teacher_name} · `}
                                {entry.start_time && entry.end_time && `${entry.start_time} - ${entry.end_time} · `}
                                {entry.venue && `📍 ${entry.venue}`}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => handleDelete(entry.id)}
                            className="no-print"
                            style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer' }}>
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : !loading && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📅</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No timetable yet</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>Select filters and click Load, or start adding entries directly.</p>
          <button onClick={() => { if (selectedTerm) setShowForm(true); else setError('Please select a session and term first') }}
            style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            + Add first entry
          </button>
        </div>
      )}
    </div>
  )
}