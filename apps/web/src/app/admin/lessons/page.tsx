'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
  draft:     { label: 'Draft',     color: '#d97706', bg: '#fffbeb' },
  published: { label: 'Published', color: '#1a6b4a', bg: '#e8f5ee' },
  archived:  { label: 'Archived',  color: '#6b6b65', bg: '#f7f7f5' },
}

export default function LessonsPage() {
  const router = useRouter()
  const [lessons, setLessons] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState('SS2')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedSession, setSelectedSession] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createForm, setCreateForm] = useState({
    title: '', classLevel: 'SS2', classArm: '', subjectId: '',
    termId: '', weekNumber: '', estimatedDurationMins: '',
    objectives: '', introduction: '', mainContent: '', conclusion: ''
  })

  useEffect(() => { loadInitial() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
  useEffect(() => { loadSubjects() }, [selectedClass])
  useEffect(() => { loadLessons() }, [selectedClass, selectedSubject, selectedTerm] )

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
    } catch {} finally { setLoading(false) }
  }

  async function loadTerms(sessionId: string) {
    const res = await fetch(`${API}/sessions/${sessionId}/terms`, { headers: hdrs() })
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadSubjects() {
    const res = await fetch(`${API}/curriculum/subjects?classLevel=${selectedClass}`, { headers: hdrs() })
    const data = await res.json()
    setSubjects(data.subjects ?? [])
  }

  async function loadLessons() {
    setLoading(true)
    try {
      let url = `${API}/lessons?classLevel=${selectedClass}`
      if (selectedSubject) url += `&subjectId=${selectedSubject}`
      if (selectedTerm) url += `&termId=${selectedTerm}`
      const res = await fetch(url, { headers: hdrs() })
      const data = await res.json()
      setLessons(data.lessons ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function createLesson() {
    if (!createForm.title || !createForm.classLevel) { setError('Title and class are required'); return }
    setCreating(true); setError('')
    try {
      const body: any = {
        title: createForm.title,
        classLevel: createForm.classLevel,
        classArm: createForm.classArm || undefined,
        subjectId: createForm.subjectId || undefined,
        termId: createForm.termId || selectedTerm || undefined,
        weekNumber: createForm.weekNumber ? Number(createForm.weekNumber) : undefined,
        estimatedDurationMins: createForm.estimatedDurationMins ? Number(createForm.estimatedDurationMins) : undefined,
        objectives: createForm.objectives ? createForm.objectives.split('\n').filter(Boolean) : [],
        introduction: createForm.introduction || undefined,
        mainContent: createForm.mainContent || undefined,
        conclusion: createForm.conclusion || undefined,
      }
      const res = await fetch(`${API}/lessons`, { method: 'POST', headers: hdrs(), body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create lesson')
      setShowCreateForm(false)
      setSuccess('Lesson plan created!')
      setTimeout(() => setSuccess(''), 3000)
      router.push(`/admin/lessons/${data.lesson.id}`)
    } catch (e: any) { setError(e.message) } finally { setCreating(false) }
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Lesson Plans</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Create and manage lesson plans with resources, quizzes and assignments.</p>
        </div>
        <button onClick={() => setShowCreateForm(true)}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
          + New Lesson Plan
        </button>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
          <div><label style={lbl}>Class</label>
            <select style={sel} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div><label style={lbl}>Subject</label>
            <select style={sel} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label style={lbl}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">All terms</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={loadLessons} style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', width: '100%' }}>
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Lessons list */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#6b6b65' }}>Loading...</div>
      ) : lessons.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' as const }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📖</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No lesson plans yet</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>Create your first lesson plan to get started.</p>
          <button onClick={() => setShowCreateForm(true)}
            style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            + New Lesson Plan
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {lessons.map((lesson: any) => {
            const cfg = STATUS_CONFIG[lesson.status] ?? STATUS_CONFIG.draft
            return (
              <div key={lesson.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onClick={() => router.push(`/admin/lessons/${lesson.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  {lesson.week_number && <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Week {lesson.week_number}</span>}
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem', lineHeight: 1.4 }}>{lesson.title}</h3>
                <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '0.75rem' }}>
                  {lesson.subject_name && `${lesson.subject_name} · `}{lesson.class_level}{lesson.class_arm ? ` ${lesson.class_arm}` : ''}
                </p>
                <p style={{ fontSize: '0.72rem', color: '#a0a09a', marginBottom: '0.875rem' }}>By {lesson.teacher_name}</p>
                <div style={{ display: 'flex', gap: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f0ee' }}>
                  <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>📎 {lesson.resource_count ?? 0} resources</span>
                  <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>❓ {lesson.quiz_count ?? 0} quizzes</span>
                  <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>📝 {lesson.assignment_count ?? 0} tasks</span>
                  {lesson.estimated_duration_mins && <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>⏱ {lesson.estimated_duration_mins}min</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Lesson Modal */}
      {showCreateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowCreateForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18' }}>New Lesson Plan</h2>
              <button onClick={() => setShowCreateForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#6b6b65' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Title *</label>
                <input style={inp} value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Introduction to Algebra" autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div><label style={lbl}>Class Level *</label>
                  <select style={sel} value={createForm.classLevel} onChange={e => setCreateForm(f => ({ ...f, classLevel: e.target.value }))}>
                    {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                  </select></div>
                <div><label style={lbl}>Class Arm</label>
                  <input style={inp} value={createForm.classArm} onChange={e => setCreateForm(f => ({ ...f, classArm: e.target.value }))} placeholder="e.g. A, Science" /></div>
                <div><label style={lbl}>Week Number</label>
                  <input style={inp} type="number" min={1} max={15} value={createForm.weekNumber} onChange={e => setCreateForm(f => ({ ...f, weekNumber: e.target.value }))} placeholder="1-15" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><label style={lbl}>Subject</label>
                  <select style={sel} value={createForm.subjectId} onChange={e => setCreateForm(f => ({ ...f, subjectId: e.target.value }))}>
                    <option value="">Select subject...</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div><label style={lbl}>Duration (minutes)</label>
                  <input style={inp} type="number" value={createForm.estimatedDurationMins} onChange={e => setCreateForm(f => ({ ...f, estimatedDurationMins: e.target.value }))} placeholder="e.g. 40" /></div>
              </div>
              <div><label style={lbl}>Learning Objectives (one per line)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={createForm.objectives} onChange={e => setCreateForm(f => ({ ...f, objectives: e.target.value }))} placeholder="Students will be able to...&#10;Identify and solve..." /></div>
              <div><label style={lbl}>Introduction</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={createForm.introduction} onChange={e => setCreateForm(f => ({ ...f, introduction: e.target.value }))} placeholder="How will you introduce this lesson?" /></div>
              <div><label style={lbl}>Main Content / Lesson Notes</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={4} value={createForm.mainContent} onChange={e => setCreateForm(f => ({ ...f, mainContent: e.target.value }))} placeholder="Main lesson content, explanations, examples..." /></div>
              <div><label style={lbl}>Conclusion / Summary</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={createForm.conclusion} onChange={e => setCreateForm(f => ({ ...f, conclusion: e.target.value }))} placeholder="Summary and key takeaways..." /></div>
              {error && <p style={{ fontSize: '0.825rem', color: '#dc2626' }}>{error}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button onClick={createLesson} disabled={creating}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating...' : '📖 Create Lesson Plan'}
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
    </div>
  )
}
