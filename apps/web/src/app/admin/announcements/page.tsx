'use client'
import { useState, useEffect } from 'react'

interface Announcement {
  id: string
  title: string
  body: string
  audience: 'all' | 'parents' | 'teachers' | 'students'
  created_at: string
  posted_by_name: string
}

const AUDIENCE_CONFIG = {
  all: { label: 'Everyone', icon: '🌐', color: '#1a6b4a', bg: '#e8f5ee' },
  parents: { label: 'Parents only', icon: '👨‍👩‍👧', color: '#1e40af', bg: '#eff6ff' },
  teachers: { label: 'Teachers only', icon: '👩‍🏫', color: '#7e22ce', bg: '#f5f3ff' },
  students: { label: 'Students only', icon: '🎓', color: '#d97706', bg: '#fffbeb' },
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

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'all' | 'parents' | 'teachers' | 'students'>('all')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => { loadAnnouncements() }, [])

  async function loadAnnouncements() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/announcements`, { headers: hdrs() })
      const data = await res.json()
      setAnnouncements(data.announcements ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function handlePost() {
    if (!title.trim() || !body.trim()) { setError('Title and message are required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/announcements`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ title: title.trim(), body: body.trim(), audience })
      })
      if (!res.ok) throw new Error('Failed to post')
      setTitle(''); setBody(''); setAudience('all'); setShowForm(false)
      setSuccess('Announcement posted successfully!')
      setTimeout(() => setSuccess(''), 4000)
      loadAnnouncements()
    } catch { setError('Failed to post announcement') } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this announcement?')) return
    await fetch(`${API}/announcements/${id}`, { method: 'DELETE', headers: hdrs() })
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Announcements</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Post messages to parents, teachers, students or everyone.</p>
        </div>
        <button onClick={() => { setShowForm(true); setError('') }}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
          + New announcement
        </button>
      </div>

      {/* New announcement form */}
      {showForm && (
        <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>New Announcement</h2>

          {/* Audience selector */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.5rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Send to</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
              {(Object.entries(AUDIENCE_CONFIG) as [keyof typeof AUDIENCE_CONFIG, typeof AUDIENCE_CONFIG[keyof typeof AUDIENCE_CONFIG]][]).map(([key, cfg]) => (
                <button key={key} onClick={() => setAudience(key)}
                  style={{ padding: '0.5rem 1rem', border: `1.5px solid ${audience === key ? cfg.color : '#e5e5e0'}`, borderRadius: '20px', background: audience === key ? cfg.bg : 'white', color: audience === key ? cfg.color : '#6b6b65', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s' }}>
                  {cfg.icon} {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Title</label>
            <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. End of term examination timetable" autoFocus />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Message</label>
            <textarea
              style={{ ...inp, resize: 'vertical' as const }}
              rows={5}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Type your announcement here…"
            />
          </div>

          {error && <p style={{ fontSize: '0.825rem', color: '#dc2626', marginBottom: '0.75rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handlePost} disabled={saving}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Posting…' : '📢 Post announcement'}
            </button>
            <button onClick={() => { setShowForm(false); setError('') }}
              style={{ padding: '0.625rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {success && (
        <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>
          ✅ {success}
        </div>
      )}

      {/* Announcements list */}
      {loading ? (
        <div style={{ background: 'white', borderRadius: '14px', padding: '3rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
          <p style={{ color: '#6b6b65' }}>Loading…</p>
        </div>
      ) : announcements.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📢</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No announcements yet</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Post your first announcement to parents, teachers or students.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {announcements.map(a => {
            const cfg = AUDIENCE_CONFIG[a.audience]
            const isExpanded = expandedId === a.id
            return (
              <div key={a.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1rem 1.25rem', cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}>
                  <div style={{ flex: 1, marginRight: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>{a.title}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' as const }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>
                      Posted by {a.posted_by_name} · {timeAgo(a.created_at)}
                    </p>
                    {!isExpanded && (
                      <p style={{ fontSize: '0.825rem', color: '#3a3a36', marginTop: '0.375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 500 }}>
                        {a.body}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <button onClick={e => { e.stopPropagation(); handleDelete(a.id) }}
                      style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer' }}>
                      Delete
                    </button>
                    <span style={{ fontSize: '0.825rem', color: '#a0a09a' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid #f0f0ee' }}>
                    <p style={{ fontSize: '0.875rem', color: '#1a1a18', lineHeight: 1.7, whiteSpace: 'pre-wrap' as const, marginTop: '0.875rem' }}>
                      {a.body}
                    </p>
                    <p style={{ fontSize: '0.72rem', color: '#a0a09a', marginTop: '0.875rem' }}>
                      {new Date(a.created_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}