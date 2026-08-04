'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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

type Tab = 'fleet' | 'routes' | 'assignments' | 'occupancy'

export default function TransportPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('fleet')
  const [buses, setBuses] = useState<any[]>([])
  const [routes, setRoutes] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [occupancy, setOccupancy] = useState<any[]>([])
  const [unassigned, setUnassigned] = useState<any[]>([])
  const [termId, setTermId] = useState('')
  const [terms, setTerms] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Bus modal
  const [showBusModal, setShowBusModal] = useState(false)
  const [editBus, setEditBus] = useState<any>(null)
  const [busForm, setBusForm] = useState({ name: '', plateNumber: '', capacity: 30, driverName: '', driverPhone: '', driverLicense: '', notes: '' })

  // Route modal
  const [showRouteModal, setShowRouteModal] = useState(false)
  const [editRoute, setEditRoute] = useState<any>(null)
  const [routeForm, setRouteForm] = useState({ name: '', busId: '', morningDepartureTime: '', afternoonDepartureTime: '', notes: '' })
  const [routeStops, setRouteStops] = useState<{ name: string; estimatedPickupTime: string; estimatedDropoffTime: string }[]>([])

  // Stop modal
  const [showStopModal, setShowStopModal] = useState(false)
  const [activeRouteForStop, setActiveRouteForStop] = useState<any>(null)
  const [stopForm, setStopForm] = useState({ name: '', estimatedPickupTime: '', estimatedDropoffTime: '' })

  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({ studentId: '', busId: '', routeId: '', stopId: '' })
  const [assignStops, setAssignStops] = useState<any[]>([])

  useEffect(() => {
    loadTerms()
  }, [])

  useEffect(() => {
    loadBuses()
    loadRoutes()
  }, [])

  useEffect(() => {
    if (termId) {
      loadOccupancy()
      loadAssignments()
    }
  }, [termId])

  useEffect(() => {
    if (termId && showAssignModal) {
      loadAssignments()
    }
  }, [showAssignModal])

  useEffect(() => {
    if (assignForm.routeId) {
      const route = routes.find(r => r.id === assignForm.routeId)
      setAssignStops(route?.stops ?? [])
    } else {
      setAssignStops([])
    }
  }, [assignForm.routeId, routes])

  async function loadTerms() {
    const res = await fetch(`${API}/terms`, { headers: hdrs() })
    const data = await res.json()
    const termList = data.terms ?? []
    setTerms(termList)
    const active = termList.find((t: any) => t.is_active)
    if (active) setTermId(active.term_id ?? active.id)
    else if (termList.length > 0) setTermId(termList[0].term_id ?? termList[0].id)
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

  async function loadAssignments() {
    const tid = termId || terms[0]?.term_id || terms[0]?.id
    if (!tid) return
    if (!termId) setTermId(tid)
    const res = await fetch(`${API}/transport/assignments?termId=${termId}`, { headers: hdrs() })
    const data = await res.json()
    setAssignments(data.assignments ?? [])
    const unRes = await fetch(`${API}/transport/unassigned-students?termId=${termId}`, { headers: hdrs() })
    const unData = await unRes.json()
    setUnassigned(unData.students ?? [])
  }

  async function loadOccupancy() {
    if (!termId) return
    const res = await fetch(`${API}/transport/occupancy?termId=${termId}`, { headers: hdrs() })
    const data = await res.json()
    setOccupancy(data.report ?? [])
  }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000) }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }
  }

  // ── BUS CRUD ──────────────────────────────────────────────────────────────
  function openBusModal(bus?: any) {
    setEditBus(bus ?? null)
    setBusForm(bus ? {
      name: bus.name, plateNumber: bus.plate_number, capacity: bus.capacity,
      driverName: bus.driver_name ?? '', driverPhone: bus.driver_phone ?? '',
      driverLicense: bus.driver_license ?? '', notes: bus.notes ?? ''
    } : { name: '', plateNumber: '', capacity: 30, driverName: '', driverPhone: '', driverLicense: '', notes: '' })
    setShowBusModal(true)
  }

  async function saveBus() {
    setLoading(true)
    try {
      const url = editBus ? `${API}/transport/buses/${editBus.id}` : `${API}/transport/buses`
      const method = editBus ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: hdrs(), body: JSON.stringify({ ...busForm, capacity: Number(busForm.capacity) }) })
      if (!res.ok) { const d = await res.json(); flash(d.message ?? 'Failed to save bus', true); return }
      flash(editBus ? 'Bus updated' : 'Bus added')
      setShowBusModal(false)
      loadBuses(); loadOccupancy()
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function deleteBus(id: string) {
    if (!confirm('Delete this bus?')) return
    await fetch(`${API}/transport/buses/${id}`, { method: 'DELETE', headers: hdrs() })
    flash('Bus deleted')
    loadBuses(); loadOccupancy()
  }

  // ── ROUTE CRUD ────────────────────────────────────────────────────────────
  function openRouteModal(route?: any) {
    setEditRoute(route ?? null)
    setRouteForm(route ? {
      name: route.name, busId: route.bus_id ?? '',
      morningDepartureTime: route.morning_departure_time ?? '',
      afternoonDepartureTime: route.afternoon_departure_time ?? '',
      notes: route.notes ?? ''
    } : { name: '', busId: '', morningDepartureTime: '', afternoonDepartureTime: '', notes: '' })
    setRouteStops([])
    setShowRouteModal(true)
  }

  async function saveRoute() {
    setLoading(true)
    try {
      const url = editRoute ? `${API}/transport/routes/${editRoute.id}` : `${API}/transport/routes`
      const method = editRoute ? 'PATCH' : 'POST'
      console.log('saveRoute payload check:', JSON.stringify({ routeForm, routeStops }))
      const payload: any = {
        name: routeForm.name,
        busId: routeForm.busId || undefined,
        morningDepartureTime: routeForm.morningDepartureTime || undefined,
        afternoonDepartureTime: routeForm.afternoonDepartureTime || undefined,
        notes: routeForm.notes || undefined,
      }
      if (!editRoute && routeStops.length > 0) {
        payload.stops = routeStops.map((s, i) => ({
          name: s.name,
          sortOrder: i,
          estimatedPickupTime: s.estimatedPickupTime || undefined,
          estimatedDropoffTime: s.estimatedDropoffTime || undefined,
        }))
      }
      const res = await fetch(url, { method, headers: hdrs(), body: JSON.stringify(payload) })
      if (!res.ok) { flash('Failed to save route', true); return }
      flash(editRoute ? 'Route updated' : 'Route created')
      setShowRouteModal(false)
      loadRoutes()
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function deleteRoute(id: string) {
    if (!confirm('Delete this route and all its stops?')) return
    await fetch(`${API}/transport/routes/${id}`, { method: 'DELETE', headers: hdrs() })
    flash('Route deleted')
    loadRoutes()
  }

  // ── STOP CRUD ─────────────────────────────────────────────────────────────
  function openStopModal(route: any) {
    setActiveRouteForStop(route)
    setStopForm({ name: '', estimatedPickupTime: '', estimatedDropoffTime: '' })
    setShowStopModal(true)
  }

  async function saveStop() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/transport/routes/${activeRouteForStop.id}/stops`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ ...stopForm, sortOrder: activeRouteForStop.stops?.length ?? 0 })
      })
      if (!res.ok) { flash('Failed to add stop', true); return }
      flash('Stop added')
      setShowStopModal(false)
      loadRoutes()
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function deleteStop(id: string) {
    await fetch(`${API}/transport/stops/${id}`, { method: 'DELETE', headers: hdrs() })
    flash('Stop removed')
    loadRoutes()
  }

  // ── ASSIGNMENT ────────────────────────────────────────────────────────────
  async function saveAssignment() {
    if (!assignForm.studentId || !assignForm.busId || !assignForm.routeId) {
      flash('Please select student, bus and route', true); return
    }
    setLoading(true)
    try {
      const payload: any = { ...assignForm, termId, stopId: assignForm.stopId || undefined }
      const res = await fetch(`${API}/transport/assignments`, { method: 'POST', headers: hdrs(), body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { flash(data.message ?? 'Failed to assign', true); return }
      flash('Student assigned to bus')
      setShowAssignModal(false)
      setAssignForm({ studentId: '', busId: '', routeId: '', stopId: '' })
      loadAssignments(); loadOccupancy()
    } catch { flash('Network error', true) } finally { setLoading(false) }
  }

  async function removeAssignment(id: string) {
    if (!confirm('Remove this student from the bus?')) return
    await fetch(`${API}/transport/assignments/${id}`, { method: 'DELETE', headers: hdrs() })
    flash('Assignment removed')
    loadAssignments(); loadOccupancy()
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'fleet', label: '🚌 Fleet' },
    { key: 'routes', label: '🗺️ Routes' },
    { key: 'assignments', label: '👤 Assignments' },
    { key: 'occupancy', label: '📊 Occupancy' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto', fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a18' }}>🚌 Transport Management</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginTop: '0.2rem' }}>Manage buses, routes and student assignments</p>
        </div>
        <select value={termId} onChange={e => setTermId(e.target.value)}
          style={{ padding: '0.5rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#1a1a18' }}>
          {terms.map((t: any) => (
            <option key={t.term_id ?? t.id} value={t.term_id ?? t.id}>{t.session_name} – {t.term_name}</option>
          ))}
        </select>
      </div>

      {/* Flash messages */}
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

      {/* ── FLEET TAB ── */}
      {tab === 'fleet' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => openBusModal()}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Bus
            </button>
          </div>
          {buses.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '3rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚌</p>
              <p style={{ color: '#6b6b65' }}>No buses added yet. Add your first bus above.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {buses.map(bus => (
                <div key={bus.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
                  <div style={{ background: 'linear-gradient(135deg, #1a6b4a, #0f4a32)', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{bus.name}</p>
                      <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.8)' }}>{bus.plate_number}</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '20px', padding: '0.25rem 0.75rem', fontSize: '0.78rem', color: 'white', fontWeight: 600 }}>
                      {bus.assigned_students}/{bus.capacity} seats
                    </div>
                  </div>
                  <div style={{ padding: '1rem 1.25rem' }}>
                    {/* Capacity bar */}
                    <div style={{ marginBottom: '0.875rem' }}>
                      <div style={{ height: 6, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (bus.assigned_students / bus.capacity) * 100)}%`, height: '100%', background: bus.assigned_students >= bus.capacity ? '#dc2626' : '#1a6b4a', borderRadius: 3, transition: 'width 0.4s ease' }} />
                      </div>
                      <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.25rem' }}>
                        {bus.capacity - bus.assigned_students} seats available
                      </p>
                    </div>
                    {bus.driver_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.875rem' }}>👤</span>
                        <span style={{ fontSize: '0.825rem', color: '#1a1a18' }}>{bus.driver_name}</span>
                        {bus.driver_phone && <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>· {bus.driver_phone}</span>}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem' }}>
                      <button onClick={() => openBusModal(bus)}
                        style={{ flex: 1, padding: '0.5rem', background: '#f0faf4', border: '1px solid #1a6b4a', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => deleteBus(bus.id)}
                        style={{ flex: 1, padding: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ROUTES TAB ── */}
      {tab === 'routes' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button onClick={() => openRouteModal()}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Route
            </button>
          </div>
          {routes.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '3rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</p>
              <p style={{ color: '#6b6b65' }}>No routes added yet. Add your first route above.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {routes.map(route => (
                <div key={route.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0ee' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.2rem' }}>{route.name}</h3>
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#6b6b65' }}>
                        {route.bus_name && <span>🚌 {route.bus_name} ({route.plate_number})</span>}
                        {route.morning_departure_time && <span>🌅 {route.morning_departure_time}</span>}
                        {route.afternoon_departure_time && <span>🌇 {route.afternoon_departure_time}</span>}
                        <span>👤 {route.assigned_students} students</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => openStopModal(route)}
                        style={{ padding: '0.4rem 0.875rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#1e40af', cursor: 'pointer' }}>
                        + Stop
                      </button>
                      <button onClick={() => openRouteModal(route)}
                        style={{ padding: '0.4rem 0.875rem', background: '#f0faf4', border: '1px solid #1a6b4a', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer' }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => deleteRoute(route.id)}
                        style={{ padding: '0.4rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                  {/* Stops */}
                  {route.stops?.length > 0 && (
                    <div style={{ padding: '0.75rem 1.25rem' }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Stops ({route.stops.length})</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {route.stops.map((stop: any, i: number) => (
                          <div key={stop.id} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.3rem 0.75rem', background: '#f7f7f5', borderRadius: '20px', fontSize: '0.78rem', color: '#1a1a18' }}>
                            <span style={{ width: 18, height: 18, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'white', fontWeight: 700 }}>{i + 1}</span>
                            {stop.name}
                            {stop.estimated_pickup_time && <span style={{ color: '#6b6b65' }}>({stop.estimated_pickup_time})</span>}
                            <button onClick={() => deleteStop(stop.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '0.75rem', padding: 0, lineHeight: 1 }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNMENTS TAB ── */}
      {tab === 'assignments' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>{unassigned.length} students not yet assigned</p>
            <button onClick={() => { setAssignForm({ studentId: '', busId: '', routeId: '', stopId: '' }); setShowAssignModal(true) }}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              + Assign Student
            </button>
          </div>

          {assignments.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '3rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👤</p>
              <p style={{ color: '#6b6b65' }}>No students assigned to buses yet.</p>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e5e0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f7f7f5', borderBottom: '2px solid #e5e5e0' }}>
                    {['Student', 'Class', 'Bus', 'Route', 'Stop', 'Pickup Time', ''].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a, i) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f0f0ee', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{a.student_name}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#6b6b65' }}>{a.class_level} {a.class_arm}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#1a1a18' }}>{a.bus_name}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#6b6b65' }}>{a.route_name}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#6b6b65' }}>{a.stop_name ?? '—'}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.825rem', color: '#6b6b65' }}>{a.estimated_pickup_time ?? '—'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button onClick={() => removeAssignment(a.id)}
                          style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── OCCUPANCY TAB ── */}
      {tab === 'occupancy' && (
        <div>
          {occupancy.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '3rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</p>
              <p style={{ color: '#6b6b65' }}>No buses to report. Add buses in the Fleet tab.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {occupancy.map(b => {
                const pct = Number(b.occupancy_pct ?? 0)
                const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#1a6b4a'
                return (
                  <div key={b.id} style={{ background: 'white', borderRadius: '12px', border: `2px solid ${color}20`, padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.2rem' }}>{b.bus_name}</h3>
                        <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{b.plate_number}</p>
                        {b.route_name && <p style={{ fontSize: '0.78rem', color: '#1a6b4a', marginTop: '0.2rem' }}>🗺️ {b.route_name}</p>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{pct}%</p>
                        <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>full</p>
                      </div>
                    </div>
                    <div style={{ height: 10, background: '#f0f0ee', borderRadius: 5, overflow: 'hidden', marginBottom: '0.5rem' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 5, transition: 'width 0.6s ease' }} />
                    </div>
                    <p style={{ fontSize: '0.825rem', color: '#1a1a18', fontWeight: 500 }}>
                      {b.assigned_students} / {b.capacity} students
                    </p>
                    {b.driver_name && <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.25rem' }}>👤 {b.driver_name} {b.driver_phone ? `· ${b.driver_phone}` : ''}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── BUS MODAL ── */}
      {showBusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1.25rem' }}>{editBus ? 'Edit Bus' : 'Add New Bus'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {[
                { label: 'Bus Name *', key: 'name', placeholder: 'e.g. Bus A' },
                { label: 'Plate Number *', key: 'plateNumber', placeholder: 'e.g. LAG-123-AA' },
                { label: 'Driver Name', key: 'driverName', placeholder: 'Full name' },
                { label: 'Driver Phone', key: 'driverPhone', placeholder: '080xxxxxxxx' },
                { label: 'Driver License No.', key: 'driverLicense', placeholder: 'License number' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>{f.label}</label>
                  <input value={(busForm as any)[f.key]} onChange={e => setBusForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Capacity *</label>
                <input type="number" min={1} value={busForm.capacity} onChange={e => setBusForm(p => ({ ...p, capacity: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowBusModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveBus} disabled={loading}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Saving...' : editBus ? 'Update Bus' : 'Add Bus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ROUTE MODAL ── */}
      {showRouteModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem', overflowY: 'auto' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 520, margin: 'auto' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1.25rem' }}>{editRoute ? 'Edit Route' : 'Add New Route'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Route Name *</label>
                <input value={routeForm.name} onChange={e => setRouteForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Lekki–Victoria Island Route"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Assigned Bus</label>
                <select value={routeForm.busId} onChange={e => setRouteForm(p => ({ ...p, busId: e.target.value }))}
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="">— Select bus —</option>
                  {buses.map(b => <option key={b.id} value={b.id}>{b.name} ({b.plate_number})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>🌅 Morning Departure (from 1st stop)</label>
                  <input type="time" value={routeForm.morningDepartureTime} onChange={e => setRouteForm(p => ({ ...p, morningDepartureTime: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>🌇 Afternoon Departure (from school)</label>
                  <input type="time" value={routeForm.afternoonDepartureTime} onChange={e => setRouteForm(p => ({ ...p, afternoonDepartureTime: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Stops added after route creation via + Stop button */}
              {false && !editRoute && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18' }}>Stops</label>
                    <button onClick={() => setRouteStops(p => [...p, { name: '', estimatedPickupTime: '', estimatedDropoffTime: '' }])}
                      style={{ fontSize: '0.78rem', color: '#1a6b4a', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      + Add Stop
                    </button>
                  </div>
                  {routeStops.map((stop, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                      <span style={{ width: 22, height: 22, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'white', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <input value={stop.name} onChange={e => setRouteStops(p => p.map((s, j) => j === i ? { ...s, name: e.target.value } : s))}
                        placeholder="Stop name"
                        style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.825rem', outline: 'none' }} />
                      <input type="time" value={stop.estimatedPickupTime} onChange={e => setRouteStops(p => p.map((s, j) => j === i ? { ...s, estimatedPickupTime: e.target.value } : s))}
                        style={{ width: 100, padding: '0.5rem', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.825rem', outline: 'none' }} />
                      <button onClick={() => setRouteStops(p => p.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: '1rem', padding: '0.25rem' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowRouteModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveRoute} disabled={loading}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Saving...' : editRoute ? 'Update Route' : 'Create Route'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STOP MODAL ── */}
      {showStopModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 400 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>Add Stop</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>Adding stop to: <strong>{activeRouteForStop?.name}</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Stop Name *</label>
                <input value={stopForm.name} onChange={e => setStopForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Lekki Phase 1 Gate"
                  style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>🌅 Morning Pickup</label>
                  <input type="time" value={stopForm.estimatedPickupTime} onChange={e => setStopForm(p => ({ ...p, estimatedPickupTime: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.5rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>🌇 Afternoon Dropoff</label>
                  <input type="time" value={stopForm.estimatedDropoffTime} onChange={e => setStopForm(p => ({ ...p, estimatedDropoffTime: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.5rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowStopModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveStop} disabled={loading || !stopForm.name}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading || !stopForm.name ? 0.6 : 1 }}>
                {loading ? 'Saving...' : 'Add Stop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN MODAL ── */}
      {showAssignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: 440 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1.25rem' }}>Assign Student to Bus</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {[
                { label: 'Student *', key: 'studentId', options: unassigned.map(s => ({ value: s.id, label: `${s.full_name} (${s.class_level} ${s.class_arm})` })), placeholder: '— Select student —' },
                { label: 'Bus *', key: 'busId', options: buses.map(b => ({ value: b.id, label: `${b.name} (${b.plate_number}) — ${b.assigned_students}/${b.capacity}` })), placeholder: '— Select bus —' },
                { label: 'Route *', key: 'routeId', options: routes.map(r => ({ value: r.id, label: r.name })), placeholder: '— Select route —' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>{f.label}</label>
                  <select value={(assignForm as any)[f.key]} onChange={e => setAssignForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">{f.placeholder}</option>
                    {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              ))}
              {assignStops.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Stop (optional)</label>
                  <select value={assignForm.stopId} onChange={e => setAssignForm(p => ({ ...p, stopId: e.target.value }))}
                    style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">— No specific stop —</option>
                    {assignStops.map((s: any) => <option key={s.id} value={s.id}>{s.name}{s.estimated_pickup_time ? ` (${s.estimated_pickup_time})` : ''}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setShowAssignModal(false)}
                style={{ flex: 1, padding: '0.75rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={saveAssignment} disabled={loading}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
                {loading ? 'Assigning...' : 'Assign Student'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
