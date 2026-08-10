'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL

`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']

export default function LearningPathsPage() {
  const router = useRouter()
  const [paths, setPaths] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('SS2')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [selectedPath, setSelectedPath] = useState<any>(null)
  const [pathSteps, setPathSteps] = useState<any[]>([])
  const [buildingPath, setBuildingPath] = useState(false)
  const [showAddStep, setShowAddStep] = useState(false)
  const [lessons, setLessons] = useState<any[]>([])
  const [addingStep, setAddingStep] = useState(false)

  const [createForm, setCreateForm] = useState({
    subjectId: '', termId: '', classLevel: 'SS2', classArm: '',
    title: '', description: '', isSequential: true
  })
  const [stepForm, setStepForm] = useState({
    lessonId: '', stepNumber: 1, title: '', description: '', isRequired: true
  })

useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { loadInitial() }, [])
useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { loadSubjects() }, [selectedClass, createForm.classLevel])

  async function loadInitial() {
    const res = await apiFetch(`${API}/sessions`)
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: any) => s.is_active)
    if (active) { setSelectedSession(active.id); loadTerms(active.id) }
  }

  async function loadTerms(sessionId: string) {
    const res = await apiFetch(`${API}/sessions/${sessionId}/terms`)
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) { setSelectedTerm(active.id); setCreateForm(f => ({ ...f, termId: active.id })) }
  }

  async function loadSubjects() {
    const cl = selectedClass || createForm.classLevel
    const res = await apiFetch(`${API}/curriculum/subjects?classLevel=${cl}`)
    const data = await res.json()
    setSubjects(data.subjects ?? [])
  }

  async function loadPaths() {
    if (!selectedTerm) { setError('Please select a term'); return }
    setLoading(true); setError('')
    try {
      const res = await apiFetch(`${API}/learning-paths?classLevel=${selectedClass}&termId=${selectedTerm}`)
      const data = await res.json()
      setPaths(data.paths ?? [])
    } catch { setError('Failed to load paths') } finally { setLoading(false) }
  }

  async function loadPathDetails(pathId: string) {
    const res = await apiFetch(`${API}/learning-paths/${pathId}`)
    const data = await res.json()
    setSelectedPath(data.path)
    setPathSteps(data.steps ?? [])
    // Load lessons for this class/term
    const lessonsRes = await apiFetch(`${API}/lessons?classLevel=${data.path.class_level}&termId=${data.path.term_id}`)
    const lessonsData = await lessonsRes.json()
    setLessons(lessonsData.lessons ?? [])
    setStepForm(f => ({ ...f, stepNumber: (data.steps?.length ?? 0) + 1 }))
  }

  async function createPath() {
    if (!createForm.subjectId || !createForm.termId || !createForm.classLevel || !createForm.title) {
      setError('Subject, term, class and title required'); return
    }
    setCreating(true); setError('')
    try {
      const body: any = {
        subjectId: createForm.subjectId, termId: createForm.termId,
        classLevel: createForm.classLevel, classArm: createForm.classArm || undefined,
        title: createForm.title, description: createForm.description || undefined,
        isSequential: createForm.isSequential,
      }
      const res = await fetch(`${API}/learning-paths`, { method: 'POST', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')
      setShowCreateForm(false)
      setSuccess('Learning path created!')
      setTimeout(() => setSuccess(''), 3000)
      loadPaths()
    } catch (e: any) { setError(e.message) } finally { setCreating(false) }
  }

  async function autoBuild(pathId: string) {
    setBuildingPath(true); setError('')
    try {
      const res = await fetch(`${API}/learning-paths/${pathId}/auto-build`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain() } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to build')
      setSuccess(`Auto-built ${data.built} steps from scheme of work!`)
      setTimeout(() => setSuccess(''), 4000)
      loadPathDetails(pathId)
      loadPaths()
    } catch (e: any) { setError(e.message) } finally { setBuildingPath(false) }
  }

  async function addStep(pathId: string) {
    if (!stepForm.title) { setError('Title required'); return }
    setAddingStep(true); setError('')
    try {
      const body: any = {
        stepNumber: stepForm.stepNumber, title: stepForm.title,
        description: stepForm.description || undefined,
        isRequired: stepForm.isRequired,
        unlockAfterStep: stepForm.stepNumber > 1 ? stepForm.stepNumber - 1 : undefined,
      }
      if (stepForm.lessonId) body.lessonId = stepForm.lessonId
      await fetch(`${API}/learning-paths/${pathId}/steps`, { method: 'POST', body: JSON.stringify(body) })
      setShowAddStep(false)
      setStepForm(f => ({ ...f, stepNumber: f.stepNumber + 1, title: '', lessonId: '', description: '' }))
      loadPathDetails(pathId)
    } catch { setError('Failed to add step') } finally { setAddingStep(false) }
  }

  async function deleteStep(stepId: string, pathId: string) {
    await apiFetch(`${API}/learning-paths/steps/${stepId}`, { method: 'DELETE' })
    loadPathDetails(pathId)
  }

  async function togglePublish(pathId: string) {
    await fetch(`${API}/learning-paths/${pathId}/publish`, { method: 'PATCH' })
    loadPaths()
    if (selectedPath?.id === pathId) {
      setSelectedPath((prev: any) => ({ ...prev, is_published: !prev.is_published }))
    }
  }

  async function deletePath(pathId: string) {
    if (!window.confirm('Delete this learning path?')) return
    await apiFetch(`${API}/learning-paths/${pathId}`, { method: 'DELETE' })
    setPaths(prev => prev.filter(p => p.id !== pathId))
    if (selectedPath?.id === pathId) setSelectedPath(null)
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Learning Paths</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Create structured lesson sequences linked to the scheme of work.</p>
        </div>
        <button onClick={() => setShowCreateForm(true)}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
          + New Path
        </button>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
          <div><label style={lbl}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select term...</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select></div>
          <div><label style={lbl}>Class</label>
            <select style={sel} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={loadPaths} disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, width: '100%' }}>
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedPath ? '1fr 1.5fr' : '1fr', gap: '1.5rem' }}>
        {/* Paths list */}
        <div>
          {paths.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🗺️</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No learning paths yet. Create one to get started.</p>
            </div>
          ) : paths.map(path => (
            <div key={path.id}
              onClick={() => loadPathDetails(path.id)}
              style={{ background: 'white', border: `1.5px solid ${selectedPath?.id === path.id ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '14px', padding: '1.25rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: path.is_published ? '#e8f5ee' : '#f7f7f5', color: path.is_published ? '#0f4a32' : '#6b6b65' }}>
                      {path.is_published ? 'Published' : 'Draft'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#6b6b65' }}>{path.step_count} steps</span>
                  </div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{path.title}</h3>
                  <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{path.subject_name} · {path.class_level} · {path.term_name}</p>
                </div>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                  <button onClick={e => { e.stopPropagation(); togglePublish(path.id) }}
                    style={{ padding: '0.25rem 0.625rem', background: path.is_published ? '#fef2f2' : '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.68rem', color: path.is_published ? '#dc2626' : '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                    {path.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); deletePath(path.id) }}
                    style={{ padding: '0.25rem 0.5rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.68rem', color: '#dc2626', cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Path detail */}
        {selectedPath && (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{selectedPath.title}</h2>
                <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{selectedPath.subject_name} · {selectedPath.class_level} · {selectedPath.is_sequential ? 'Sequential' : 'Open'}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => autoBuild(selectedPath.id)} disabled={buildingPath}
                  style={{ padding: '0.375rem 0.875rem', background: '#eff6ff', color: '#1e40af', border: '1.5px solid #bfdbfe', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: buildingPath ? 0.6 : 1 }}>
                  {buildingPath ? 'Building...' : '⚡ Auto-Build'}
                </button>
                <button onClick={() => setShowAddStep(true)}
                  style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  + Add Step
                </button>
              </div>
            </div>

            <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '1rem' }}>
              ⚡ <strong>Auto-Build</strong> creates steps automatically from your Scheme of Work and links them to published lesson plans.
            </p>

            {showAddStep && (
              <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div><label style={lbl}>Step #</label>
                    <input style={inp} type="number" value={stepForm.stepNumber} onChange={e => setStepForm(f => ({ ...f, stepNumber: Number(e.target.value) }))} /></div>
                  <div><label style={lbl}>Title *</label>
                    <input style={inp} value={stepForm.title} onChange={e => setStepForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Introduction to Algebra" autoFocus /></div>
                </div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={lbl}>Link to Lesson (optional)</label>
                  <select style={sel} value={stepForm.lessonId} onChange={e => setStepForm(f => ({ ...f, lessonId: e.target.value }))}>
                    <option value="">No lesson linked</option>
                    {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => addStep(selectedPath.id)} disabled={addingStep}
                    style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: addingStep ? 0.6 : 1 }}>
                    {addingStep ? 'Adding...' : 'Add Step'}
                  </button>
                  <button onClick={() => setShowAddStep(false)}
                    style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}

            {pathSteps.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: '2rem', background: '#f7f7f5', borderRadius: '10px' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No steps yet. Click <strong>⚡ Auto-Build</strong> to generate from scheme of work.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pathSteps.map((step, i) => (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem', background: step.lesson_id && step.lesson_status === 'published' ? '#f0fdf4' : '#f7f7f5', borderRadius: '10px', border: '1px solid #e5e5e0' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.lesson_id && step.lesson_status === 'published' ? '#1a6b4a' : '#e5e5e0', color: step.lesson_id && step.lesson_status === 'published' ? 'white' : '#6b6b65', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
                      {step.step_number}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{step.title}</p>
                      {step.lesson_title && (
                        <p style={{ fontSize: '0.72rem', color: step.lesson_status === 'published' ? '#1a6b4a' : '#d97706' }}>
                          📖 {step.lesson_title} {step.lesson_status !== 'published' ? '(draft)' : ''}
                        </p>
                      )}
                      {step.scheme_topic && !step.lesson_title && (
                        <p style={{ fontSize: '0.72rem', color: '#a0a09a' }}>📋 {step.scheme_topic} (no lesson linked)</p>
                      )}
                    </div>
                    {step.unlock_after_step && (
                      <span style={{ fontSize: '0.65rem', color: '#6b6b65', background: '#f0f0ee', padding: '0.2rem 0.5rem', borderRadius: 20 }}>
                        🔒 after step {step.unlock_after_step}
                      </span>
                    )}
                    <button onClick={() => deleteStep(step.id, selectedPath.id)}
                      style={{ padding: '0.25rem 0.5rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Path Modal */}
      {showCreateForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowCreateForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 520 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>New Learning Path</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><label style={lbl}>Class Level *</label>
                  <select style={sel} value={createForm.classLevel} onChange={e => setCreateForm(f => ({ ...f, classLevel: e.target.value }))}>
                    {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                  </select></div>
                <div><label style={lbl}>Class Arm</label>
                  <input style={inp} value={createForm.classArm} onChange={e => setCreateForm(f => ({ ...f, classArm: e.target.value }))} placeholder="e.g. A, Science" /></div>
              </div>
              <div><label style={lbl}>Subject *</label>
                <select style={sel} value={createForm.subjectId} onChange={e => setCreateForm(f => ({ ...f, subjectId: e.target.value }))}>
                  <option value="">Select subject...</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label style={lbl}>Term *</label>
                <select style={sel} value={createForm.termId} onChange={e => setCreateForm(f => ({ ...f, termId: e.target.value }))}>
                  <option value="">Select term...</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select></div>
              <div><label style={lbl}>Path Title *</label>
                <input style={inp} value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mathematics — Third Term Path" autoFocus /></div>
              <div><label style={lbl}>Description</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="isSeq" checked={createForm.isSequential} onChange={e => setCreateForm(f => ({ ...f, isSequential: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                <label htmlFor="isSeq" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Sequential — students must complete steps in order</label>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={createPath} disabled={creating}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? 'Creating...' : '🗺️ Create Path'}
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