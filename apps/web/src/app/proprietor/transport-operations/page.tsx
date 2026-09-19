'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL
const SEVERITY_COLORS: Record<string, { color: string; bg: string }> = {
  low: { color: '#1e40af', bg: '#eff6ff' }, medium: { color: '#d97706', bg: '#fffbeb' }, high: { color: '#dc2626', bg: '#fef2f2' },
}

export default function ProprietorTransportOpsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<any[]>([])
  const [maintenance, setMaintenance] = useState<any[]>([])
  const [view, setView] = useState<'incidents' | 'maintenance'>('incidents')
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => { load() }, [view])

  async function load() {
    setLoading(true)
    try {
      if (view === 'incidents') {
        const res = await apiFetch(`${API}/transport/incidents`)
        const data = await res.json()
        setIncidents(data.incidents ?? [])
      } else {
        const res = await apiFetch(`${API}/transport/maintenance`)
        const data = await res.json()
        setMaintenance(data.records ?? [])
      }
    } catch {} finally { setLoading(false) }
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Transport Operations</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of incidents and maintenance history.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {(['incidents', 'maintenance'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1.5px solid #e5e5e0', background: view === v ? '#1a6b4a' : 'white', color: view === v ? 'white' : '#6b6b65', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer', textTransform: 'capitalize' as const }}>
            {v}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#6b6b65', textAlign: 'center' as const, padding: '2rem' }}>Loading…</p>
      ) : view === 'incidents' ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr 100px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Bus</span><span>Type</span><span>Description</span><span>Date</span><span>Severity</span>
          </div>
          {incidents.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No incidents recorded.</p>
          ) : incidents.map((i: any) => {
            const cfg = SEVERITY_COLORS[i.severity] ?? { color: '#6b6b65', bg: '#f7f7f5' }
            return (
              <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr 100px', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.825rem' }}>
                <span>{i.bus_name}</span>
                <span style={{ color: '#6b6b65', textTransform: 'capitalize' as const }}>{i.incident_type.replace('_', ' ')}</span>
                <span style={{ color: '#6b6b65' }}>{i.description}</span>
                <span style={{ color: '#6b6b65' }}>{new Date(i.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color, width: 'fit-content', textTransform: 'capitalize' as const }}>{i.severity}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Bus</span><span>Type</span><span>Description</span><span>Cost</span><span>Date</span>
          </div>
          {maintenance.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No maintenance records found.</p>
          ) : maintenance.map((m: any) => (
            <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr 1fr', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.825rem' }}>
              <span>{m.bus_name}</span>
              <span style={{ color: '#6b6b65', textTransform: 'capitalize' as const }}>{m.maintenance_type}</span>
              <span style={{ color: '#6b6b65' }}>{m.description}</span>
              <span style={{ fontWeight: 600 }}>₦{Number(m.cost).toLocaleString()}</span>
              <span style={{ color: '#6b6b65' }}>{new Date(m.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}