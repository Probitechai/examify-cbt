'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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
async function uploadFile(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${folder}/${Date.now()}.${ext}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/lesson-files/${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error('Upload failed')
  return `${SUPABASE_URL}/storage/v1/object/public/lesson-files/${path}`
}

const RESOURCE_ICONS: Record<string, string> = {
  video_link: '🎬', video_upload: '🎥', file: '📄', link: '🔗', image: '🖼️'
}

export default function LessonDetailPage() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string

  const [lesson, setLesson] = useState<any>(null)
  const [resources, setResources] = useState<any[]>([])
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [completions, setCompletions] = useState<any>(null)
  const [completionList, setCompletionList] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'content' | 'resources' | 'quizzes' | 'assignments' | 'completions'>('content')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [publishing, setPublishing] = useState(false)

  // Resource form
  const [showResourceForm, setShowResourceForm] = useState(false)
  const [resourceForm, setResourceForm] = useState({ resourceType: 'video_link', title: '', description: '', url: '', durationMins: '' })
  const [addingResource, setAddingResource] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Quiz form
  const [showQuizForm, setShowQuizForm] = useState(false)
  const [quizForm, setQuizForm] = useState({ examId: '', title: '', instructions: '', isRequired: false })
  const [addingQuiz, setAddingQuiz] = useState(false)

  // Assignment form
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [assignmentForm, setAssignmentForm] = useState({ title: '', instructions: '', dueDate: '', maxScore: '100', submissionType: 'both', isRequired: true })
  const [addingAssignment, setAddingAssignment] = useState(false)

  // Submissions modal
  const [viewingSubmissions, setViewingSubmissions] = useState<any>(null)
  const [submissions, setSubmissions] = useState<any[]>([])
  const [gradingSubmission, setGradingSubmission] = useState<any>(null)
  const [gradeForm, setGradeForm] = useState({ score: '', feedback: '' })

  useEffect(() => { loadLesson(); loadExams() }, [lessonId])

  async function loadLesson() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/lessons/${lessonId}`, { headers: hdrs() })
      const data = await res.json()
      setLesson(data.lesson)
      setResources(data.resources ?? [])
      setQuizzes(data.quizzes ?? [])
      setAssignments(data.assignments ?? [])
      setCompletions(data.completions)
    } catch { setError('Failed to load lesson') } finally { setLoading(false) }
  }

  async function loadExams() {
    const res = await fetch(`${API}/exams`, { headers: hdrs() })
    const data = await res.json()
    setExams(data.exams ?? [])
  }

  async function loadCompletionList() {
    const res = await fetch(`${API}/lessons/${lessonId}/completions`, { headers: hdrs() })
    const data = await res.json()
    setCompletionList(data.completions ?? [])
  }

  async function publishLesson() {
    setPublishing(true)
    try {
      await fetch(`${API}/lessons/${lessonId}`, {
        method: 'PATCH', headers: hdrs(),
        body: JSON.stringify({ status: lesson.status === 'published' ? 'draft' : 'published' })
      })
      setSuccess(lesson.status === 'published' ? 'Lesson unpublished' : 'Lesson published to students!')
      setTimeout(() => setSuccess(''), 3000)
      loadLesson()
    } catch { setError('Failed to update lesson') } finally { setPublishing(false) }
  }

  async function addResource() {
    if (!resourceForm.title || !resourceForm.url) { setError('Title and URL required'); return }
    setAddingResource(true); setError('')
    try {
      await fetch(`${API}/lessons/${lessonId}/resources`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          resourceType: resourceForm.resourceType,
          title: resourceForm.title,
          description: resourceForm.description || undefined,
          url: resourceForm.url,
          durationMins: resourceForm.durationMins ? Number(resourceForm.durationMins) : undefined,
        })
      })
      setShowResourceForm(false)
      setResourceForm({ resourceType: 'video_link', title: '', description: '', url: '', durationMins: '' })
      loadLesson()
    } catch { setError('Failed to add resource') } finally { setAddingResource(false) }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !resourceForm.title) { setError('Please enter a title first'); return }
    setUploading(true); setError('')
    try {
      const url = await uploadFile(file, lessonId)
      const rt = file.type.startsWith('video/') ? 'video_upload' : file.type.startsWith('image/') ? 'image' : 'file'
      await fetch(`${API}/lessons/${lessonId}/resources`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ resourceType: rt, title: resourceForm.title, url, fileSizeBytes: file.size })
      })
      setShowResourceForm(false)
      setResourceForm({ resourceType: 'video_link', title: '', description: '', url: '', durationMins: '' })
      loadLesson()
    } catch { setError('Upload failed') } finally { setUploading(false) }
  }

  async function deleteResource(id: string) {
    await fetch(`${API}/lessons/${lessonId}/resources/${id}`, { method: 'DELETE', headers: hdrs() })
    setResources(prev => prev.filter(r => r.id !== id))
  }

  async function addQuiz() {
    if (!quizForm.title) { setError('Title required'); return }
    setAddingQuiz(true); setError('')
    try {
      await fetch(`${API}/lessons/${lessonId}/quizzes`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          examId: quizForm.examId || undefined,
          title: quizForm.title,
          instructions: quizForm.instructions || undefined,
          isRequired: quizForm.isRequired,
        })
      })
      setShowQuizForm(false)
      setQuizForm({ examId: '', title: '', instructions: '', isRequired: false })
      loadLesson()
    } catch { setError('Failed to add quiz') } finally { setAddingQuiz(false) }
  }

  async function deleteQuiz(id: string) {
    await fetch(`${API}/lessons/${lessonId}/quizzes/${id}`, { method: 'DELETE', headers: hdrs() })
    setQuizzes(prev => prev.filter(q => q.id !== id))
  }

  async function addAssignment() {
    if (!assignmentForm.title || !assignmentForm.instructions) { setError('Title and instructions required'); return }
    setAddingAssignment(true); setError('')
    try {
      await fetch(`${API}/lessons/${lessonId}/assignments`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          title: assignmentForm.title,
          instructions: assignmentForm.instructions,
          dueDate: assignmentForm.dueDate || undefined,
          maxScore: Number(assignmentForm.maxScore),
          submissionType: assignmentForm.submissionType,
          isRequired: assignmentForm.isRequired,
        })
      })
      setShowAssignmentForm(false)
      setAssignmentForm({ title: '', instructions: '', dueDate: '', maxScore: '100', submissionType: 'both', isRequired: true })
      loadLesson()
    } catch { setError('Failed to add assignment') } finally { setAddingAssignment(false) }
  }

  async function deleteAssignment(id: string) {
    await fetch(`${API}/lessons/${lessonId}/assignments/${id}`, { method: 'DELETE', headers: hdrs() })
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  async function loadSubmissions(assignment: any) {
    setViewingSubmissions(assignment)
    const res = await fetch(`${API}/lessons/assignments/${assignment.id}/submissions`, { headers: hdrs() })
    const data = await res.json()
    setSubmissions(data.submissions ?? [])
  }

  async function gradeSubmission() {
    if (!gradingSubmission || !gradeForm.score) return
    await fetch(`${API}/lessons/submissions/${gradingSubmission.id}/grade`, {
      method: 'PATCH', headers: hdrs(),
      body: JSON.stringify({ score: Number(gradeForm.score), feedback: gradeForm.feedback || undefined })
    })
    setGradingSubmission(null)
    loadSubmissions(viewingSubmissions)
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui', color: '#6b6b65' }}>Loading lesson...</div>
  if (!lesson) return <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui', color: '#dc2626' }}>Lesson not found.</div>

  const isPublished = lesson.status === 'published'

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 960 }}>
      {/* Header */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <button onClick={() => router.back()} style={{ fontSize: '0.825rem', color: '#6b6b65', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '0.5rem', padding: 0 }}>← Back to Lessons</button>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.375rem' }}>{lesson.title}</h1>
            <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' as const }}>
              {lesson.subject_name && <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>📚 {lesson.subject_name}</span>}
              <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>👥 {lesson.class_level}{lesson.class_arm ? ` ${lesson.class_arm}` : ''}</span>
              {lesson.week_number && <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>📅 Week {lesson.week_number}</span>}
              {lesson.estimated_duration_mins && <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>⏱ {lesson.estimated_duration_mins} min</span>}
              <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>👤 {lesson.teacher_name}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.3rem 0.875rem', borderRadius: 20, background: isPublished ? '#e8f5ee' : '#fffbeb', color: isPublished ? '#0f4a32' : '#d97706', alignSelf: 'center' }}>
              {isPublished ? 'Published' : 'Draft'}
            </span>
            <button onClick={publishLesson} disabled={publishing}
              style={{ padding: '0.5rem 1rem', background: isPublished ? '#fef2f2' : '#1a6b4a', color: isPublished ? '#dc2626' : 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: publishing ? 0.6 : 1 }}>
              {publishing ? '...' : isPublished ? 'Unpublish' : '🚀 Publish'}
            </button>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f0f0ee' }}>
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a' }}>{completions?.completed ?? 0}</p>
            <p style={{ fontSize: '0.68rem', color: '#6b6b65', textTransform: 'uppercase' as const }}>Completed</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#d97706' }}>{completions?.in_progress ?? 0}</p>
            <p style={{ fontSize: '0.68rem', color: '#6b6b65', textTransform: 'uppercase' as const }}>In Progress</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e40af' }}>{resources.length}</p>
            <p style={{ fontSize: '0.68rem', color: '#6b6b65', textTransform: 'uppercase' as const }}>Resources</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#7e22ce' }}>{quizzes.length}</p>
            <p style={{ fontSize: '0.68rem', color: '#6b6b65', textTransform: 'uppercase' as const }}>Quizzes</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0891b2' }}>{assignments.length}</p>
            <p style={{ fontSize: '0.68rem', color: '#6b6b65', textTransform: 'uppercase' as const }}>Assignments</p>
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
        {([
          { key: 'content', label: '📄 Content' },
          { key: 'resources', label: `📎 Resources (${resources.length})` },
          { key: 'quizzes', label: `❓ Quizzes (${quizzes.length})` },
          { key: 'assignments', label: `📝 Assignments (${assignments.length})` },
          { key: 'completions', label: '📊 Completions' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); if (tab.key === 'completions') loadCompletionList() }}
            style={{ padding: '0.625rem 1rem', fontSize: '0.825rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65', whiteSpace: 'nowrap' as const }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENT TAB */}
      {activeTab === 'content' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          {lesson.objectives?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.75rem' }}>Learning Objectives</h3>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {lesson.objectives.map((obj: string, i: number) => (
                  <li key={i} style={{ fontSize: '0.875rem', color: '#3a3a36', marginBottom: '0.375rem' }}>{obj}</li>
                ))}
              </ul>
            </div>
          )}
          {lesson.introduction && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Introduction</h3>
              <p style={{ fontSize: '0.875rem', color: '#3a3a36', lineHeight: 1.7, whiteSpace: 'pre-wrap' as const }}>{lesson.introduction}</p>
            </div>
          )}
          {lesson.main_content && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Lesson Content</h3>
              <div style={{ background: '#f7f7f5', borderRadius: '10px', padding: '1.25rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#3a3a36', lineHeight: 1.8, whiteSpace: 'pre-wrap' as const }}>{lesson.main_content}</p>
              </div>
            </div>
          )}
          {lesson.conclusion && (
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Summary & Conclusion</h3>
              <p style={{ fontSize: '0.875rem', color: '#3a3a36', lineHeight: 1.7, whiteSpace: 'pre-wrap' as const }}>{lesson.conclusion}</p>
            </div>
          )}
          {!lesson.introduction && !lesson.main_content && !lesson.conclusion && (
            <p style={{ fontSize: '0.875rem', color: '#a0a09a', textAlign: 'center' as const, padding: '2rem' }}>No lesson content yet. Edit the lesson to add content.</p>
          )}
        </div>
      )}

      {/* RESOURCES TAB */}
      {activeTab === 'resources' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => setShowResourceForm(true)}
              style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Resource
            </button>
          </div>

          {showResourceForm && (
            <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <div><label style={lbl}>Resource Type</label>
                  <select style={sel} value={resourceForm.resourceType} onChange={e => setResourceForm(f => ({ ...f, resourceType: e.target.value }))}>
                    <option value="video_link">🎬 Video Link (YouTube/Vimeo)</option>
                    <option value="link">🔗 External Link</option>
                    <option value="file">📄 Upload File</option>
                    <option value="image">🖼️ Upload Image</option>
                  </select></div>
                <div><label style={lbl}>Title *</label>
                  <input style={inp} value={resourceForm.title} onChange={e => setResourceForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Introduction Video" /></div>
              </div>
              {resourceForm.resourceType === 'file' || resourceForm.resourceType === 'image' ? (
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={lbl}>Upload File</label>
                  <input type="file" onChange={handleFileUpload} disabled={uploading} style={{ fontSize: '0.825rem' }} />
                  {uploading && <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.5rem' }}>Uploading...</p>}
                </div>
              ) : (
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={lbl}>URL *</label>
                  <input style={inp} value={resourceForm.url} onChange={e => setResourceForm(f => ({ ...f, url: e.target.value }))} placeholder={resourceForm.resourceType === 'video_link' ? 'https://youtube.com/watch?v=...' : 'https://'} />
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={addResource} disabled={addingResource}
                  style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: addingResource ? 0.6 : 1 }}>
                  {addingResource ? 'Adding...' : 'Add'}
                </button>
                <button onClick={() => setShowResourceForm(false)}
                  style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          {resources.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📎</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No resources yet. Add videos, files or links.</p>
            </div>
          ) : resources.map(r => (
            <div key={r.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{RESOURCE_ICONS[r.resource_type] ?? '📄'}</span>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{r.title}</p>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65', textTransform: 'capitalize' as const }}>{r.resource_type.replace('_', ' ')}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a href={r.url} target="_blank" rel="noreferrer"
                  style={{ padding: '0.3rem 0.75rem', background: '#eff6ff', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#1e40af', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}>Open</a>
                <button onClick={() => deleteResource(r.id)}
                  style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QUIZZES TAB */}
      {activeTab === 'quizzes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => setShowQuizForm(true)}
              style={{ padding: '0.5rem 1rem', background: '#7e22ce', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Quiz
            </button>
          </div>

          {showQuizForm && (
            <div style={{ background: 'white', border: '1.5px solid #7e22ce', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div><label style={lbl}>Title *</label>
                  <input style={inp} value={quizForm.title} onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Chapter 1 Quiz" autoFocus /></div>
                <div><label style={lbl}>Link to Existing Exam (optional)</label>
                  <select style={sel} value={quizForm.examId} onChange={e => setQuizForm(f => ({ ...f, examId: e.target.value }))}>
                    <option value="">No exam — instructions only</option>
                    {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select></div>
                <div><label style={lbl}>Instructions</label>
                  <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={quizForm.instructions} onChange={e => setQuizForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Complete this quiz after reading the lesson..." /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="quizRequired" checked={quizForm.isRequired} onChange={e => setQuizForm(f => ({ ...f, isRequired: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#7e22ce' }} />
                  <label htmlFor="quizRequired" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Required to complete lesson</label>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={addQuiz} disabled={addingQuiz}
                    style={{ padding: '0.5rem 1.25rem', background: '#7e22ce', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: addingQuiz ? 0.6 : 1 }}>
                    {addingQuiz ? 'Adding...' : 'Add Quiz'}
                  </button>
                  <button onClick={() => setShowQuizForm(false)}
                    style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {quizzes.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>❓</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No quizzes yet. Link existing CBT exams or add quiz instructions.</p>
            </div>
          ) : quizzes.map(q => (
            <div key={q.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{q.title}</p>
                  {q.is_required && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#fef2f2', color: '#dc2626' }}>Required</span>}
                </div>
                {q.exam_title && <p style={{ fontSize: '0.72rem', color: '#7e22ce' }}>Linked to: {q.exam_title} ({q.duration_minutes} min)</p>}
                {q.instructions && <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{q.instructions}</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {q.exam_id && <button onClick={() => router.push(`/admin/exams/${q.exam_id}`)}
                  style={{ padding: '0.3rem 0.75rem', background: '#f5f3ff', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#7e22ce', cursor: 'pointer', fontWeight: 600 }}>View Exam</button>}
                <button onClick={() => deleteQuiz(q.id)}
                  style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ASSIGNMENTS TAB */}
      {activeTab === 'assignments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => setShowAssignmentForm(true)}
              style={{ padding: '0.5rem 1rem', background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Assignment
            </button>
          </div>

          {showAssignmentForm && (
            <div style={{ background: 'white', border: '1.5px solid #0891b2', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div><label style={lbl}>Title *</label>
                  <input style={inp} value={assignmentForm.title} onChange={e => setAssignmentForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Solve 10 algebra problems" autoFocus /></div>
                <div><label style={lbl}>Instructions *</label>
                  <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={assignmentForm.instructions} onChange={e => setAssignmentForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Detailed instructions for students..." /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  <div><label style={lbl}>Due Date</label>
                    <input style={inp} type="datetime-local" value={assignmentForm.dueDate} onChange={e => setAssignmentForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                  <div><label style={lbl}>Max Score</label>
                    <input style={inp} type="number" value={assignmentForm.maxScore} onChange={e => setAssignmentForm(f => ({ ...f, maxScore: e.target.value }))} /></div>
                  <div><label style={lbl}>Submission Type</label>
                    <select style={sel} value={assignmentForm.submissionType} onChange={e => setAssignmentForm(f => ({ ...f, submissionType: e.target.value }))}>
                      <option value="both">Text & File</option>
                      <option value="text">Text only</option>
                      <option value="file">File upload only</option>
                    </select></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="assignRequired" checked={assignmentForm.isRequired} onChange={e => setAssignmentForm(f => ({ ...f, isRequired: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#0891b2' }} />
                  <label htmlFor="assignRequired" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Required to complete lesson</label>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={addAssignment} disabled={addingAssignment}
                    style={{ padding: '0.5rem 1.25rem', background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: addingAssignment ? 0.6 : 1 }}>
                    {addingAssignment ? 'Adding...' : 'Add Assignment'}
                  </button>
                  <button onClick={() => setShowAssignmentForm(false)}
                    style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {assignments.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📝</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No assignments yet.</p>
            </div>
          ) : assignments.map(a => (
            <div key={a.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{a.title}</p>
                    {a.is_required && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#fef2f2', color: '#dc2626' }}>Required</span>}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#3a3a36', marginBottom: '0.375rem' }}>{a.instructions}</p>
                  <div style={{ display: 'flex', gap: '0.875rem' }}>
                    {a.due_date && <span style={{ fontSize: '0.72rem', color: '#dc2626' }}>Due: {new Date(a.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                    <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Max: {a.max_score} pts</span>
                    <span style={{ fontSize: '0.72rem', color: '#6b6b65', textTransform: 'capitalize' as const }}>{a.submission_type} submission</span>
                    <span style={{ fontSize: '0.72rem', color: '#1a6b4a', fontWeight: 600 }}>{a.submission_count ?? 0} submitted · {a.graded_count ?? 0} graded</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem' }}>
                  <button onClick={() => loadSubmissions(a)}
                    style={{ padding: '0.3rem 0.75rem', background: '#ecfeff', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#0891b2', cursor: 'pointer', fontWeight: 600 }}>
                    View Submissions
                  </button>
                  <button onClick={() => deleteAssignment(a.id)}
                    style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* COMPLETIONS TAB */}
      {activeTab === 'completions' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Student</span><span>Class</span><span>Progress</span><span>Quiz</span><span>Task</span><span>Completed</span>
          </div>
          {completionList.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No students have started this lesson yet.</p>
            </div>
          ) : completionList.map(c => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{c.student_name}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{c.admission_no}</p>
              </div>
              <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{c.class_level} {c.class_arm}</span>
              <div>
                <p style={{ fontSize: '0.825rem', fontWeight: 600, color: c.progress_pct >= 100 ? '#1a6b4a' : '#d97706' }}>{c.progress_pct}%</p>
                <div style={{ height: 4, background: '#f0f0ee', borderRadius: 2, marginTop: 2 }}>
                  <div style={{ width: `${c.progress_pct}%`, height: '100%', background: c.progress_pct >= 100 ? '#1a6b4a' : '#d97706', borderRadius: 2 }} />
                </div>
              </div>
              <span style={{ fontSize: '1rem' }}>{c.quiz_completed ? '✅' : '⬜'}</span>
              <span style={{ fontSize: '1rem' }}>{c.assignment_submitted ? '✅' : '⬜'}</span>
              <span style={{ fontSize: '0.72rem', color: c.completed_at ? '#1a6b4a' : '#a0a09a' }}>
                {c.completed_at ? new Date(c.completed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : 'In progress'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Submissions Modal */}
      {viewingSubmissions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setViewingSubmissions(null)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Submissions — {viewingSubmissions.title}</h2>
              <button onClick={() => setViewingSubmissions(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#6b6b65' }}>✕</button>
            </div>
            {submissions.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: '#a0a09a', textAlign: 'center' as const, padding: '2rem' }}>No submissions yet.</p>
            ) : submissions.map(sub => (
              <div key={sub.id} style={{ border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{sub.student_name}</p>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{sub.class_level} {sub.class_arm} · {new Date(sub.submitted_at).toLocaleDateString('en-NG')}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {sub.score != null && <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#1a6b4a' }}>{sub.score}/{viewingSubmissions.max_score}</span>}
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: sub.status === 'graded' ? '#e8f5ee' : '#fffbeb', color: sub.status === 'graded' ? '#0f4a32' : '#d97706', textTransform: 'capitalize' as const }}>{sub.status}</span>
                  </div>
                </div>
                {sub.text_response && <p style={{ fontSize: '0.825rem', color: '#3a3a36', background: '#f7f7f5', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.5rem', whiteSpace: 'pre-wrap' as const }}>{sub.text_response}</p>}
                {sub.file_url && <a href={sub.file_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: '#1e40af', display: 'block', marginBottom: '0.5rem' }}>📎 {sub.file_name ?? 'View file'}</a>}
                {sub.feedback && <p style={{ fontSize: '0.78rem', color: '#1a6b4a', marginBottom: '0.5rem' }}>Feedback: {sub.feedback}</p>}
                {sub.status !== 'graded' && (
                  <button onClick={() => { setGradingSubmission(sub); setGradeForm({ score: '', feedback: '' }) }}
                    style={{ padding: '0.3rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                    Grade
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grade Modal */}
      {gradingSubmission && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 400 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Grade Submission</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1rem' }}>Student: {gradingSubmission.student_name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Score (out of {viewingSubmissions?.max_score})</label>
                <input style={inp} type="number" min={0} max={viewingSubmissions?.max_score} value={gradeForm.score} onChange={e => setGradeForm(f => ({ ...f, score: e.target.value }))} autoFocus /></div>
              <div><label style={lbl}>Feedback (optional)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} placeholder="Well done! However..." /></div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={gradeSubmission}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                  Submit Grade
                </button>
                <button onClick={() => setGradingSubmission(null)}
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