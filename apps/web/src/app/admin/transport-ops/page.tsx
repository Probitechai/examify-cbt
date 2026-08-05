'use client'
import { useState, useEffect } from 'react'

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
function formatAmount(n: number) {
  return `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
}
function today() {
  return new Date().toISOString().split('T')[0]
}

type Tab = 'rollcall' | 'incidents' | 'maintenance'

const INCIDENT_TYPES = ['breakdown', 'accident', 'late_arrival', 'misconduct', 'other']
const MAINTENANCE_TYPES = ['routine', 'repair', 'inspection', 'tyre', 'other']
const SEVERITY_COLORS: Record<string, string> = { low: '#16a34a', medium: '#d97706', high: '#dc2626' }
const SEVERITY_BG: Record<string, string> = { low: '#f0fdf4', medium: '#fffbeb', high: '#fef2f2' }

export default function TransportOpsPage() {
  const [tab, setTab] = useState<Tab>('rollcall')
  const [buses, setBuses] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [termId, setTermId] = useState('')
  const [terms, setTerms] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Roll call state
  const [selectedBus, setSelectedBus] = useState('')
  const [selectedDate, setSelectedDate] = useState(today())
  const [rollCalls, setRollCalls] = useState<any[]>([])
  const [activeRollCall, setActiveRollCall] = useState<any>(null)
  const [rollCallEntries, setRollCallEntries] = useState<any[]>([])
  const [rollCallHistory, setRollCallHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Incident state
  const [incidents, setIncidents] = useState<any[]>([])
  const [showIncidentModal, setShowIncidentModal] = useState(false)
  const [incidentForm, setIncidentForm] = useState({ busId: '', date: today(), incidentType: 'breakdown', description: '', severity: 'low' })
  const [showResolveModal, setShowResolveModal] = useState(false)
  const [resolveIncident, setResolveIncident] = useState<any>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')

  // Maintenance state
  const [maintenance, setMaintenance] = useState<any[]>([])
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
  const [maintenanceForm, setMaintenanceForm] = useState({ busId: '', date: today(), maintenanceType: 'routine', description: '', cost: 0, performedBy: '', nextMaintenanceDate: '' })

  useEffect(() => { loadTerms() }, [])
  useEffect(() => { if (termId) { loadBuses(); loadRoutes() } }, [termId])
  useEffect(() => { if (selectedBus && selectedDate && termId) loadRollCalls() }, [selectedBus, selectedDate, termId])
  useEffect(() => { if (tab === 'incidents') loadIncidents() }, [tab])
  useEffect(() => { if (tab === 'maintenance') loadMaintenance() }, [tab])

  async function loadTerms() {
    const sessRes = await fetch(`${API}/sessions`, { headers: hdrs() })
    const sessData = await sessRes.json()
    const sessionList = sessData.sessions ?? []
    setSessions(sessionList)
    const activeSession = sessionList.find((s: any) => s.is_active) ?? sessionList[0]
    if (!activeSession) return
    const termRes = await fetch(`${API}/sessions/${activeSession.id}/terms`, { headers: hdrs() })
    const termData = await termRes.json()
    const termList = termData.terms ?? []
    setTerms(termList)
    const active = termList.find((t: any) => t.is_active) ?? termList[termList.length - 1]
    if (active) setTermId(active.id)
  }

  async function loadBuses() {
    const res = await fetch(`${API}/transport/buses`, { headers: hdrs() })
    const data = await res.json()
    setBuses(data.buses ?? [])
  }

  async function loadRoutes() {
    const res = await fetch(`${API}/transport/routes`, { headers: hdrs() })
    const data = await res.json()
    setRoutes(data.routes ?? [])
  }

  async function loadRollCalls() {
    if (!selectedBus || !selectedDate || !termId) return
    const res = await fetch(`${API}/transport/roll-calls?busId=${selectedBus}&date=${selectedDate}&termId=${termId}`, { headers: hdrs() })
    const data = await res.json()
    setRollCalls(data.rollCalls ?? [])
  }

  async function loadRollCallEntries(rollCallId: string) {
    const res = await fetch(`${API}/transport/roll-calls/${rollCallId}/entries`, { headers: hdrs() })
    const data = await res.json()
    setRollCallEntries(data.entries ?? [])
  }

  async function loadRollCallHistory() {
    if (!selectedBus || !termId) return
    const res = await fetch(`${API}/transport/roll-calls/history?busId=${selectedBus}&termId=${termId}`, { headers: hdrs() })
    const data = await res.json()
    setRollCallHistory(data.history ?? [])
  }

  async function loadIncidents() {
    const res = await fetch(`${API}/transport/incidents`, { headers: hdrs() })
    const data = await res.json()
    setIncidents(data.incidents ?? [])
  }

  async function loadMaintenance() {
    const res = await fetch(`${API}/transport/maintenance`, { headers: hdrs() })
    const data = await res.json()
    setMaintenance(data.records ?? [])
  }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  async function startRollCall(tripType: 'morning' | 'afternoon') {
    if (!selectedBus || !termId) { flash('Select a bus first', true); return }
    const bus = buses.find(b => b.id === selectedBus)
    const route = routes.find(r => r.bus_id === selectedBus)
    if (!route) { flash('No route assigned to this bus', true); return }
    setLoading(true)
    try {
      const res = await fetch(`${API}/transport/roll-calls`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ busId: selectedBus, routeId: route.id, termId, date: selectedDate, tripType })
      })
      const data = await res.json()
      if (!res.ok) { flash(data.message ?? 'Failed to start roll call', true); return }
      flash(`${tripType === 'morning' ? 'Morning' : 'Afternoon'} roll call started`)
      await loadRollCalls()
      setActiveRollCall(data.rollCall)
      await loadRollCallEntries(data.rollCall.id)
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function toggleEntry(entry: any) {
    const newStatus = entry.status === 'present' ? 'absent' : 'present'
    const res = await fetch(`${API}/transport/roll-call-entries/${entry.id}`, {
      method: 'PATCH', headers: hdrs(),
      body: JSON.stringify({ status: newStatus })
    })
    if (res.ok) {
      setRollCallEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: newStatus } : e))
      setRollCalls(prev => prev.map(rc => {
        if (rc.id !== activeRollCall?.id) return rc
        const presentCount = Number(rc.present_count) + (newStatus === 'present' ? 1 : -1)
        const absentCount = Number(rc.absent_count) + (newStatus === 'absent' ? 1 : -1)
        return { ...rc, present_count: presentCount, absent_count: absentCount }
      }))
    }
  }

  async function saveIncident() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/transport/incidents`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ ...incidentForm, cost: undefined })
      })
      if (!res.ok) { flash('Failed to save incident', true); return }
      flash('Incident reported')
      setShowIncidentModal(false)
      setIncidentForm({ busId: '', date: today(), incidentType: 'breakdown', description: '', severity: 'low' })
      loadIncidents()
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function resolveIncidentSubmit() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/transport/incidents/${resolveIncident.id}`, {
        method: 'PATCH', headers: hdrs(),
        body: JSON.stringify({ resolved: true, resolutionNotes })
      })
      if (!res.ok) { flash('Failed to resolve incident', true); return }
      flash('Incident resolved')
      setShowResolveModal(false)
      setResolutionNotes('')
      loadIncidents()
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function saveMaintenance() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/transport/maintenance`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ ...maintenanceForm, cost: Number(maintenanceForm.cost), nextMaintenanceDate: maintenanceForm.nextMaintenanceDate || undefined, performedBy: maintenanceForm.performedBy || undefined })
      })
      if (!res.ok) { flash('Failed to save maintenance record', true); return }
      flash('Maintenance record saved')
      setShowMaintenanceModal(false)
      setMaintenanceForm({ busId: '', date: today(), maintenanceType: 'routine', description: '', cost: 0, performedBy: '', nextMaintenanceDate: '' })
      loadMaintenance()
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function deleteMaintenance(id: string) {
    if (!confirm('Delete this maintenance record?')) return
    await fetch(`${API}/transport/maintenance/${id}`, { method: 'DELETE', headers: hdrs() })
    flash('Record deleted')
    loadMaintenance()
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'rollcall', label: '✅ Roll Call' },
    { key: 'incidents', label: '⚠️ Incidents' },
    { key: 'maintenance', label: '🔧 Maintenance' },
  ]

  const activeBus = buses.find(b => b.id === selectedBus)

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a18' }}>🚌 Transport Operations</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginTop: '0.2rem' }}>Roll calls, incidents and maintenance</p>
        </div>
        <select value={termId} onChange={e => setTermId(e.target.value)}
          style={{ padding: '0.5rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#1a1a18' }}>
          {terms.map((t: any) => <option key={t.id} value={t.id}>{t.session_name} – {t.term_name}</option>)}
        </select>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>{error}</div>}
      {success && <div style={{ padding: '0.75rem 1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#16a34a', fontSize: '0.875rem', marginBottom: '1rem' }}>{success}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e5e0', marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '0.75rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: 'transparent', color: tab === t.key ? '#1a6b4a' : '#6b6b65', borderBottom: tab === t.key ? '2px solid #1a6b4a' : '2px solid transparent', marginBottom: '-2px' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ROLL CALL TAB ── */}
      {tab === 'rollcall' && (
        <div>
          {/* Bus + Date selector */}
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '1rem', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Select Bus</label>
                <select value={selectedBus} onChange={e => { setSelectedBus(e.target.value); setActiveRollCall(null); setRollCallEntries([]) }}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' }}>
                  <option value="">— Select bus —</option>
                  {buses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.plate_number})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Date</label>
                <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setActiveRollCall(null); setRollCallEntries([]) }}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none' }} />
              </div>
              <button onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadRollCallHistory() }}
                style={{ padding: '0.625rem 1rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 500, cursor: 'pointer', color: '#1a1a18', whiteSpace: 'nowrap' as const }}>
                📋 History
              </button>
            </div>
          </div>

          {/* History */}
          {showHistory && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', marginBottom: '1.5rem', overflow: 'hidden' }}>
              <div style={{ padding: '0.875rem 1.25rem', background: '#f7f7f5', borderBottom: '1px solid #e5e5e0' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>Roll Call History — {activeBus?.name ?? 'All Buses'}</p>
              </div>
              {rollCallHistory.length === 0 ? (
                <p style={{ padding: '2rem', textAlign: 'center', color: '#6b6b65', fontSize: '0.875rem' }}>No history yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e5e0' }}>
                      {['Date', 'Trip', 'Present', 'Absent', 'Total'].map(h => (
                        <th key={h} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rollCallHistory.map((h, i) => (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f0f0ee', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '0.625rem 1rem', fontSize: '0.825rem', color: '#1a1a18' }}>{new Date(h.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td style={{ padding: '0.625rem 1rem' }}>
                          <span style={{ padding: '0.2rem 0.625rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: h.trip_type === 'morning' ? '#fffbeb' : '#eff6ff', color: h.trip_type === 'morning' ? '#92400e' : '#1e40af' }}>
                            {h.trip_type === 'morning' ? '🌅 Morning' : '🌇 Afternoon'}
                          </span>
                        </td>
                        <td style={{ padding: '0.625rem 1rem', fontSize: '0.825rem', color: '#16a34a', fontWeight: 600 }}>{h.present_count}</td>
                        <td style={{ padding: '0.625rem 1rem', fontSize: '0.825rem', color: '#dc2626', fontWeight: 600 }}>{h.absent_count}</td>
                        <td style={{ padding: '0.625rem 1rem', fontSize: '0.825rem', color: '#6b6b65' }}>{h.total_students}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Roll call cards */}
          {selectedBus && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              {(['morning', 'afternoon'] as const).map(tripType => {
                const existing = rollCalls.find(rc => rc.trip_type === tripType)
                return (
                  <div key={tripType} style={{ background: 'white', borderRadius: '12px', border: `2px solid ${existing ? '#1a6b4a' : '#e5e5e0'}`, overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', background: existing ? 'linear-gradient(135deg, #1a6b4a, #0f4a32)' : '#f7f7f5', borderBottom: '1px solid #e5e5e0' }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 600, color: existing ? 'rgba(255,255,255,0.75)' : '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.2rem' }}>
                        {tripType === 'morning' ? '🌅 Morning Pickup' : '🌇 Afternoon Dropoff'}
                      </p>
                      {existing ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <span style={{ fontSize: '0.875rem', color: 'white', fontWeight: 600 }}>✅ {existing.present_count} present</span>
                            <span style={{ fontSize: '0.875rem', color: '#fca5a5', fontWeight: 600 }}>❌ {existing.absent_count} absent</span>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Not started</p>
                      )}
                    </div>
                    <div style={{ padding: '1rem 1.25rem' }}>
                      {existing ? (
                        <button onClick={() => { setActiveRollCall(existing); loadRollCallEntries(existing.id) }}
                          style={{ width: '100%', padding: '0.625rem', background: activeRollCall?.id === existing.id ? '#1a6b4a' : '#f0faf4', border: '1.5px solid #1a6b4a', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, color: activeRollCall?.id === existing.id ? 'white' : '#0f4a32', cursor: 'pointer' }}>
                          {activeRollCall?.id === existing.id ? '📋 Viewing Roll Call' : '📋 View / Edit Roll Call'}
                        </button>
                      ) : (
                        <button onClick={() => startRollCall(tripType)} disabled={loading}
                          style={{ width: '100%', padding: '0.625rem', background: '#1a6b4a', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, color: 'white', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                          {loading ? 'Starting...' : `▶ Start ${tripType === 'morning' ? 'Morning' : 'Afternoon'} Roll Call`}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Roll call entries */}
          {activeRollCall && rollCallEntries.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
              <div style={{ padding: '0.875rem 1.25rem', background: '#f7f7f5', borderBottom: '1px solid #e5e5e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>
                  {activeRollCall.trip_type === 'morning' ? '🌅 Morning' : '🌇 Afternoon'} Roll Call — {activeBus?.name}
                </p>
                <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Tap to toggle present/absent</p>
              </div>
              <div>
                {rollCallEntries.map((entry, i) => (
                  <div key={entry.id}
                    onClick={() => toggleEntry(entry)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderBottom: '1px solid #f0f0ee', background: i % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer', transition: 'background 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: entry.status === 'present' ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                        {entry.status === 'present' ? '✅' : '❌'}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{entry.student_name}</p>
                        <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{entry.class_level} {entry.class_arm}{entry.stop_name ? ` · ${entry.stop_name}` : ''}</p>
                      </div>
                    </div>
                    <span style={{ padding: '0.25rem 0.75rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600, background: entry.status === 'present' ? '#dcfce7' : '#fee2e2', color: entry.status === 'present' ? '#16a34a' : '#dc2626' }}>
                      {entry.status === 'present' ? 'Present' : 'Absent'}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '1rem 1.25rem', background: '#f7f7f5', borderTop: '1px solid #e5e5e0', display: 'flex', gap: '2rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#16a34a' }}>✅ Present: {rollCallEntries.filter(e => e.status === 'present').length}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626' }}>❌ Absent: {rollCallEntries.filter(e => e.status === 'absent').length}</span>
                <span style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Total: {rollCallEntries.length}</span>
              </div>
            </div>
          )}

          {!selectedBus && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚌</p>
              <p style={{ color: '#6b6b65' }}>Select a bus above to start or view roll calls.</p>
            </div>
          )}
        </div>
      )}

      {/* ── INCIDENTS TAB ── */}
      {tab === 'incidents' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => setShowIncidentModal(true)}
              style={{ padding: '0.625rem 1.25rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              ⚠️ Report Incident
            </button>
          </div>

          {incidents.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</p>
              <p style={{ color: '#6b6b65' }}>No incidents reported. Great!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {incidents.map(inc => (
                <div key={inc.id} style={{ background: 'white', borderRadius: '12px', border: `1.5px solid ${SEVERITY_BG[inc.severity]}`, overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                        <span style={{ padding: '0.2rem 0.625rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: SEVERITY_BG[inc.severity], color: SEVERITY_COLORS[inc.severity] }}>
                          {inc.severity.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a1a18', textTransform: 'capitalize' as const }}>{inc.incident_type.replace('_', ' ')}</span>
                        <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>🚌 {inc.bus_name}</span>
                        <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>📅 {new Date(inc.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                      <p style={{ fontSize: '0.875rem', color: '#1a1a18', marginBottom: '0.25rem' }}>{inc.description}</p>
                      {inc.reported_by_name && <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Reported by: {inc.reported_by_name}</p>}
                      {inc.resolved && inc.resolution_notes && (
                        <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderRadius: '6px', borderLeft: '3px solid #16a34a' }}>
                          <p style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600, marginBottom: '0.2rem' }}>✅ Resolved</p>
                          <p style={{ fontSize: '0.78rem', color: '#1a1a18' }}>{inc.resolution_notes}</p>
                        </div>
                      )}
                    </div>
                    {!inc.resolved && (
                      <button onClick={() => { setResolveIncident(inc); setShowResolveModal(true) }}
                        style={{ marginLeft: '1rem', padding: '0.4rem 0.875rem', background: '#f0faf4', border: '1px solid #1a6b4a', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer', flexShrink: 0 }}>
                        ✅ Resolve
                      </button>
                    )}
                    {inc.resolved && (
                      <span style={{ marginLeft: '1rem', padding: '0.3rem 0.75rem', background: '#dcfce7', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, color: '#16a34a', flexShrink: 0 }}>Resolved</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MAINTENANCE TAB ── */}
      {tab === 'maintenance' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => setShowMaintenanceModal(true)}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              + Log Maintenance
            </button>
          </div>

          {maintenance.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔧</p>
              <p style={{ color: '#6b6b65' }}>No maintenance records yet.</p>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f7f7f5', borderBottom: '2px solid #e5e5e0' }}>
                    {['Bus', 'Date', 'Type', 'Description', 'Cost', 'Performed By', 'Next Service', ''].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {maintenance.map((m, i) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f0f0ee', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', fontWeight: 500, color: '#1a1a18' }}>{m.bus_name}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#6b6b65' }}>{new Date(m.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ padding: '0.2rem 0.625rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 600, background: '#f0f0ee', color: '#1a1a18', textTransform: 'capitalize' as const }}>{m.maintenance_type}</span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#1a1a18', maxWidth: 200 }}>{m.description}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#1a1a18', fontWeight: 500 }}>{formatAmount(m.cost)}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#6b6b65' }}>{m.performed_by ?? '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: m.next_maintenance_date ? '#d97706' : '#6b6b65' }}>
                        {m.next_maintenance_date ? new Date(m.next_maintenance_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button onClick={() => deleteMaintenance(m.id)}
                          style={{ padding: '0.3rem 0.625rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer' }}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── INCIDENT MODAL ── */}
      {showIncidentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1.25rem' }}>⚠️ Report Incident</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Bus *</label>
                <select value={incidentForm.busId} onChange={e => setIncidentForm(p => ({ ...p, busId: e.target.value }))}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }}>
                  <option value="">— Select bus —</option>
                  {buses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.plate_number})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Date *</label>
                  <input type="date" value={incidentForm.date} onChange={e => setIncidentForm(p => ({ ...p, date: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Severity *</label>
                  <select value={incidentForm.severity} onChange={e => setIncidentForm(p => ({ ...p, severity: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Incident Type *</label>
                <select value={incidentForm.incidentType} onChange={e => setIncidentForm(p => ({ ...p, incidentType: e.target.value }))}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }}>
                  {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Description *</label>
                <textarea value={incidentForm.description} onChange={e => setIncidentForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Describe what happened..."
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowIncidentModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveIncident} disabled={loading || !incidentForm.busId || !incidentForm.description}
                style={{ flex: 1, padding: '0.75rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading || !incidentForm.busId || !incidentForm.description ? 0.6 : 1 }}>
                {loading ? 'Saving...' : 'Report Incident'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESOLVE MODAL ── */}
      {showResolveModal && resolveIncident && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 420 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>✅ Resolve Incident</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>{resolveIncident.description}</p>
            <div>
              <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Resolution Notes</label>
              <textarea value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                rows={3} placeholder="Describe how it was resolved..."
                style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const }} />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowResolveModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={resolveIncidentSubmit} disabled={loading}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Saving...' : 'Mark Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAINTENANCE MODAL ── */}
      {showMaintenanceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem', overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 480, margin: 'auto' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1.25rem' }}>🔧 Log Maintenance</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Bus *</label>
                <select value={maintenanceForm.busId} onChange={e => setMaintenanceForm(p => ({ ...p, busId: e.target.value }))}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }}>
                  <option value="">— Select bus —</option>
                  {buses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.plate_number})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Date *</label>
                  <input type="date" value={maintenanceForm.date} onChange={e => setMaintenanceForm(p => ({ ...p, date: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Type *</label>
                  <select value={maintenanceForm.maintenanceType} onChange={e => setMaintenanceForm(p => ({ ...p, maintenanceType: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }}>
                    {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t.replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Description *</label>
                <textarea value={maintenanceForm.description} onChange={e => setMaintenanceForm(p => ({ ...p, description: e.target.value }))}
                  rows={2} placeholder="What was done?"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Cost (₦)</label>
                  <input type="number" min={0} value={maintenanceForm.cost} onChange={e => setMaintenanceForm(p => ({ ...p, cost: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Performed By</label>
                  <input value={maintenanceForm.performedBy} onChange={e => setMaintenanceForm(p => ({ ...p, performedBy: e.target.value }))}
                    placeholder="Mechanic name"
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Next Service Date</label>
                <input type="date" value={maintenanceForm.nextMaintenanceDate} onChange={e => setMaintenanceForm(p => ({ ...p, nextMaintenanceDate: e.target.value }))}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowMaintenanceModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveMaintenance} disabled={loading || !maintenanceForm.busId || !maintenanceForm.description}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading || !maintenanceForm.busId || !maintenanceForm.description ? 0.6 : 1 }}>
                {loading ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
