'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending: { color: '#6b6b65', bg: '#f7f7f5' }, reviewing: { color: '#1e40af', bg: '#eff6ff' },
  offered: { color: '#7e22ce', bg: '#f5f3ff' }, accepted: { color: '#0f4a32', bg: '#e8f5ee' },
  rejected: { color: '#dc2626', bg: '#fef2f2' }, waitlisted: { color: '#d97706', bg: '#fffbeb' },
  enrolled: { color: '#0f4a32', bg: '#e8f5ee' },
}

export default function ProprietorAdmissionsPage() {
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    try {
      const [statsRes, appsRes] = await Promise.all([
        apiFetch(`${API}/admissions/stats`),
        apiFetch(`${API}/admissions/applications${statusFilter ? `?status=${statusFilter}` : ''}`),
      ])
      const statsData = await statsRes.json()
      const appsData = await appsRes.json()
      setStats(statsData.stats)
      setApplications(appsData.applications ?? [])
    } catch {} finally { setLoading(false) }
  }

  const STATUSES = ['pending', 'reviewing', 'offered', 'accepted', 'rejected', 'waitlisted', 'enrolled']

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Admissions</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of the admissions pipeline.</p>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {STATUSES.map(s => (
            <div key={s} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '10px', padding: '0.875rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: STATUS_COLORS[s]?.color ?? '#1a1a18' }}>{stats[s] ?? 0}</p>
              <p style={{ fontSize: '0.65rem', color: '#6b6b65', textTransform: 'capitalize' as const }}>{s}</p>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' as const }}>
        <button onClick={() => setStatusFilter('')}
          style={{ padding: '0.4rem 1rem', borderRadius: 20, border: '1px solid #e5e5e0', background: !statusFilter ? '#1a6b4a' : 'white', color: !statusFilter ? 'white' : '#6b6b65', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>
          All
        </button>
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding: '0.4rem 1rem', borderRadius: 20, border: '1px solid #e5e5e0', background: statusFilter === s ? '#1a6b4a' : 'white', color: statusFilter === s ? 'white' : '#6b6b65', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' as const }}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#6b6b65', textAlign: 'center' as const, padding: '2rem' }}>Loading…</p>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr 100px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Applicant</span><span>App. No.</span><span>Class</span><span>Parent</span><span>Status</span>
          </div>
          {applications.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No applications found.</p>
          ) : applications.map((a: any) => {
            const cfg = STATUS_COLORS[a.status] ?? { color: '#6b6b65', bg: '#f7f7f5' }
            return (
              <div key={a.applicant_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr 100px', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.875rem' }}>
                <span style={{ fontWeight: 500 }}>{a.first_name} {a.last_name}</span>
                <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{a.application_number}</span>
                <span style={{ color: '#6b6b65' }}>{a.applied_class}</span>
                <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{a.parent_name}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color, width: 'fit-content', textTransform: 'capitalize' as const }}>{a.status}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}