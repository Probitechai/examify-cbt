'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../hooks/useAuth'

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

export default function StudentLiveClassesPage() {
  const router = useRouter()
  const { user, isLoading, hydrate } = useAuthStore()
  const [classes, setClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [user, isLoading, router])
  useEffect(() => { if (user) loadClasses() }, [user])

  async function loadClasses() {
    try {
      const cl = (user as any)?.classLevel ?? ''
      const res = await fetch(`${API}/live-classes?classLevel=${cl}`, { headers: hdrs() })
      const data = await res.json()
      setClasses(data.classes ?? [])
    } catch {} finally { setLoading(false) }
  }

  if (isLoading || !user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const initials = user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const liveNow = classes.filter(c => c.status === 'live')
  const upcoming = classes.filter(c => c.status === 'scheduled')
  const past = classes.filter(c => c.status === 'ended' && c.recording_url)

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => router.push('/student')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65' }}>← Dashboard</button>
            <div style={{ width: 1, height: 20, background: '#e5e5e0' }} />
            <h1 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Live Classes</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{user.fullName}</p>
            <div style={{ width: 36, height: 36, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>{initials}</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center' as const, padding: '3rem', color: '#6b6b65' }}>Loading...</div>
        ) : (
          <>
            {/* Live Now */}
            {liveNow.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#dc2626', marginBottom: '1rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>🔴 Happening Now</h2>
                {liveNow.map(c => (
                  <div key={c.id} style={{ background: 'white', border: '2px solid #fecaca', borderRadius: '16px', padding: '1.5rem', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.25rem' }}>{c.title}</h3>
                        <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{c.subject_name && `${c.subject_name} · `}Taught by {c.teacher_name}</p>
                        {c.description && <p style={{ fontSize: '0.825rem', color: '#3a3a36', marginTop: '0.375rem' }}>{c.description}</p>}
                      </div>
                      <button onClick={() => window.open(`https://meet.jit.si/${c.jitsi_room}`, '_blank')}
                        style={{ padding: '0.75rem 1.5rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, marginLeft: '1rem' }}>
                        🔴 Join Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af', marginBottom: '1rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>📅 Upcoming Classes</h2>
                {upcoming.map(c => (
                  <div key={c.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{c.title}</h3>
                      <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>
                        {c.subject_name && `${c.subject_name} · `}
                        {new Date(c.scheduled_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        {c.duration_mins && ` · ${c.duration_mins} min`}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: '#a0a09a' }}>By {c.teacher_name}</p>
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.3rem 0.875rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af', flexShrink: 0 }}>Scheduled</span>
                  </div>
                ))}
              </div>
            )}

            {/* Recordings */}
            {past.length > 0 && (
              <div>
                <h2 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b6b65', marginBottom: '1rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>📼 Recorded Classes</h2>
                {past.map(c => (
                  <div key={c.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{c.title}</h3>
                      <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>
                        {c.subject_name && `${c.subject_name} · `}
                        {new Date(c.scheduled_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <a href={c.recording_url} target="_blank" rel="noreferrer"
                      style={{ padding: '0.375rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', flexShrink: 0 }}>
                      📼 Watch Recording
                    </a>
                  </div>
                ))}
              </div>
            )}

            {classes.length === 0 && (
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '4rem', textAlign: 'center' as const }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎥</p>
                <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No live classes yet</p>
                <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Your teachers haven't scheduled any live classes yet. Check back later.</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}