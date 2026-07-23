'use client'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

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

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: '#1e40af', bg: '#eff6ff' },
  live:      { label: '🔴 Live Now', color: '#dc2626', bg: '#fef2f2' },
  ended:     { label: 'Ended', color: '#6b6b65', bg: '#f7f7f5' },
  cancelled: { label: 'Cancelled', color: '#a0a09a', bg: '#f7f7f5' },
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit'
  })
}

function isStartable(scheduledAt: string): boolean {
  const scheduled = new Date(scheduledAt)
  const now = new Date()
  const diff = scheduled.getTime() - now.getTime()
  return diff <= 15 * 60 * 1000 // within 15 minutes
}

export default function LiveClassesPage() {
  const [classes, setClasses] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showRecordingForm, setShowRecordingForm] = useState<any>(null)
  const [recordingUrl, setRecordingUrl] = useState('')
  const [recordingType, setRecordingType] = useState('youtube')
  const [savingRecording, setSavingRecording] = useState(false)

  const [createForm, setCreateForm] = useState({
    title: '', description: '', classLevel: 'SS2', classArm: '',
    subjectId: '', termId: '', scheduledAt: '', durationMins: '40'
  })

  useEffect(() => { loadInitial() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
  useEffect(() => { loadSubjects() }, [createForm.classLevel])
  useEffect(() => { loadClasses() }, [selectedClass])

  async function loadInitial() {
    try {
      const [sessionsRes] = await Promise.all([
        fetch(`${API}/sessions`, { headers: hdrs() }),
      ])
      const sessionsData = await sessionsRes.json()
      const sessionList = sessionsData.sessions ?? []
      setSessions(sessionList)
      const active = sessionList.find((s: any) => s.is_active)
      if (active) { setSelectedSession(active.id); loadTerms(active.id) }
      loadClasses()
    } catch {} finally { setLoading(false) }
  }

  async function loadTerms(sessionId: string) {
    const res = await fetch(`${API}/sessions/${sessionId}/terms`, { headers: hdrs() })
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) { setSelectedTerm(active.id); setCreateForm(f => ({ ...f, termId: active.id })) }
  }

  async function loadSubjects() {
    const cl = createForm.classLevel
    const res = await fetch(`${API}/curriculum/subjects?classLevel=${cl}`, { headers: hdrs() })
    const data = await res.json()
    setSubjects(data.subjects ?? [])
  }

  async function loadClasses() {
    setLoading(true)
    try {
      let url = `${API}/live-classes`
      if (selectedClass) url += `?classLevel=${selectedClass}`
      const res = await fetch(url, { headers: hdrs() })
      const data = await res.json()
      setClasses(data.classes ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function createClass() {
    if (!createForm.title || !createForm.classLevel || !createForm.scheduledAt) {
      setError('Title, class and scheduled time are required'); return
    }
    setCreating(true); setError('')
    try {
      const body: any = {
        title: createForm.title,
        description: createForm.description || undefined,
        classLevel: createForm.classLevel,
        classArm: createForm.classArm || undefined,
        scheduledAt: new Date(createForm.scheduledAt).toISOString(),
        durationMins: Number(createForm.durationMins),
      }
      if (createForm.subjectId) body.subjectId = createForm.subjectId
      if (createForm.termId) body.termId = createForm.termId
      const res = await fetch(`${API}/live-classes`, { method: 'POST', headers: hdrs(), body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create class')
      setShowCreateForm(false)
      setCreateForm({ title: '', description: '', classLevel: 'SS2', classArm: '', subjectId: '', termId: selectedTerm, scheduledAt: '', durationMins: '40' })
      setSuccess('Live class scheduled!'); setTimeout(() => setSuccess(''), 3000)
      loadClasses()
    } catch (e: any) { setError(e.message) } finally { setCreating(false) }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`${API}/live-classes/${id}/status`, {
      method: 'PATCH', headers: hdrs(), body: JSON.stringify({ status })
    })
    loadClasses()
  }

  async function saveRecording() {
    if (!recordingUrl) { setError('URL required'); return }
    setSavingRecording(true)
    try {
      await fetch(`${API}/live-classes/${showRecordingForm.id}/recording`, {
        method: 'PATCH', headers: hdrs(),
        body: JSON.stringify({ recordingUrl, recordingType })
      })
      setShowRecordingForm(null); setRecordingUrl(''); setRecordingType('youtube')
      setSuccess('Recording saved!'); setTimeout(() => setSuccess(''), 3000)
      loadClasses()
    } catch { setError('Failed to save recording') } finally { setSavingRecording(false) }
  }

  async function deleteClass(id: string) {
    if (!window.confirm('Delete this live class?')) return
    await fetch(`${API}/live-classes/${id}`, { method: 'DELETE', headers: hdrs() })
    setClasses(prev => prev.filter(c => c.id !== id))
  }

  function openJitsi(jitsiRoom: string, classId: string) {
    // Mark as live
    updateStatus(classId, 'live')
    window.open(`https://meet.jit.si/${jitsiRoom}`, '_blank')
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  const liveNow = classes.filter(c => c.status === 'live')
  const upcoming = classes.filter(c => c.status === 'scheduled')
  const past = classes.filter(c => ['ended', 'cancelled'].includes(c.status))

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Live Classes</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Schedule and manage live video classes using Jitsi Meet — free, no account needed.</p>
        </div>
        <button onClick={() => setShowCreateForm(true)}
          style={{ padding: '0.625rem 1.25rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
          🎥 Schedule Class
        </button>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        <select style={{ ...sel, width: 'auto' }} value={selectedClass} onChange={e => { setSelectedClass(e.target.value); }}>
          <option value="">All classes</option>
          {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={loadClasses} style={{ padding: '0.625rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* Live Now */}
      {liveNow.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.875rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🔴 Live Now</h2>
          {liveNow.map(c => <ClassCard key={c.id} cls={c} onJoin={openJitsi} onEnd={() => updateStatus(c.id, 'ended')} onAddRecording={() => setShowRecordingForm(c)} onDelete={() => deleteClass(c.id)} />)}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.875rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>📅 Upcoming</h2>
          {upcoming.map(c => <ClassCard key={c.id} cls={c} onJoin={openJitsi} onEnd={() => updateStatus(c.id, 'ended')} onCancel={() => updateStatus(c.id, 'cancelled')} onAddRecording={() => setShowRecordingForm(c)} onDelete={() => deleteClass(c.id)} />)}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b6b65', marginBottom: '0.875rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>📼 Past Classes</h2>
          {past.map(c => <ClassCard key={c.id} cls={c} onJoin={openJitsi} onAddRecording={() => setShowRecordingForm(c)} onDelete={() => deleteClass(c.id)} />)}
        </div>
      )}

      {!loading && classes.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' as const }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎥</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No live classes yet</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>Schedule your first live class — powered by Jitsi Meet, completely free.</p>
          <button onClick={() => setShowCreateForm(true)}
            style={{ padding: '0.625rem 1.5rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            🎥 Schedule First Class
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowCreateForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18' }}>Schedule Live Class</h2>
              <button onClick={() => setShowCreateForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#6b6b65' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Title *</label>
                <input style={inp} value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Algebra — Introduction to Variables" autoFocus /></div>
              <div><label style={lbl}>Description</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="What will be covered in this class?" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><label style={lbl}>Class Level *</label>
                  <select style={sel} value={createForm.classLevel} onChange={e => setCreateForm(f => ({ ...f, classLevel: e.target.value }))}>
                    {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                  </select></div>
                <div><label style={lbl}>Class Arm</label>
                  <input style={inp} value={createForm.classArm} onChange={e => setCreateForm(f => ({ ...f, classArm: e.target.value }))} placeholder="e.g. A, Science" /></div>
                <div><label style={lbl}>Subject</label>
                  <select style={sel} value={createForm.subjectId} onChange={e => setCreateForm(f => ({ ...f, subjectId: e.target.value }))}>
                    <option value="">Select subject...</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div><label style={lbl}>Duration (mins)</label>
                  <input style={inp} type="number" value={createForm.durationMins} onChange={e => setCreateForm(f => ({ ...f, durationMins: e.target.value }))} /></div>
              </div>
              <div><label style={lbl}>Scheduled Date & Time *</label>
                <input style={inp} type="datetime-local" value={createForm.scheduledAt} onChange={e => setCreateForm(f => ({ ...f, scheduledAt: e.target.value }))} /></div>
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '0.875rem', fontSize: '0.825rem', color: '#1e40af' }}>
                ℹ️ A unique Jitsi Meet room will be automatically created. No account or app required — works directly in the browser.
              </div>
              {error && <p style={{ fontSize: '0.825rem', color: '#dc2626' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={createClass} disabled={creating}
                  style={{ flex: 1, padding: '0.75rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Scheduling...' : '🎥 Schedule Class'}
                </button>
                <button onClick={() => setShowCreateForm(false)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Recording Modal */}
      {showRecordingForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowRecordingForm(null)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Add Recording</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>{showRecordingForm.title}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Recording Type</label>
                <select style={sel} value={recordingType} onChange={e => setRecordingType(e.target.value)}>
                  <option value="youtube">YouTube</option>
                  <option value="loom">Loom</option>
                  <option value="drive">Google Drive</option>
                  <option value="other">Other</option>
                </select></div>
              <div><label style={lbl}>Recording URL *</label>
                <input style={inp} value={recordingUrl} onChange={e => setRecordingUrl(e.target.value)} placeholder="https://..." autoFocus /></div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={saveRecording} disabled={savingRecording}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: savingRecording ? 0.6 : 1 }}>
                  {savingRecording ? 'Saving...' : '💾 Save Recording'}
                </button>
                <button onClick={() => setShowRecordingForm(null)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClassCard({ cls, onJoin, onEnd, onCancel, onAddRecording, onDelete }: any) {
  const cfg = STATUS_CONFIG[cls.status] ?? STATUS_CONFIG.scheduled
  const canStart = isStartable(cls.scheduled_at) && cls.status === 'scheduled'
  const isLive = cls.status === 'live'

  return (
    <div style={{ background: 'white', border: `1.5px solid ${isLive ? '#fecaca' : '#e5e5e0'}`, borderRadius: '14px', padding: '1.25rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
              {new Date(cls.scheduled_at).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {cls.duration_mins && ` · ${cls.duration_mins} min`}
            </span>
          </div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{cls.title}</h3>
          <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '0.25rem' }}>
            {cls.subject_name && `${cls.subject_name} · `}{cls.class_level}{cls.class_arm ? ` ${cls.class_arm}` : ''} · {cls.teacher_name}
          </p>
          {cls.description && <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{cls.description}</p>}
          {cls.recording_url && (
            <a href={cls.recording_url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.72rem', color: '#1e40af', marginTop: '0.375rem', textDecoration: 'none' }}>
              📼 View Recording ↗
            </a>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem', flexWrap: 'wrap' as const, justifyContent: 'flex-end' }}>
          {(isLive || canStart) && (
            <button onClick={() => onJoin(cls.jitsi_room, cls.id)}
              style={{ padding: '0.375rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
              {isLive ? '🔴 Join Live' : '▶ Start Class'}
            </button>
          )}
          {cls.status === 'live' && onEnd && (
            <button onClick={onEnd}
              style={{ padding: '0.375rem 0.875rem', background: '#f7f7f5', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.72rem', color: '#6b6b65', cursor: 'pointer', fontWeight: 600 }}>
              End Class
            </button>
          )}
          {cls.status === 'scheduled' && onCancel && (
            <button onClick={onCancel}
              style={{ padding: '0.375rem 0.875rem', background: '#f7f7f5', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.72rem', color: '#6b6b65', cursor: 'pointer', fontWeight: 600 }}>
              Cancel
            </button>
          )}
          {cls.status === 'ended' && !cls.recording_url && (
            <button onClick={onAddRecording}
              style={{ padding: '0.375rem 0.875rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '0.72rem', color: '#1e40af', cursor: 'pointer', fontWeight: 600 }}>
              + Add Recording
            </button>
          )}
          <button onClick={onDelete}
            style={{ padding: '0.375rem 0.5rem', background: '#fef2f2', border: 'none', borderRadius: '8px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer' }}>
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
