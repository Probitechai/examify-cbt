'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../hooks/useAuth'

const API = process.env.NEXT_PUBLIC_API_URL

`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}

export default function StudentLearningPathsPage() {
  const router = useRouter()
  const { user, isLoading, hydrate } = useAuthStore()
  const [paths, setPaths] = useState<any[]>([])
  const [selectedPath, setSelectedPath] = useState<any>(null)
  const [pathProgress, setPathProgress] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [user, isLoading, router])
  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => { if (user) loadPaths() }, [user])

  async function loadPaths() {
    try {
      const cl = (user as any)?.classLevel ?? ''
      const res = await apiFetch(`${API}/learning-paths?classLevel=${cl}`)
      const data = await res.json()
      const published = (data.paths ?? []).filter((p: any) => p.is_published)
      setPaths(published)
    } catch {} finally { setLoading(false) }
  }

  async function loadPathProgress(pathId: string) {
    const [pathRes, progressRes] = await Promise.all([
      apiFetch(`${API}/learning-paths/${pathId}`),
      apiFetch(`${API}/learning-paths/${pathId}/progress`),
    ])
    const pathData = await pathRes.json()
    const progressData = await progressRes.json()
    setSelectedPath(pathData.path)
    setPathProgress(progressData)
  }

  if (isLoading || !user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const initials = user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => router.push('/student')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65' }}>← Dashboard</button>
            <div style={{ width: 1, height: 20, background: '#e5e5e0' }} />
            <h1 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Learning Paths</h1>
          </div>
          <div style={{ width: 36, height: 36, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>{initials}</div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center' as const, padding: '3rem', color: '#6b6b65' }}>Loading...</div>
        ) : paths.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '4rem', textAlign: 'center' as const }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🗺️</p>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No learning paths yet</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Your teachers haven't published any learning paths yet.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selectedPath ? '1fr 1.5fr' : 'repeat(2, 1fr)', gap: '1.5rem' }}>
            {/* Path cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {paths.map(path => (
                <div key={path.id}
                  onClick={() => loadPathProgress(path.id)}
                  style={{ background: 'white', border: `2px solid ${selectedPath?.id === path.id ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '14px', padding: '1.25rem', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ width: 40, height: 40, background: '#e8f5ee', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>🗺️</div>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.1rem' }}>{path.title}</h3>
                      <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{path.subject_name} · {path.step_count} steps · {path.is_sequential ? 'Sequential' : 'Open'}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', color: '#1a6b4a', fontWeight: 600 }}>{path.term_name}</span>
                    <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Click to view →</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Path progress detail */}
            {selectedPath && pathProgress && (
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{selectedPath.title}</h2>
                  <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '1rem' }}>{selectedPath.subject_name} · {selectedPath.class_level}</p>

                  {/* Progress bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a1a18' }}>Your Progress</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a6b4a' }}>{pathProgress.progress.pct}%</span>
                  </div>
                  <div style={{ height: 8, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{ width: `${pathProgress.progress.pct}%`, height: '100%', background: '#1a6b4a', borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
                    {pathProgress.progress.completed} of {pathProgress.progress.total} steps completed
                  </p>
                </div>

                {/* Steps */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {pathProgress.steps.map((step: any, i: number) => {
                    const isCompleted = !!step.completed_at
                    const prevCompleted = i === 0 || !!pathProgress.steps[i - 1]?.completed_at
                    const isLocked = selectedPath.is_sequential && !prevCompleted && !isCompleted
                    const canStart = !isLocked && step.lesson_id && step.lesson_status === 'published'

                    return (
                      <div key={step.step_id} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
                        {/* Step indicator */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.825rem', fontWeight: 700, background: isCompleted ? '#1a6b4a' : isLocked ? '#f0f0ee' : '#eff6ff', color: isCompleted ? 'white' : isLocked ? '#a0a09a' : '#1e40af', border: `2px solid ${isCompleted ? '#1a6b4a' : isLocked ? '#e5e5e0' : '#bfdbfe'}` }}>
                            {isCompleted ? '✓' : isLocked ? '🔒' : step.step_number}
                          </div>
                          {i < pathProgress.steps.length - 1 && (
                            <div style={{ width: 2, height: 24, background: isCompleted ? '#1a6b4a' : '#e5e5e0', marginTop: 4 }} />
                          )}
                        </div>

                        {/* Step content */}
                        <div style={{ flex: 1, paddingBottom: '0.75rem' }}>
                          <div style={{ background: isLocked ? '#f7f7f5' : 'white', border: `1px solid ${isCompleted ? '#1a6b4a' : isLocked ? '#e5e5e0' : '#e5e5e0'}`, borderRadius: '10px', padding: '0.875rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: isLocked ? '#a0a09a' : '#1a1a18', marginBottom: '0.25rem' }}>
                                  Step {step.step_number}: {step.title}
                                </p>
                                {step.lesson_title && (
                                  <p style={{ fontSize: '0.72rem', color: isLocked ? '#a0a09a' : '#6b6b65' }}>
                                    📖 {step.lesson_title}
                                  </p>
                                )}
                                {isCompleted && step.completed_at && (
                                  <p style={{ fontSize: '0.68rem', color: '#1a6b4a', marginTop: '0.25rem' }}>
                                    ✓ Completed {new Date(step.completed_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                                  </p>
                                )}
                                {step.progress_pct && !isCompleted && (
                                  <p style={{ fontSize: '0.68rem', color: '#d97706', marginTop: '0.25rem' }}>
                                    In progress: {step.progress_pct}%
                                  </p>
                                )}
                              </div>
                              {canStart && (
                                <button
                                  onClick={() => router.push(`/student/lessons/${step.lesson_id}`)}
                                  style={{ padding: '0.375rem 0.875rem', background: isCompleted ? '#e8f5ee' : '#1a6b4a', color: isCompleted ? '#0f4a32' : 'white', border: 'none', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0, marginLeft: '0.75rem' }}>
                                  {isCompleted ? 'Review' : step.progress_pct ? 'Continue' : 'Start'}
                                </button>
                              )}
                              {isLocked && (
                                <span style={{ fontSize: '0.68rem', color: '#a0a09a', flexShrink: 0, marginLeft: '0.75rem' }}>
                                  Complete step {step.step_number - 1} first
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {pathProgress.progress.pct === 100 && (
                  <div style={{ marginTop: '1.25rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '12px', padding: '1.25rem', textAlign: 'center' as const }}>
                    <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🎉</p>
                    <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f4a32', marginBottom: '0.25rem' }}>Path Complete!</p>
                    <p style={{ fontSize: '0.825rem', color: '#1a6b4a' }}>You've completed all steps in this learning path.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}