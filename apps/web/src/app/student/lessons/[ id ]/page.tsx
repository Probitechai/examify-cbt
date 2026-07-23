'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '../../../../hooks/useAuth'

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

function getYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

export default function StudentLessonDetailPage() {
  const params = useParams()
  const router = useRouter()
  const lessonId = params.id as string
  const { user, isLoading, hydrate } = useAuthStore()

  const [lesson, setLesson] = useState<any>(null)
  const [resources, setResources] = useState<any[]>([])
  const [quizzes, setQuizzes] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'content' | 'resources' | 'quizzes' | 'assignments'>('content')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [resourcesViewed, setResourcesViewed] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Submission forms per assignment
  const [submissionForms, setSubmissionForms] = useState<Record<string, { text: string; fileUrl: string; fileName: string; submitted: boolean }>>({})

  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [user, isLoading, router])
  useEffect(() => { if (lessonId) loadLesson() }, [lessonId])

  async function loadLesson() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/lessons/${lessonId}`, { headers: hdrs() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lesson not found')
      setLesson(data.lesson)
      setResources(data.resources ?? [])
      setQuizzes(data.quizzes ?? [])
      setAssignments(data.assignments ?? [])

      // Initialize submission forms
      const forms: Record<string, any> = {}
      for (const a of data.assignments ?? []) {
        forms[a.id] = { text: '', fileUrl: '', fileName: '', submitted: false }
      }
      setSubmissionForms(forms)

      // Track that student started this lesson
      try {
        await fetch(`${API}/lessons/${lessonId}/progress`, {
          method: 'POST', headers: hdrs(),
          body: JSON.stringify({ progressPct: 10, resourcesViewed: 0 })
        })
      } catch {}
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  async function markResourceViewed(resourceId: string) {
    const newCount = resourcesViewed + 1
    setResourcesViewed(newCount)
    const totalResources = resources.length
    const pct = Math.min(Math.round((newCount / Math.max(totalResources, 1)) * 60) + 10, 70)
    await fetch(`${API}/lessons/${lessonId}/progress`, {
      method: 'POST', headers: hdrs(),
      body: JSON.stringify({ progressPct: pct, resourcesViewed: newCount })
    })
  }

  async function submitAssignment(assignmentId: string) {
    const form = submissionForms[assignmentId]
    if (!form?.text && !form?.fileUrl) { setError('Please enter a response or upload a file'); return }
    setSubmitting(true); setError('')
    try {
      await fetch(`${API}/lessons/assignments/${assignmentId}/submit`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          textResponse: form.text || undefined,
          fileUrl: form.fileUrl || undefined,
          fileName: form.fileName || undefined,
        })
      })
      setSubmissionForms(prev => ({ ...prev, [assignmentId]: { ...prev[assignmentId], submitted: true } }))
      setSuccess('Assignment submitted successfully!')
      setTimeout(() => setSuccess(''), 3000)

      // Update progress
      const allSubmitted = assignments.every(a => a.id === assignmentId || submissionForms[a.id]?.submitted)
      if (allSubmitted) {
        await fetch(`${API}/lessons/${lessonId}/progress`, {
          method: 'POST', headers: hdrs(),
          body: JSON.stringify({ progressPct: 100, resourcesViewed, assignmentSubmitted: true })
        })
      } else {
        await fetch(`${API}/lessons/${lessonId}/progress`, {
          method: 'POST', headers: hdrs(),
          body: JSON.stringify({ progressPct: 85, resourcesViewed, assignmentSubmitted: true })
        })
      }
    } catch { setError('Failed to submit assignment') } finally { setSubmitting(false) }
  }

  async function handleFileUpload(assignmentId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFile(true); setError('')
    try {
      const url = await uploadFile(file, `submissions/${lessonId}`)
      setSubmissionForms(prev => ({ ...prev, [assignmentId]: { ...prev[assignmentId], fileUrl: url, fileName: file.name } }))
    } catch { setError('File upload failed') } finally { setUploadingFile(false) }
  }

  if (isLoading || !user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <p style={{ color: '#6b6b65' }}>Loading lesson...</p>
    </div>
  )

  if (error && !lesson) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' as const }}>
        <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</p>
        <button onClick={() => router.back()} style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Go back</button>
      </div>
    </div>
  )

  const initials = user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => router.push('/student/lessons')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65' }}>← My Lessons</button>
            <div style={{ width: 1, height: 20, background: '#e5e5e0' }} />
            <h1 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{lesson?.title}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{user.fullName}</p>
            <div style={{ width: 36, height: 36, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>
              {initials}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Lesson header */}
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.875rem', marginBottom: '0.75rem', flexWrap: 'wrap' as const }}>
            {lesson?.subject_name && <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0.2rem 0.625rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af' }}>{lesson.subject_name}</span>}
            {lesson?.week_number && <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>Week {lesson.week_number}</span>}
            {lesson?.estimated_duration_mins && <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>⏱ {lesson.estimated_duration_mins} min</span>}
            <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>👤 {lesson?.teacher_name}</span>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>{lesson?.title}</h2>
          {lesson?.objectives?.length > 0 && (
            <div style={{ background: '#f7f7f5', borderRadius: '10px', padding: '0.875rem 1.25rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', marginBottom: '0.5rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Learning Objectives</p>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {lesson.objectives.map((obj: string, i: number) => (
                  <li key={i} style={{ fontSize: '0.825rem', color: '#3a3a36', marginBottom: '0.25rem' }}>{obj}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
        {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
          {([
            { key: 'content', label: '📄 Lesson' },
            { key: 'resources', label: `📎 Resources (${resources.length})` },
            { key: 'quizzes', label: `❓ Quizzes (${quizzes.length})` },
            { key: 'assignments', label: `📝 Tasks (${assignments.length})` },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '0.625rem 1rem', fontSize: '0.825rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65', whiteSpace: 'nowrap' as const }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT TAB */}
        {activeTab === 'content' && (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
            {lesson?.introduction && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a6b4a', marginBottom: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Introduction</h3>
                <p style={{ fontSize: '0.925rem', color: '#3a3a36', lineHeight: 1.8, whiteSpace: 'pre-wrap' as const }}>{lesson.introduction}</p>
              </div>
            )}
            {lesson?.main_content && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a6b4a', marginBottom: '0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Lesson Content</h3>
                <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.5rem' }}>
                  <p style={{ fontSize: '0.925rem', color: '#3a3a36', lineHeight: 1.9, whiteSpace: 'pre-wrap' as const }}>{lesson.main_content}</p>
                </div>
              </div>
            )}
            {lesson?.conclusion && (
              <div style={{ background: '#e8f5ee', borderRadius: '12px', padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f4a32', marginBottom: '0.5rem' }}>📌 Summary</h3>
                <p style={{ fontSize: '0.925rem', color: '#1a6b4a', lineHeight: 1.8, whiteSpace: 'pre-wrap' as const }}>{lesson.conclusion}</p>
              </div>
            )}
            {!lesson?.introduction && !lesson?.main_content && !lesson?.conclusion && (
              <p style={{ fontSize: '0.875rem', color: '#a0a09a', textAlign: 'center' as const, padding: '2rem' }}>No lesson content available.</p>
            )}
            {/* Nav to resources */}
            {resources.length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e5e0', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setActiveTab('resources')}
                  style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                  View Resources →
                </button>
              </div>
            )}
          </div>
        )}

        {/* RESOURCES TAB */}
        {activeTab === 'resources' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {resources.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
                <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No resources for this lesson.</p>
              </div>
            ) : resources.map(r => {
              const ytId = r.resource_type === 'video_link' ? getYoutubeId(r.url) : null
              return (
                <div key={r.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
                  {ytId && (
                    <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}`}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                        allowFullScreen
                        title={r.title}
                        onLoad={() => markResourceViewed(r.id)}
                      />
                    </div>
                  )}
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>{RESOURCE_ICONS[r.resource_type] ?? '📄'}</span>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{r.title}</p>
                        {r.description && <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{r.description}</p>}
                      </div>
                    </div>
                    {!ytId && (
                      <a href={r.url} target="_blank" rel="noreferrer"
                        onClick={() => markResourceViewed(r.id)}
                        style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>
                        Open ↗
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* QUIZZES TAB */}
        {activeTab === 'quizzes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {quizzes.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
                <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No quizzes for this lesson.</p>
              </div>
            ) : quizzes.map(q => (
              <div key={q.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>❓</span>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{q.title}</h3>
                      {q.is_required && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#fef2f2', color: '#dc2626' }}>Required</span>}
                    </div>
                    {q.instructions && <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '0.75rem' }}>{q.instructions}</p>}
                    {q.exam_title && <p style={{ fontSize: '0.78rem', color: '#7e22ce', marginBottom: '0.875rem' }}>📋 {q.exam_title} · {q.duration_minutes} minutes</p>}
                  </div>
                </div>
                {q.exam_id ? (
                  <button onClick={() => router.push(`/student/exam/${q.exam_id}`)}
                    style={{ padding: '0.625rem 1.5rem', background: '#7e22ce', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                    Start Quiz →
                  </button>
                ) : (
                  <div style={{ background: '#f5f3ff', borderRadius: '10px', padding: '1rem', fontSize: '0.825rem', color: '#7e22ce' }}>
                    This quiz will be available soon. Check with your teacher.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ASSIGNMENTS TAB */}
        {activeTab === 'assignments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {assignments.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
                <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No assignments for this lesson.</p>
              </div>
            ) : assignments.map(a => {
              const form = submissionForms[a.id] ?? { text: '', fileUrl: '', fileName: '', submitted: false }
              const isPastDue = a.due_date && new Date(a.due_date) < new Date()
              return (
                <div key={a.id} style={{ background: 'white', border: `1px solid ${form.submitted ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '14px', padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{a.title}</h3>
                        {a.is_required && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#fef2f2', color: '#dc2626' }}>Required</span>}
                        {form.submitted && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#e8f5ee', color: '#0f4a32' }}>✓ Submitted</span>}
                      </div>
                      <p style={{ fontSize: '0.875rem', color: '#3a3a36', lineHeight: 1.6, marginBottom: '0.5rem' }}>{a.instructions}</p>
                      <div style={{ display: 'flex', gap: '0.875rem' }}>
                        {a.due_date && <span style={{ fontSize: '0.72rem', color: isPastDue ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                          {isPastDue ? '⚠ Due date passed' : `Due: ${new Date(a.due_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                        </span>}
                        <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Max: {a.max_score} pts</span>
                      </div>
                    </div>
                  </div>

                  {!form.submitted && (
                    <div style={{ borderTop: '1px solid #f0f0ee', paddingTop: '1rem' }}>
                      {(a.submission_type === 'text' || a.submission_type === 'both') && (
                        <div style={{ marginBottom: '0.875rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Your Answer</label>
                          <textarea
                            value={form.text}
                            onChange={e => setSubmissionForms(prev => ({ ...prev, [a.id]: { ...prev[a.id], text: e.target.value } }))}
                            rows={4}
                            placeholder="Type your answer here..."
                            style={{ padding: '0.75rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const }}
                          />
                        </div>
                      )}
                      {(a.submission_type === 'file' || a.submission_type === 'both') && (
                        <div style={{ marginBottom: '0.875rem' }}>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Upload File (optional)</label>
                          <input type="file" onChange={e => handleFileUpload(a.id, e)} disabled={uploadingFile} style={{ fontSize: '0.825rem' }} />
                          {uploadingFile && <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.375rem' }}>Uploading...</p>}
                          {form.fileUrl && <p style={{ fontSize: '0.72rem', color: '#1a6b4a', marginTop: '0.375rem' }}>✅ {form.fileName} uploaded</p>}
                        </div>
                      )}
                      <button onClick={() => submitAssignment(a.id)} disabled={submitting || isPastDue}
                        style={{ padding: '0.625rem 1.5rem', background: isPastDue ? '#a0a09a' : '#0891b2', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: isPastDue ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}>
                        {submitting ? 'Submitting...' : isPastDue ? 'Submission closed' : '📤 Submit Assignment'}
                      </button>
                    </div>
                  )}

                  {form.submitted && (
                    <div style={{ background: '#e8f5ee', borderRadius: '10px', padding: '1rem', fontSize: '0.825rem', color: '#0f4a32' }}>
                      ✅ Your assignment has been submitted. Your teacher will review and grade it.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}