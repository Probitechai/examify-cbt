'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

export default function ProprietorHostelsPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [report, setReport] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => { loadSessions() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
  useEffect(() => { if (selectedTerm) loadReport() }, [selectedTerm])

  async function loadSessions() {
    const res = await apiFetch(`${API}/sessions`)
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: any) => s.is_active)
    if (active) setSelectedSession(active.id)
    setLoading(false)
  }
  async function loadTerms(sessionId: string) {
    const res = await apiFetch(`${API}/sessions/${sessionId}/terms`)
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }
  async function loadReport() {
    setLoadingReport(true)
    const res = await apiFetch(`${API}/hostels/occupancy?termId=${selectedTerm}`)
    const data = await res.json()
    setReport(data.report ?? [])
    setLoadingReport(false)
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 900 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Hostel Management</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of hostel occupancy for the selected term.</p>

      <div style={{ marginBottom: '1.25rem', maxWidth: 260 }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.3rem', textTransform: 'uppercase' as const }}>Term</label>
        <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}
          style={{ width: '100%', padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer' }}>
          <option value="">Select…</option>
          {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
        </select>
      </div>

      {loadingReport ? (
        <p style={{ color: '#6b6b65', textAlign: 'center' as const, padding: '2rem' }}>Loading…</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {report.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65', gridColumn: '1 / -1' }}>No hostels found, or select a term above.</p>
          ) : report.map((h: any) => (
            <div key={h.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{h.name}</p>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65', textTransform: 'capitalize' as const }}>{h.type} · {h.housemaster_name ?? 'No housemaster assigned'}</p>
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(h.occupancy_pct ?? 0) >= 90 ? '#dc2626' : '#1a6b4a' }}>{h.occupancy_pct ?? 0}%</span>
              </div>
              <div style={{ height: 6, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div style={{ width: `${h.occupancy_pct ?? 0}%`, height: '100%', background: '#1a6b4a', borderRadius: 3 }} />
              </div>
              <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{h.occupied_beds ?? 0} of {h.total_beds ?? 0} beds occupied · {h.available_beds ?? 0} available</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}