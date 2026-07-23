'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../hooks/useAuth'

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

export default function StudentLessonsPage() {
  const router = useRouter()
  const { user, isLoading, hydrate } = useAuthStore()
  const [lessons, setLessons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role !== 'student') router.replace('/admin')
  }, [user, isLoading, router])
  useEffect(() => { if (user) loadLessons() }, [user])

  async function loadLessons() {
    try {
      const cl = (user as any)?.classLevel ?? ''
      const res = await fetch(`${API}/lessons?classLevel=${cl}`, { headers: hdrs() })
      const data = await res.json()
      setLessons((data.lessons ?? []).filter((l: any) => l.status === 'published'))
    } catch {} finally { setLoading(false) }
  }

  if (isLoading || !user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const initials = user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => router.push('/student')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65' }}>← Dashboard</button>
            <div style={{ width: 1, height: 20, background: '#e5e5e0' }} />
            <h1 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>My Lessons</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{user.fullName}</p>
            <div style={{ width: 36, height: 36, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>
              {initials}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>
          {(user as any).classLevel} {(user as any).classArm} — Published lesson plans from your teachers
        </p>

        {loading ? (
          <div style={{ textAlign: 'center' as const, padding: '3rem', color: '#6b6b65' }}>Loading lessons...</div>
        ) : lessons.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '4rem', textAlign: 'center' as const }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📖</p>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No lessons yet</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Your teachers haven't published any lessons for your class yet. Check back later.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {lessons.map((lesson: any) => (
              <div key={lesson.id}
                onClick={() => router.push(`/student/lessons/${lesson.id}`)}
                style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '1.25rem', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  {lesson.week_number && <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af' }}>Week {lesson.week_number}</span>}
                  {lesson.estimated_duration_mins && <span style={{ fontSize: '0.7rem', color: '#a0a09a' }}>⏱ {lesson.estimated_duration_mins}min</span>}
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem', lineHeight: 1.4 }}>{lesson.title}</h3>
                <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '0.875rem' }}>
                  {lesson.subject_name && `${lesson.subject_name} · `}By {lesson.teacher_name}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f0ee' }}>
                  {Number(lesson.resource_count) > 0 && <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>📎 {lesson.resource_count}</span>}
                  {Number(lesson.quiz_count) > 0 && <span style={{ fontSize: '0.72rem', color: '#7e22ce' }}>❓ {lesson.quiz_count} quiz</span>}
                  {Number(lesson.assignment_count) > 0 && <span style={{ fontSize: '0.72rem', color: '#0891b2' }}>📝 {lesson.assignment_count} task</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
