'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']

export default function HostelPage() {
  const [hostels, setHostels] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [staff, setStaff] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'hostels' | 'allocations' | 'occupancy'>('hostels')
  const [selectedHostel, setSelectedHostel] = useState<any>(null)
  const [rooms, setRooms] = useState<any[]>([])
  const [selectedRoom, setSelectedRoom] = useState<any>(null)
  const [beds, setBeds] = useState<any[]>([])
  const [allocations, setAllocations] = useState<any[]>([])
  const [occupancyReport, setOccupancyReport] = useState<any[]>([])
  const [showHostelForm, setShowHostelForm] = useState(false)
  const [showRoomForm, setShowRoomForm] = useState(false)
  const [showAllocForm, setShowAllocForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [hostelForm, setHostelForm] = useState({ name: '', type: 'male', housemasterId: '', description: '' })
  const [roomForm, setRoomForm] = useState({ roomNumber: '', roomType: 'shared', bedCapacity: '4', floorNumber: '1' })
  const [allocForm, setAllocForm] = useState({ studentId: '', bedId: '', hostelId: '', roomId: '', notes: '' })

useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { loadInitial() }, [])
useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { if (selectedTerm) { loadAllocations(); loadOccupancy() } }, [selectedTerm])

  async function loadInitial() {
    try {
      const [sessRes, staffRes] = await Promise.all([
        apiFetch(`${API}/sessions`),
        apiFetch(`${API}/users?role=teacher`),
      ])
      const sessData = await sessRes.json()
      const staffData = await staffRes.json()
      setSessions(sessData.sessions ?? [])
      setStaff(staffData.users ?? [])
      const active = (sessData.sessions ?? []).find((s: any) => s.is_active)
      if (active) { setSelectedSession(active.id); loadTerms(active.id) }
      loadHostels()
    } catch {} finally { setLoading(false) }
  }

  async function loadTerms(sessionId: string) {
    const res = await apiFetch(`${API}/sessions/${sessionId}/terms`)
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadHostels() {
    const res = await apiFetch(`${API}/hostels`)
    const data = await res.json()
    setHostels(data.hostels ?? [])
  }

  async function loadRooms(hostelId: string) {
    const res = await apiFetch(`${API}/hostels/${hostelId}/rooms`)
    const data = await res.json()
    setRooms(data.rooms ?? [])
  }

  async function loadBeds(roomId: string) {
    const res = await apiFetch(`${API}/hostels/rooms/${roomId}/beds`)
    const data = await res.json()
    setBeds(data.beds ?? [])
  }

  async function loadAllocations() {
    if (!selectedTerm) return
    let url = `${API}/hostels/allocations?termId=${selectedTerm}`
    if (selectedHostel) url += `&hostelId=${selectedHostel.id}`
    const res = await apiFetch(url)
    const data = await res.json()
    setAllocations(data.allocations ?? [])
  }

  async function loadOccupancy() {
    if (!selectedTerm) return
    const res = await apiFetch(`${API}/hostels/occupancy?termId=${selectedTerm}`)
    const data = await res.json()
    setOccupancyReport(data.report ?? [])
  }

  async function loadStudents(classLevel?: string) {
    const res = await apiFetch(`${API}/gradebook/class?termId=${selectedTerm}&classLevel=${classLevel ?? 'SS1'}`)
    const data = await res.json()
    setStudents(data.students ?? [])
  }

  async function createHostel() {
    if (!hostelForm.name) { setError('Hostel name required'); return }
    setSaving(true); setError('')
    try {
      const body: any = { name: hostelForm.name, type: hostelForm.type, description: hostelForm.description || undefined }
      if (hostelForm.housemasterId) body.housemasterId = hostelForm.housemasterId
      const res = await fetch(`${API}/hostels`, { method: 'POST', body: JSON.stringify(body) }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')
      setShowHostelForm(false)
      setHostelForm({ name: '', type: 'male', housemasterId: '', description: '' })
      setSuccess('Hostel created!'); setTimeout(() => setSuccess(''), 3000)
      loadHostels()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function createRoom() {
    if (!roomForm.roomNumber || !selectedHostel) { setError('Room number required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/hostels/${selectedHostel.id}/rooms`, {
        method: 'POST',
        body: JSON.stringify({
          roomNumber: roomForm.roomNumber,
          roomType: roomForm.roomType,
          bedCapacity: Number(roomForm.bedCapacity),
          floorNumber: Number(roomForm.floorNumber),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create')
      setShowRoomForm(false)
      setRoomForm({ roomNumber: '', roomType: 'shared', bedCapacity: '4', floorNumber: '1' })
      setSuccess(`Room created with ${roomForm.bedCapacity} beds!`); setTimeout(() => setSuccess(''), 3000)
      loadRooms(selectedHostel.id)
      loadHostels()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function allocateBed() {
    if (!allocForm.studentId || !allocForm.bedId || !selectedTerm) { setError('Student and bed required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/hostels/allocations`, {
        method: 'POST',
        body: JSON.stringify({
          studentId: allocForm.studentId,
          bedId: allocForm.bedId,
          hostelId: allocForm.hostelId,
          roomId: allocForm.roomId,
          termId: selectedTerm,
          notes: allocForm.notes || undefined,
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to allocate')
      setShowAllocForm(false)
      setAllocForm({ studentId: '', bedId: '', hostelId: '', roomId: '', notes: '' })
      setSuccess('Bed allocated successfully!'); setTimeout(() => setSuccess(''), 3000)
      loadAllocations(); loadOccupancy(); loadHostels()
      if (selectedRoom) loadBeds(selectedRoom.id)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function vacateAllocation(id: string) {
    if (!window.confirm('Remove this student from their bed?')) return
    await apiFetch(`${API}/hostels/allocations/${id}`, { method: 'DELETE' })
    setSuccess('Student vacated'); setTimeout(() => setSuccess(''), 3000)
    loadAllocations(); loadOccupancy(); loadHostels()
    if (selectedRoom) loadBeds(selectedRoom.id)
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  const HOSTEL_TYPE_COLORS: Record<string, string> = { male: '#1e40af', female: '#be185d', mixed: '#7e22ce' }
  const HOSTEL_TYPE_BG: Record<string, string> = { male: '#eff6ff', female: '#fdf2f8', mixed: '#f5f3ff' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Hostel Management</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Manage hostels, rooms, beds and student allocations.</p>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Term selector */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div><label style={lbl}>Session</label>
            <select style={sel} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label style={lbl}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select term...</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
        {([
          { key: 'hostels', label: '🏠 Hostels & Rooms' },
          { key: 'allocations', label: '🛏️ Bed Allocations' },
          { key: 'occupancy', label: '📊 Occupancy Report' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* HOSTELS TAB */}
      {activeTab === 'hostels' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedHostel ? '1fr 1.5fr' : '1fr', gap: '1.5rem' }}>
          {/* Hostels list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>All Hostels ({hostels.length})</h2>
              <button onClick={() => setShowHostelForm(true)}
                style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                + Add Hostel
              </button>
            </div>

            {showHostelForm && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #1a6b4a', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div><label style={lbl}>Hostel Name *</label>
                    <input style={inp} value={hostelForm.name} onChange={e => setHostelForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. David House" autoFocus /></div>
                  <div><label style={lbl}>Type</label>
                    <select style={sel} value={hostelForm.type} onChange={e => setHostelForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="mixed">Mixed</option>
                    </select></div>
                  <div><label style={lbl}>Housemaster/Matron</label>
                    <select style={sel} value={hostelForm.housemasterId} onChange={e => setHostelForm(f => ({ ...f, housemasterId: e.target.value }))}>
                      <option value="">Select staff...</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select></div>
                  <div><label style={lbl}>Description</label>
                    <input style={inp} value={hostelForm.description} onChange={e => setHostelForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional notes" /></div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={createHostel} disabled={saving}
                      style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setShowHostelForm(false)}
                      style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {hostels.length === 0 ? (
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏠</p>
                <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No hostels yet. Add your first hostel.</p>
              </div>
            ) : hostels.map(h => (
              <div key={h.id}
                onClick={() => { setSelectedHostel(h); loadRooms(h.id); setSelectedRoom(null); setBeds([]) }}
                style={{ background: 'white', border: `2px solid ${selectedHostel?.id === h.id ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '14px', padding: '1.25rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: HOSTEL_TYPE_BG[h.type], color: HOSTEL_TYPE_COLORS[h.type], textTransform: 'capitalize' as const }}>{h.type}</span>
                    </div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{h.name}</h3>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
                      {h.housemaster_name ? `${h.housemaster_name} · ` : ''}{h.room_count} rooms · {h.total_beds} beds
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' as const }}>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a' }}>{h.occupied_beds}</p>
                    <p style={{ fontSize: '0.65rem', color: '#6b6b65' }}>occupied</p>
                    <p style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{Number(h.total_beds) - Number(h.occupied_beds)} available</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Rooms panel */}
          {selectedHostel && (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{selectedHostel.name}</h2>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{rooms.length} rooms</p>
                </div>
                <button onClick={() => setShowRoomForm(true)}
                  style={{ padding: '0.375rem 0.875rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  + Add Room
                </button>
              </div>

              {showRoomForm && (
                <div style={{ background: '#eff6ff', border: '1.5px solid #1e40af', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }}>
                    <div><label style={lbl}>Room Number *</label>
                      <input style={inp} value={roomForm.roomNumber} onChange={e => setRoomForm(f => ({ ...f, roomNumber: e.target.value }))} placeholder="e.g. 101" autoFocus /></div>
                    <div><label style={lbl}>Floor</label>
                      <input style={inp} type="number" value={roomForm.floorNumber} onChange={e => setRoomForm(f => ({ ...f, floorNumber: e.target.value }))} /></div>
                    <div><label style={lbl}>Room Type</label>
                      <select style={sel} value={roomForm.roomType} onChange={e => setRoomForm(f => ({ ...f, roomType: e.target.value }))}>
                        <option value="single">Single</option>
                        <option value="shared">Shared</option>
                        <option value="dormitory">Dormitory</option>
                      </select></div>
                    <div><label style={lbl}>Number of Beds</label>
                      <input style={inp} type="number" min="1" max="20" value={roomForm.bedCapacity} onChange={e => setRoomForm(f => ({ ...f, bedCapacity: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={createRoom} disabled={saving}
                      style={{ padding: '0.5rem 1rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                      {saving ? 'Saving...' : 'Save Room'}
                    </button>
                    <button onClick={() => setShowRoomForm(false)}
                      style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.78rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}

              {rooms.length === 0 ? (
                <div style={{ textAlign: 'center' as const, padding: '2rem', background: '#f7f7f5', borderRadius: '10px' }}>
                  <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No rooms yet. Add rooms to this hostel.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                  {rooms.map(room => (
                    <div key={room.id}
                      onClick={() => { setSelectedRoom(room); loadBeds(room.id) }}
                      style={{ border: `1.5px solid ${selectedRoom?.id === room.id ? '#1e40af' : '#e5e5e0'}`, borderRadius: '10px', padding: '0.875rem', cursor: 'pointer', background: selectedRoom?.id === room.id ? '#eff6ff' : 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>Room {room.room_number}</p>
                          <p style={{ fontSize: '0.68rem', color: '#6b6b65' }}>Floor {room.floor_number} · {room.room_type}</p>
                        </div>
                        <div style={{ textAlign: 'right' as const }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: Number(room.available_beds) > 0 ? '#1a6b4a' : '#dc2626' }}>
                            {room.available_beds}/{room.total_beds}
                          </p>
                          <p style={{ fontSize: '0.62rem', color: '#6b6b65' }}>available</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Beds panel */}
              {selectedRoom && beds.length > 0 && (
                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #e5e5e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>Room {selectedRoom.room_number} — Beds</h3>
                    <button onClick={() => {
                      setAllocForm(f => ({ ...f, hostelId: selectedHostel.id, roomId: selectedRoom.id }))
                      setShowAllocForm(true)
                      loadStudents()
                    }}
                      style={{ padding: '0.3rem 0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                      + Allocate Bed
                    </button>
                  </div>

                  {showAllocForm && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #1a6b4a', borderRadius: '10px', padding: '1rem', marginBottom: '0.875rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        <div>
                          <label style={lbl}>Class (to filter students)</label>
                          <select style={sel} onChange={e => loadStudents(e.target.value)}>
                            {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div><label style={lbl}>Student *</label>
                          <select style={sel} value={allocForm.studentId} onChange={e => setAllocForm(f => ({ ...f, studentId: e.target.value }))}>
                            <option value="">Select student...</option>
                            {students.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.class_level} {s.class_arm}</option>)}
                          </select></div>
                        <div><label style={lbl}>Bed *</label>
                          <select style={sel} value={allocForm.bedId} onChange={e => setAllocForm(f => ({ ...f, bedId: e.target.value }))}>
                            <option value="">Select available bed...</option>
                            {beds.filter(b => b.is_available).map(b => <option key={b.id} value={b.id}>{b.bed_number}</option>)}
                          </select></div>
                        <div><label style={lbl}>Notes (optional)</label>
                          <input style={inp} value={allocForm.notes} onChange={e => setAllocForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Special needs" /></div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={allocateBed} disabled={saving}
                            style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                            {saving ? 'Allocating...' : '🛏️ Allocate'}
                          </button>
                          <button onClick={() => setShowAllocForm(false)}
                            style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.78rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                    {beds.map(bed => (
                      <div key={bed.id} style={{ padding: '0.75rem', border: `1.5px solid ${bed.is_available ? '#e5e5e0' : '#1a6b4a'}`, borderRadius: '8px', background: bed.is_available ? 'white' : '#f0fdf4' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18' }}>{bed.bed_number}</p>
                            {bed.student_name ? (
                              <p style={{ fontSize: '0.68rem', color: '#1a6b4a' }}>{bed.student_name}</p>
                            ) : (
                              <p style={{ fontSize: '0.68rem', color: '#a0a09a' }}>Available</p>
                            )}
                          </div>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: bed.is_available ? '#f7f7f5' : '#e8f5ee', color: bed.is_available ? '#a0a09a' : '#0f4a32' }}>
                            {bed.is_available ? 'Free' : 'Occupied'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ALLOCATIONS TAB */}
      {activeTab === 'allocations' && (
        <div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
            <select style={{ ...sel, width: 'auto' }} value={selectedHostel?.id ?? ''} onChange={e => {
              const h = hostels.find(h => h.id === e.target.value)
              setSelectedHostel(h ?? null)
            }}>
              <option value="">All hostels</option>
              {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <button onClick={loadAllocations} style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>

          {allocations.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛏️</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No allocations for this term yet. Go to Hostels & Rooms tab to allocate beds.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                <span>Student</span><span>Hostel</span><span>Room</span><span>Bed</span><span></span>
              </div>
              {allocations.map(a => (
                <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{a.student_name}</p>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{a.class_level} {a.class_arm} · {a.admission_no}</p>
                  </div>
                  <span style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{a.hostel_name}</span>
                  <span style={{ fontSize: '0.825rem', color: '#3a3a36' }}>Room {a.room_number}</span>
                  <span style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{a.bed_number}</span>
                  <button onClick={() => vacateAllocation(a.id)}
                    style={{ padding: '0.3rem 0.625rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.68rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                    Vacate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OCCUPANCY REPORT TAB */}
      {activeTab === 'occupancy' && (
        <div>
          <button onClick={loadOccupancy} style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', marginBottom: '1rem' }}>
            Refresh Report
          </button>

          {occupancyReport.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No occupancy data. Add hostels and allocate beds first.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {[
                  { label: 'Total Beds', value: occupancyReport.reduce((a, h) => a + Number(h.total_beds), 0), color: '#1a1a18', bg: '#f7f7f5' },
                  { label: 'Occupied', value: occupancyReport.reduce((a, h) => a + Number(h.occupied_beds), 0), color: '#1a6b4a', bg: '#e8f5ee' },
                  { label: 'Available', value: occupancyReport.reduce((a, h) => a + Number(h.available_beds), 0), color: '#1e40af', bg: '#eff6ff' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: stat.bg, borderRadius: '12px', padding: '1.25rem', textAlign: 'center' as const }}>
                    <p style={{ fontSize: '2rem', fontWeight: 700, color: stat.color }}>{stat.value}</p>
                    <p style={{ fontSize: '0.78rem', color: '#6b6b65', fontWeight: 600 }}>{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Per hostel breakdown */}
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                  <span>Hostel</span><span>Housemaster</span><span>Total</span><span>Occupied</span><span>Available</span><span>Occupancy</span>
                </div>
                {occupancyReport.map(h => (
                  <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{h.name}</p>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.375rem', borderRadius: 10, background: HOSTEL_TYPE_BG[h.type], color: HOSTEL_TYPE_COLORS[h.type], textTransform: 'capitalize' as const }}>{h.type}</span>
                    </div>
                    <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{h.housemaster_name ?? '—'}</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', textAlign: 'center' as const }}>{h.total_beds}</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a6b4a', textAlign: 'center' as const }}>{h.occupied_beds}</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af', textAlign: 'center' as const }}>{h.available_beds}</span>
                    <div style={{ textAlign: 'center' as const }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: Number(h.occupancy_pct) >= 80 ? '#dc2626' : Number(h.occupancy_pct) >= 50 ? '#d97706' : '#1a6b4a' }}>
                        {h.occupancy_pct ?? 0}%
                      </div>
                      <div style={{ height: 4, background: '#f0f0ee', borderRadius: 2, marginTop: '0.25rem', overflow: 'hidden' }}>
                        <div style={{ width: `${h.occupancy_pct ?? 0}%`, height: '100%', background: Number(h.occupancy_pct) >= 80 ? '#dc2626' : '#1a6b4a', borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}