'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

export default function ProprietorTransportPage() {
  const router = useRouter()
  const [buses, setBuses] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [view, setView] = useState<'buses' | 'routes'>('buses')
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => {
    Promise.all([
      apiFetch(`${API}/transport/buses`).then(r => r.json()),
      apiFetch(`${API}/transport/routes`).then(r => r.json()),
    ]).then(([b, r]) => { setBuses(b.buses ?? []); setRoutes(r.routes ?? []) }).catch(console.error).finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Transport</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of the school's fleet and routes.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['buses', 'routes'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1.5px solid #e5e5e0', background: view === v ? '#1a6b4a' : 'white', color: view === v ? 'white' : '#6b6b65', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' as const }}>
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#6b6b65', textAlign: 'center' as const, padding: '2rem' }}>Loading…</p>
      ) : view === 'buses' ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Bus</span><span>Plate</span><span>Capacity</span><span>Driver</span><span>Assigned</span>
          </div>
          {buses.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No buses found.</p>
          ) : buses.map((b: any) => (
            <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 1fr', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.875rem' }}>
              <span style={{ fontWeight: 500 }}>{b.name}</span>
              <span style={{ color: '#6b6b65' }}>{b.plate_number}</span>
              <span style={{ color: '#6b6b65' }}>{b.capacity}</span>
              <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{b.driver_name ?? '—'}{b.driver_phone ? ` · ${b.driver_phone}` : ''}</span>
              <span style={{ fontWeight: 600 }}>{b.assigned_students ?? 0}/{b.capacity}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
          {routes.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65', background: 'white', borderRadius: '14px', border: '1px solid #e5e5e0' }}>No routes found.</p>
          ) : routes.map((r: any) => (
            <div key={r.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>{r.name}</p>
                <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{r.bus_name ?? 'No bus assigned'} · {r.assigned_students ?? 0} students</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{(r.stops ?? []).map((s: any) => s.name).join(' → ') || 'No stops added'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}