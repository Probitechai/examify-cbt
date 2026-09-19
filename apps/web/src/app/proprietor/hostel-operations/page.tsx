'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL
const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  pending: { color: '#d97706', bg: '#fffbeb' }, approved: { color: '#0f4a32', bg: '#e8f5ee' },
  rejected: { color: '#dc2626', bg: '#fef2f2' }, returned: { color: '#6b6b65', bg: '#f7f7f5' },
}

export default function ProprietorHostelOpsPage() {
  const router = useRouter()
  const [view, setView] = useState<'exeats' | 'visitors'>('exeats')
  const [exeats, setExeats] = useState<any[]>([])
  const [visitors, setVisitors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => { load() }, [view])

  async function load() {
    setLoading(true)
    try {
      if (view === 'exeats') {
        const res = await apiFetch(`${API}/hostels/exeats`)
        const data = await res.json()
        setExeats(data.exeats ?? [])
      } else {
        const res = await apiFetch(`${API}/hostels/visitors`)
        const data = await res.json()
        setVisitors(data.visitors ?? [])
      }
    } catch {} finally { setLoading(false) }
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Hostel Operations</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of recent exeat requests and visitor logs.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['exeats', 'visitors'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1.5px solid #e5e5e0', background: view === v ? '#1a6b4a' : 'white', color: view === v ? 'white' : '#6b6b65', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' as const }}>
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#6b6b65', textAlign: 'center' as const, padding: '2rem' }}>Loading…</p>
      ) : view === 'exeats' ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr 100px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Student</span><span>Hostel</span><span>Destination</span><span>Departure</span><span>Return</span><span>Status</span>
          </div>
          {exeats.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No exeat requests found.</p>
          ) : exeats.map((e: any) => {
            const cfg = STATUS_COLORS[e.status] ?? { color: '#6b6b65', bg: '#f7f7f5' }
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr 1fr 1fr 100px', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.825rem' }}>
                <span>{e.student_name}</span>
                <span style={{ color: '#6b6b65' }}>{e.hostel_name}</span>
                <span style={{ color: '#6b6b65' }}>{e.destination}</span>
                <span style={{ color: '#6b6b65' }}>{new Date(e.departure_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
                <span style={{ color: '#6b6b65' }}>{new Date(e.return_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color, width: 'fit-content', textTransform: 'capitalize' as const }}>{e.status}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Student</span><span>Visitor</span><span>Relationship</span><span>Check-in</span><span>Check-out</span>
          </div>
          {visitors.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No visitor logs found.</p>
          ) : visitors.map((v: any) => (
            <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.825rem' }}>
              <span>{v.student_name}</span>
              <span style={{ color: '#6b6b65' }}>{v.visitor_name}</span>
              <span style={{ color: '#6b6b65' }}>{v.relationship}</span>
              <span style={{ color: '#6b6b65' }}>{new Date(v.check_in_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ color: v.check_out_at ? '#6b6b65' : '#d97706' }}>{v.check_out_at ? new Date(v.check_out_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : 'Still inside'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}