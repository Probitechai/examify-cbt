'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Live', color: '#dc2626', bg: '#fef2f2' },
  scheduled: { label: 'Scheduled', color: '#1e40af', bg: '#eff6ff' },
  completed: { label: 'Completed', color: '#0f4a32', bg: '#e8f5ee' },
  cancelled: { label: 'Cancelled', color: '#a0a09a', bg: '#f7f7f5' },
}

export default function ProprietorExamsPage() {
  const router = useRouter()
  const [exams, setExams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => {
    apiFetch(`${API}/exams`).then(r => r.json()).then(d => setExams(d.exams ?? [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? exams : exams.filter(e => e.status === filter)

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Exams</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of every exam created across the school.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {['all', 'active', 'scheduled', 'completed'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '0.4rem 1rem', borderRadius: 20, border: '1px solid #e5e5e0', background: filter === f ? '#1a6b4a' : 'white', color: filter === f ? 'white' : '#6b6b65', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' as const }}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#6b6b65', textAlign: 'center' as const, padding: '2rem' }}>Loading…</p>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Title</span><span>Subject</span><span>Class</span><span>Created by</span><span>Questions</span><span>Status</span>
          </div>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No exams found.</p>
          ) : filtered.map(e => {
            const cfg = STATUS_LABELS[e.status] ?? STATUS_LABELS.scheduled
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px 1fr', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.875rem' }}>
                <span style={{ fontWeight: 500 }}>{e.title}</span>
                <span style={{ color: '#6b6b65' }}>{e.subject}</span>
                <span style={{ color: '#6b6b65' }}>{e.class_level}</span>
                <span style={{ color: '#6b6b65' }}>{e.created_by_name}</span>
                <span>{e.question_count ?? 0}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color, width: 'fit-content' }}>{cfg.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}