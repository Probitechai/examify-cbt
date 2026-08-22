'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: 'Pending',  color: '#d97706', bg: '#fffbeb' },
  approved: { label: 'Approved', color: '#1a6b4a', bg: '#e8f5ee' },
  rejected: { label: 'Rejected', color: '#dc2626', bg: '#fef2f2' },
  returned: { label: 'Returned', color: '#6b6b65', bg: '#f7f7f5' },
}

export default function Hostel2Page() {
  const router = useRouter()
  const [hostels, setHostels] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedHostel, setSelectedHostel] = useState('')
  const [allocations, setAllocations] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'exeats' | 'visitors' | 'rollcall' | 'meals'>('exeats')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)

  // Exeats
  const [exeats, setExeats] = useState<any[]>([])
  const [showExeatForm, setShowExeatForm] = useState(false)
  const [exeatForm, setExeatForm] = useState({ studentId: '', reason: '', destination: '', departureDate: '', returnDate: '', guardianName: '', guardianPhone: '', guardianRelationship: 'Parent' })
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  // Visitors
  const [visitors, setVisitors] = useState<any[]>([])
  const [showVisitorForm, setShowVisitorForm] = useState(false)
  const [visitorForm, setVisitorForm] = useState({ studentId: '', visitorName: '', visitorPhone: '', relationship: 'Parent', purpose: '' })
  const [visitorDate, setVisitorDate] = useState(new Date().toISOString().split('T')[0])

  // Roll Call
  const [rollCallEntries, setRollCallEntries] = useState<Record<string, string>>({})
  const [rollCallNotes, setRollCallNotes] = useState<Record<string, string>>({})
  const [callTime, setCallTime] = useState<'morning' | 'afternoon' | 'lights_out'>('lights_out')
  const [rollCallDate, setRollCallDate] = useState(new Date().toISOString().split('T')[0])
  const [rollCallResult, setRollCallResult] = useState<any>(null)

  // Meal Plans
  const [mealPlans, setMealPlans] = useState<any[]>([])
  const [showMealForm, setShowMealForm] = useState(false)
  const [mealForm, setMealForm] = useState({ studentId: '', planType: 'full', dietaryRequirements: '' })

  useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { loadInitial() }, [])

  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])

  useEffect(() => {
    if (selectedTerm && selectedHostel) {
      loadAllocations()
      loadExeats()
      loadVisitors()
      loadMealPlans()
    }
  }, [selectedTerm, selectedHostel])

  async function loadInitial() {
    const [sessRes, hostelRes] = await Promise.all([
      apiFetch(`${API}/sessions`),
      apiFetch(`${API}/hostels`),
    ])
    const sessData = await sessRes.json()
    const hostelData = await hostelRes.json()
    setSessions(sessData.sessions ?? [])
    setHostels(hostelData.hostels ?? [])
    const active = (sessData.sessions ?? []).find((s: any) => s.is_active)
    if (active) { setSelectedSession(active.id); loadTerms(active.id) }
    if (hostelData.hostels?.length > 0) setSelectedHostel(hostelData.hostels[0].id)
  }

  async function loadTerms(sessionId: string) {
    const res = await apiFetch(`${API}/sessions/${sessionId}/terms`)
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadAllocations() {
    if (!selectedTerm || !selectedHostel) return
    const res = await apiFetch(`${API}/hostels/allocations?termId=${selectedTerm}&hostelId=${selectedHostel}`)
    const data = await res.json()
    setAllocations(data.allocations ?? [])
    // Init roll call entries
    const entries: Record<string, string> = {}
    for (const a of data.allocations ?? []) entries[a.student_id] = 'present'
    setRollCallEntries(entries)
  }

  async function loadExeats() {
    if (!selectedTerm || !selectedHostel) return
    const res = await apiFetch(`${API}/hostels/exeats?termId=${selectedTerm}&hostelId=${selectedHostel}`)
    const data = await res.json()
    setExeats(data.exeats ?? [])
  }

  async function loadVisitors() {
    if (!selectedHostel) return
    const res = await apiFetch(`${API}/hostels/visitors?hostelId=${selectedHostel}&date=${visitorDate}`)
    const data = await res.json()
    setVisitors(data.visitors ?? [])
  }

  async function loadMealPlans() {
    if (!selectedTerm || !selectedHostel) return
    const res = await apiFetch(`${API}/hostels/meal-plans?termId=${selectedTerm}&hostelId=${selectedHostel}`)
    const data = await res.json()
    setMealPlans(data.mealPlans ?? [])
  }

  async function lookupGuardian(studentId: string) {
    if (!studentId) return
    try {
      const res = await apiFetch(`${API}/hostels/student-guardian/${studentId}`)
      const data = await res.json()
      if (data.guardian) {
        setExeatForm(f => ({
          ...f,
          guardianName: data.guardian.full_name ?? '',
          guardianPhone: data.guardian.phone ?? '',
        }))
      }
    } catch {}
  }

  async function lookupGuardian(studentId: string) {
    if (!studentId) return
    try {
      const res = await apiFetch(`${API}/hostels/student-guardian/${studentId}`)
      const data = await res.json()
      if (data.guardian) {
        setExeatForm(f => ({
          ...f,
          guardianName: data.guardian.full_name ?? '',
          guardianPhone: data.guardian.phone ?? '',
        }))
      }
    } catch {}
  }

  async function submitExeat() {
    const f = exeatForm
    if (!f.studentId || !f.reason || !f.destination || !f.departureDate || !f.returnDate || !f.guardianName || !f.guardianPhone) {
      setError('All fields are required'); return
    }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/hostels/exeats`, {
        method: 'POST',
        body: JSON.stringify({ studentId: f.studentId, hostelId: selectedHostel, termId: selectedTerm, reason: f.reason, destination: f.destination, departureDate: f.departureDate, returnDate: f.returnDate, guardianName: f.guardianName, guardianPhone: f.guardianPhone, guardianRelationship: f.guardianRelationship })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setShowExeatForm(false)
      setExeatForm({ studentId: '', reason: '', destination: '', departureDate: '', returnDate: '', guardianName: '', guardianPhone: '', guardianRelationship: 'Parent' })
      setSuccess('Exeat request submitted!'); setTimeout(() => setSuccess(''), 3000)
      loadExeats()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function updateExeatStatus(id: string, status: string, reason?: string) {
    await fetch(`${API}/hostels/exeats/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason: reason })
    })
    setRejectingId(null); setRejectReason('')
    setSuccess(`Exeat ${status}!`); setTimeout(() => setSuccess(''), 3000)
    loadExeats()
  }

  async function logVisitor() {
    const f = visitorForm
    if (!f.studentId || !f.visitorName || !f.relationship) { setError('Student, visitor name and relationship required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/hostels/visitors`, {
        method: 'POST',
        body: JSON.stringify({ studentId: f.studentId, hostelId: selectedHostel, visitorName: f.visitorName, visitorPhone: f.visitorPhone || undefined, relationship: f.relationship, purpose: f.purpose || undefined })
      })
      if (!res.ok) throw new Error('Failed to log visitor')
      setShowVisitorForm(false)
      setVisitorForm({ studentId: '', visitorName: '', visitorPhone: '', relationship: 'Parent', purpose: '' })
      setSuccess('Visitor logged!'); setTimeout(() => setSuccess(''), 3000)
      loadVisitors()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function checkoutVisitor(id: string) {
    await fetch(`${API}/hostels/visitors/${id}/checkout`, { method: 'PATCH' })
    setSuccess('Visitor checked out!'); setTimeout(() => setSuccess(''), 3000)
    loadVisitors()
  }

  async function submitRollCall() {
    if (allocations.length === 0) { setError('No students allocated to this hostel'); return }
    setSaving(true); setError('')
    try {
      const entries = allocations.map(a => ({
        studentId: a.student_id,
        status: rollCallEntries[a.student_id] ?? 'present',
        notes: rollCallNotes[a.student_id] ?? undefined,
      }))
      const res = await fetch(`${API}/hostels/roll-calls`, {
        method: 'POST',
        body: JSON.stringify({ hostelId: selectedHostel, date: rollCallDate, callTime, entries })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setRollCallResult(data)
      setSuccess(`Roll call saved! Present: ${data.present}, Absent: ${data.absent}`); setTimeout(() => setSuccess(''), 5000)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  async function saveMealPlan() {
    if (!mealForm.studentId) { setError('Student required'); return }
    setSaving(true); setError('')
    try {
      await fetch(`${API}/hostels/meal-plans`, {
        method: 'POST',
        body: JSON.stringify({ studentId: mealForm.studentId, hostelId: selectedHostel, termId: selectedTerm, planType: mealForm.planType, dietaryRequirements: mealForm.dietaryRequirements || undefined })
      })
      setShowMealForm(false)
      setMealForm({ studentId: '', planType: 'full', dietaryRequirements: '' })
      setSuccess('Meal plan saved!'); setTimeout(() => setSuccess(''), 3000)
      loadMealPlans()
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  const selectedHostelObj = hostels.find(h => h.id === selectedHostel)

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Hostel Operations</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Exeats, visitors, roll call and meal plans.</p>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>? {success}</div>}

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div><label style={lbl}>Session</label>
            <select style={sel} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label style={lbl}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select term...</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select></div>
          <div><label style={lbl}>Hostel</label>
            <select style={sel} value={selectedHostel} onChange={e => setSelectedHostel(e.target.value)}>
              <option value="">Select hostel...</option>
              {hostels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select></div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
        {([
          { key: 'exeats', label: '?? Exeat Management' },
          { key: 'visitors', label: '?? Visitor Log' },
          { key: 'rollcall', label: '?? Roll Call' },
          { key: 'meals', label: '??? Meal Plans' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* EXEATS TAB */}
      {activeTab === 'exeats' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>Exeat Requests ({exeats.length})</h2>
            <button onClick={() => setShowExeatForm(true)}
              style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              + New Exeat Request
            </button>
          </div>

          {showExeatForm && (
            <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.5rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>New Exeat Request</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Student *</label>
                  <select style={sel} value={exeatForm.studentId} onChange={e => { setExeatForm(f => ({ ...f, studentId: e.target.value })); lookupGuardian(e.target.value) }}>
                    <option value="">Select student...</option>
                    {allocations.map(a => <option key={a.student_id} value={a.student_id}>{a.student_name} — {a.class_level} {a.class_arm}</option>)}
                  </select></div>
                <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.625rem 0.875rem', fontSize: '0.78rem', color: '#92400e' }}>
                  ?? Guardian details will auto-fill if the student parent is linked in the system. Otherwise fill in manually.
                </div>
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Reason *</label>
                  <input style={inp} value={exeatForm.reason} onChange={e => setExeatForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Family event, Medical appointment" /></div>
                <div><label style={lbl}>Destination *</label>
                  <input style={inp} value={exeatForm.destination} onChange={e => setExeatForm(f => ({ ...f, destination: e.target.value }))} placeholder="e.g. Lagos, Home" /></div>
                <div><label style={lbl}>Guardian Relationship</label>
                  <select style={sel} value={exeatForm.guardianRelationship} onChange={e => setExeatForm(f => ({ ...f, guardianRelationship: e.target.value }))}>
                    <option>Parent</option><option>Guardian</option><option>Sibling</option><option>Uncle/Aunt</option><option>Other</option>
                  </select></div>
                <div><label style={lbl}>Departure Date *</label>
                  <input style={inp} type="date" value={exeatForm.departureDate} onChange={e => setExeatForm(f => ({ ...f, departureDate: e.target.value }))} /></div>
                <div><label style={lbl}>Return Date *</label>
                  <input style={inp} type="date" value={exeatForm.returnDate} onChange={e => setExeatForm(f => ({ ...f, returnDate: e.target.value }))} /></div>
                <div><label style={lbl}>Guardian Name *</label>
                  <input style={inp} value={exeatForm.guardianName} onChange={e => setExeatForm(f => ({ ...f, guardianName: e.target.value }))} /></div>
                <div><label style={lbl}>Guardian Phone *</label>
                  <input style={inp} value={exeatForm.guardianPhone} onChange={e => setExeatForm(f => ({ ...f, guardianPhone: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button onClick={submitExeat} disabled={saving}
                  style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Submitting...' : '?? Submit Request'}
                </button>
                <button onClick={() => setShowExeatForm(false)}
                  style={{ padding: '0.625rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          {exeats.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>??</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No exeat requests for this term.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {exeats.map(e => {
                const cfg = STATUS_CONFIG[e.status]
                return (
                  <div key={e.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                          <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{e.student_name} · {e.class_level} {e.class_arm}</span>
                        </div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18', marginBottom: '0.25rem' }}>{e.reason}</p>
                        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.72rem', color: '#6b6b65' }}>
                          <span>?? {e.destination}</span>
                          <span>?? {formatDate(e.departure_date)} ? {formatDate(e.return_date)}</span>
                          <span>?? {e.guardian_name} ({e.guardian_relationship}) · {e.guardian_phone}</span>
                        </div>
                        {e.rejection_reason && <p style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.375rem' }}>Rejection reason: {e.rejection_reason}</p>}
                      </div>
                      {e.status === 'pending' && (
                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, marginLeft: '1rem' }}>
                          <button onClick={() => updateExeatStatus(e.id, 'approved')}
                            style={{ padding: '0.375rem 0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '8px', fontSize: '0.72rem', color: '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                            ? Approve
                          </button>
                          <button onClick={() => setRejectingId(e.id)}
                            style={{ padding: '0.375rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                            ? Reject
                          </button>
                        </div>
                      )}
                      {e.status === 'approved' && (
                        <button onClick={() => updateExeatStatus(e.id, 'returned')}
                          style={{ padding: '0.375rem 0.875rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '0.72rem', color: '#1e40af', cursor: 'pointer', fontWeight: 600, flexShrink: 0, marginLeft: '1rem' }}>
                          ? Mark Returned
                        </button>
                      )}
                    </div>
                    {rejectingId === e.id && (
                      <div style={{ marginTop: '0.875rem', display: 'flex', gap: '0.5rem' }}>
                        <input style={{ ...inp, flex: 1 }} value={rejectReason} onChange={ev => setRejectReason(ev.target.value)} placeholder="Reason for rejection..." autoFocus />
                        <button onClick={() => updateExeatStatus(e.id, 'rejected', rejectReason)}
                          style={{ padding: '0.5rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                          Confirm Reject
                        </button>
                        <button onClick={() => setRejectingId(null)}
                          style={{ padding: '0.5rem 0.875rem', background: 'transparent', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.78rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* VISITORS TAB */}
      {activeTab === 'visitors' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>Visitor Log</h2>
              <input type="date" style={{ ...inp, width: 'auto' }} value={visitorDate} onChange={e => { setVisitorDate(e.target.value); }} />
              <button onClick={loadVisitors} style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Load</button>
            </div>
            <button onClick={() => setShowVisitorForm(true)}
              style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              + Log Visitor
            </button>
          </div>

          {showVisitorForm && (
            <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Student Being Visited *</label>
                  <select style={sel} value={visitorForm.studentId} onChange={e => setVisitorForm(f => ({ ...f, studentId: e.target.value }))}>
                    <option value="">Select student...</option>
                    {allocations.map(a => <option key={a.student_id} value={a.student_id}>{a.student_name}</option>)}
                  </select></div>
                <div><label style={lbl}>Visitor Name *</label>
                  <input style={inp} value={visitorForm.visitorName} onChange={e => setVisitorForm(f => ({ ...f, visitorName: e.target.value }))} /></div>
                <div><label style={lbl}>Visitor Phone</label>
                  <input style={inp} value={visitorForm.visitorPhone} onChange={e => setVisitorForm(f => ({ ...f, visitorPhone: e.target.value }))} /></div>
                <div><label style={lbl}>Relationship *</label>
                  <select style={sel} value={visitorForm.relationship} onChange={e => setVisitorForm(f => ({ ...f, relationship: e.target.value }))}>
                    <option>Parent</option><option>Guardian</option><option>Sibling</option><option>Uncle/Aunt</option><option>Friend</option><option>Other</option>
                  </select></div>
                <div><label style={lbl}>Purpose</label>
                  <input style={inp} value={visitorForm.purpose} onChange={e => setVisitorForm(f => ({ ...f, purpose: e.target.value }))} placeholder="e.g. Regular visit, Bring food" /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button onClick={logVisitor} disabled={saving}
                  style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Logging...' : '?? Log Check-In'}
                </button>
                <button onClick={() => setShowVisitorForm(false)}
                  style={{ padding: '0.625rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          {visitors.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>??</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No visitors logged for {visitorDate}.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                <span>Visitor</span><span>Student</span><span>Relationship</span><span>Check In</span><span>Check Out</span><span></span>
              </div>
              {visitors.map(v => (
                <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{v.visitor_name}</p>
                    {v.visitor_phone && <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{v.visitor_phone}</p>}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{v.student_name}</p>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{v.class_level}</p>
                  </div>
                  <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{v.relationship}</span>
                  <span style={{ fontSize: '0.72rem', color: '#1a1a18' }}>{formatDateTime(v.check_in_at)}</span>
                  <span style={{ fontSize: '0.72rem', color: v.check_out_at ? '#6b6b65' : '#dc2626' }}>
                    {v.check_out_at ? formatDateTime(v.check_out_at) : 'Still in'}
                  </span>
                  {!v.check_out_at && (
                    <button onClick={() => checkoutVisitor(v.id)}
                      style={{ padding: '0.3rem 0.625rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.68rem', color: '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                      Check Out
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ROLL CALL TAB */}
      {activeTab === 'rollcall' && (
        <div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', alignItems: 'flex-end', background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem' }}>
            <div><label style={lbl}>Date</label>
              <input type="date" style={{ ...inp, width: 'auto' }} value={rollCallDate} onChange={e => setRollCallDate(e.target.value)} /></div>
            <div><label style={lbl}>Roll Call Time</label>
              <select style={{ ...sel, width: 'auto' }} value={callTime} onChange={e => setCallTime(e.target.value as any)}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="lights_out">Lights Out</option>
              </select></div>
            <button onClick={submitRollCall} disabled={saving || allocations.length === 0}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : '?? Save Roll Call'}
            </button>
          </div>

          {rollCallResult && (
            <div style={{ background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', padding: '0.875rem', marginBottom: '1rem', display: 'flex', gap: '2rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#0f4a32', fontWeight: 600 }}>? Roll call saved!</span>
              <span style={{ fontSize: '0.825rem', color: '#1a6b4a' }}>Present: <strong>{rollCallResult.present}</strong></span>
              <span style={{ fontSize: '0.825rem', color: '#dc2626' }}>Absent: <strong>{rollCallResult.absent}</strong></span>
              <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Total: <strong>{rollCallResult.total}</strong></span>
            </div>
          )}

          {allocations.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No students allocated to this hostel for this term.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                <span>Student</span><span>Room</span><span>Bed</span><span>Status</span><span></span><span>Notes</span>
              </div>
              {allocations.map(a => {
                const status = rollCallEntries[a.student_id] ?? 'present'
                const statusColors: Record<string, string> = { present: '#1a6b4a', absent: '#dc2626', on_exeat: '#d97706', sick: '#7e22ce' }
                return (
                  <div key={a.student_id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1.5fr', gap: '1rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{a.student_name}</p>
                      <p style={{ fontSize: '0.68rem', color: '#6b6b65' }}>{a.class_level} {a.class_arm}</p>
                    </div>
                    <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Rm {a.room_number}</span>
                    <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{a.bed_number}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: statusColors[status], textTransform: 'capitalize' as const }}>{status.replace('_', ' ')}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {(['present', 'absent', 'on_exeat', 'sick'] as const).map(s => (
                        <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.68rem', color: statusColors[s] }}>
                          <input type="radio" name={`status-${a.student_id}`} value={s} checked={status === s}
                            onChange={() => setRollCallEntries(prev => ({ ...prev, [a.student_id]: s }))}
                            style={{ accentColor: statusColors[s] }} />
                          {s.replace('_', ' ')}
                        </label>
                      ))}
                    </div>
                    <input style={{ ...inp, fontSize: '0.72rem', padding: '0.375rem 0.625rem' }}
                      value={rollCallNotes[a.student_id] ?? ''}
                      onChange={e => setRollCallNotes(prev => ({ ...prev, [a.student_id]: e.target.value }))}
                      placeholder="Notes..." />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* MEAL PLANS TAB */}
      {activeTab === 'meals' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>Meal Plans ({mealPlans.length} students)</h2>
            <button onClick={() => setShowMealForm(true)}
              style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
              + Assign Meal Plan
            </button>
          </div>

          {showMealForm && (
            <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.5rem', marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div><label style={lbl}>Student *</label>
                  <select style={sel} value={mealForm.studentId} onChange={e => setMealForm(f => ({ ...f, studentId: e.target.value }))}>
                    <option value="">Select student...</option>
                    {allocations.map(a => <option key={a.student_id} value={a.student_id}>{a.student_name}</option>)}
                  </select></div>
                <div><label style={lbl}>Meal Plan</label>
                  <select style={sel} value={mealForm.planType} onChange={e => setMealForm(f => ({ ...f, planType: e.target.value }))}>
                    <option value="full">Full Board (3 meals)</option>
                    <option value="breakfast_only">Breakfast Only</option>
                    <option value="lunch_only">Lunch Only</option>
                    <option value="dinner_only">Dinner Only</option>
                    <option value="none">No Meals</option>
                  </select></div>
                <div><label style={lbl}>Dietary Requirements</label>
                  <input style={inp} value={mealForm.dietaryRequirements} onChange={e => setMealForm(f => ({ ...f, dietaryRequirements: e.target.value }))} placeholder="e.g. Vegetarian, No pork" /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={saveMealPlan} disabled={saving}
                  style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving...' : '??? Save Meal Plan'}
                </button>
                <button onClick={() => setShowMealForm(false)}
                  style={{ padding: '0.625rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Meal plan summary */}
          {mealPlans.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {(['full', 'breakfast_only', 'lunch_only', 'dinner_only', 'none'] as const).map(pt => {
                const count = mealPlans.filter(m => m.plan_type === pt).length
                const labels: Record<string, string> = { full: 'Full Board', breakfast_only: 'Breakfast', lunch_only: 'Lunch', dinner_only: 'Dinner', none: 'No Meals' }
                return (
                  <div key={pt} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '10px', padding: '0.875rem', textAlign: 'center' as const }}>
                    <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18' }}>{count}</p>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{labels[pt]}</p>
                  </div>
                )
              })}
            </div>
          )}

          {mealPlans.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>???</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No meal plans assigned for this term.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                <span>Student</span><span>Class</span><span>Meal Plan</span><span>Dietary Requirements</span>
              </div>
              {mealPlans.map(m => (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{m.student_name}</p>
                  <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{m.class_level} {m.class_arm}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 10, background: m.plan_type === 'full' ? '#e8f5ee' : '#f7f7f5', color: m.plan_type === 'full' ? '#0f4a32' : '#6b6b65', textTransform: 'capitalize' as const }}>
                    {m.plan_type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{m.dietary_requirements ?? '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
