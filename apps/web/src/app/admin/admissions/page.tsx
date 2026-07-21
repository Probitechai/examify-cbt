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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:              { label: 'Pending',            color: '#d97706', bg: '#fffbeb' },
  reviewing:            { label: 'Reviewing',          color: '#1e40af', bg: '#eff6ff' },
  exam_invited:         { label: 'Exam Invited',       color: '#7e22ce', bg: '#f5f3ff' },
  exam_taken:           { label: 'Exam Taken',         color: '#0369a1', bg: '#e0f2fe' },
  interview_scheduled:  { label: 'Interview Scheduled',color: '#0891b2', bg: '#ecfeff' },
  interview_done:       { label: 'Interview Done',     color: '#059669', bg: '#ecfdf5' },
  offered:              { label: 'Offered',            color: '#1a6b4a', bg: '#e8f5ee' },
  accepted:             { label: 'Accepted',           color: '#0f4a32', bg: '#dcfce7' },
  rejected:             { label: 'Rejected',           color: '#dc2626', bg: '#fef2f2' },
  waitlisted:           { label: 'Waitlisted',         color: '#92400e', bg: '#fef3c7' },
  enrolled:             { label: 'Enrolled',           color: '#1a6b4a', bg: '#bbf7d0' },
}

import { NIGERIAN_LGAS } from '../students/lga-data'
const NIGERIAN_STATES = Object.keys(NIGERIAN_LGAS).sort()
const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']

export default function AdmissionsPage() {
  const router = useRouter()
  const [stats, setStats] = useState<any>(null)
  const [applications, setApplications] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'offered' | 'enrolled' | 'rejected' | 'settings'>('all')
  const [showAddForm, setShowAddForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [subdomain, setSubdomain] = useState('')

  // Add applicant form
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', middleName: '', dateOfBirth: '', gender: '', appliedClass: 'JSS1', previousSchool: '', parentName: '', parentEmail: '', parentPhone: '', parentRelationship: 'parent', stateOfOrigin: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')

  // Settings form
  const [settingsForm, setSettingsForm] = useState<any>({})
  const [savingSettings, setSavingSettings] = useState(false)

  useEffect(() => {
    const sub = getSubdomain()
    setSubdomain(sub)
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [statsRes, appsRes, settingsRes] = await Promise.all([
        fetch(`${API}/admissions/stats`, { headers: hdrs() }),
        fetch(`${API}/admissions/applications`, { headers: hdrs() }),
        fetch(`${API}/admissions/settings`, { headers: hdrs() }),
      ])
      const statsData = await statsRes.json()
      const appsData = await appsRes.json()
      const settingsData = await settingsRes.json()
      setStats(statsData.stats)
      setApplications(appsData.applications ?? [])
      setSettings(settingsData.settings)
      setSettingsForm(settingsData.settings ?? {})
    } catch {} finally { setLoading(false) }
  }

  async function handleAddApplicant() {
    if (!addForm.firstName || !addForm.lastName || !addForm.parentName || !addForm.parentEmail || !addForm.parentPhone) {
      setAddError('Please fill all required fields'); return
    }
    setAdding(true); setAddError('')
    try {
      const res = await fetch(`${API}/admissions/applicants`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          firstName: addForm.firstName, lastName: addForm.lastName,
          middleName: addForm.middleName || undefined,
          dateOfBirth: addForm.dateOfBirth || undefined,
          gender: addForm.gender || undefined,
          appliedClass: addForm.appliedClass,
          previousSchool: addForm.previousSchool || undefined,
          parentName: addForm.parentName, parentEmail: addForm.parentEmail,
          parentPhone: addForm.parentPhone, parentRelationship: addForm.parentRelationship,
          stateOfOrigin: addForm.stateOfOrigin || undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add applicant')
      setShowAddForm(false)
      setAddForm({ firstName: '', lastName: '', middleName: '', dateOfBirth: '', gender: '', appliedClass: 'JSS1', previousSchool: '', parentName: '', parentEmail: '', parentPhone: '', parentRelationship: 'parent', stateOfOrigin: '' })
      loadAll()
    } catch (e: any) { setAddError(e.message) } finally { setAdding(false) }
  }

  async function saveSettings() {
    setSavingSettings(true)
    try {
      await fetch(`${API}/admissions/settings`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          intakeMode: settingsForm.intake_mode ?? 'both',
          examType: settingsForm.exam_type ?? 'manual',
          requireExam: settingsForm.require_exam ?? true,
          requireInterview: settingsForm.require_interview ?? false,
          acceptanceFee: Number(settingsForm.acceptance_fee ?? 0),
          acceptanceFeeRequired: settingsForm.acceptance_fee_required ?? false,
          applicationOpen: settingsForm.application_open ?? true,
          applyForClasses: settingsForm.apply_for_classes ?? [],
          welcomeMessage: settingsForm.welcome_message ?? '',
        })
      })
      loadAll()
      setShowSettings(false)
    } catch {} finally { setSavingSettings(false) }
  }

  const filtered = applications.filter(a => {
    if (activeTab === 'all') return true
    if (activeTab === 'pending') return ['pending', 'reviewing'].includes(a.status)
    if (activeTab === 'offered') return ['offered', 'accepted', 'exam_invited', 'exam_taken', 'interview_scheduled', 'interview_done'].includes(a.status)
    return a.status === activeTab
  })

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  const publicLink = `https://examify-cbt-web.vercel.app/apply/${subdomain}`

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Admissions</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Manage applications from enquiry to enrollment.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setShowSettings(true)}
            style={{ padding: '0.5rem 1rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#1a1a18', cursor: 'pointer' }}>
            ⚙️ Settings
          </button>
          <button onClick={() => setShowAddForm(true)}
            style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
            + Add applicant
          </button>
        </div>
      </div>

      {/* Public link banner */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>📎 Public Application Link</p>
          <p style={{ fontSize: '0.78rem', color: '#1e40af' }}>{publicLink}</p>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(publicLink); alert('Link copied!') }}
          style={{ padding: '0.375rem 0.875rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
          Copy link
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total', value: stats.total, color: '#1a1a18' },
            { label: 'Pending', value: stats.pending, color: '#d97706' },
            { label: 'Reviewing', value: stats.reviewing, color: '#1e40af' },
            { label: 'Offered', value: stats.offered, color: '#1a6b4a' },
            { label: 'Accepted', value: stats.accepted, color: '#0f4a32' },
            { label: 'Waitlisted', value: stats.waitlisted, color: '#92400e' },
            { label: 'Rejected', value: stats.rejected, color: '#dc2626' },
            { label: 'Enrolled', value: stats.enrolled, color: '#059669' },
          ].map(item => (
            <div key={item.label} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '10px', padding: '0.75rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '1.25rem', fontWeight: 700, color: item.color }}>{item.value ?? 0}</p>
              <p style={{ fontSize: '0.65rem', color: '#6b6b65', fontWeight: 600, textTransform: 'uppercase' as const }}>{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '10px', overflow: 'hidden', marginBottom: '1rem', width: 'fit-content' }}>
        {([
          { key: 'all', label: 'All' },
          { key: 'pending', label: 'Pending' },
          { key: 'offered', label: 'In Progress' },
          { key: 'enrolled', label: 'Enrolled' },
          { key: 'rejected', label: 'Rejected' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.5rem 1rem', fontSize: '0.825rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Applications table */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 100px 80px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
          <span>Applicant</span><span>Parent</span><span>Class</span><span>Applied</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' as const, color: '#6b6b65' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '4rem', textAlign: 'center' as const }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📋</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No applications yet. Share the public link or add applicants manually.</p>
          </div>
        ) : filtered.map((a: any) => {
          const cfg = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.pending
          return (
            <div key={a.applicant_id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 100px 80px', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{a.first_name} {a.last_name}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{a.application_number}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{a.parent_name}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{a.parent_phone}</p>
              </div>
              <span style={{ fontSize: '0.825rem', color: '#3a3a36', fontWeight: 600 }}>{a.applied_class}</span>
              <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
                {new Date(a.applied_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' as const }}>
                {cfg.label}
              </span>
              <button onClick={() => router.push(`/admin/admissions/${a.applicant_id}`)}
                style={{ padding: '0.3rem 0.75rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                View
              </button>
            </div>
          )
        })}
      </div>

      {/* Add Applicant Modal */}
      {showAddForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowAddForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18' }}>Add Applicant</h2>
              <button onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#6b6b65' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a6b4a', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Applicant Details</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><label style={lbl}>First Name *</label><input style={inp} value={addForm.firstName} onChange={e => setAddForm(f => ({ ...f, firstName: e.target.value }))} /></div>
                <div><label style={lbl}>Last Name *</label><input style={inp} value={addForm.lastName} onChange={e => setAddForm(f => ({ ...f, lastName: e.target.value }))} /></div>
                <div><label style={lbl}>Middle Name</label><input style={inp} value={addForm.middleName} onChange={e => setAddForm(f => ({ ...f, middleName: e.target.value }))} /></div>
                <div><label style={lbl}>Date of Birth</label><input style={inp} type="date" value={addForm.dateOfBirth} onChange={e => setAddForm(f => ({ ...f, dateOfBirth: e.target.value }))} /></div>
                <div><label style={lbl}>Gender</label>
                  <select style={sel} value={addForm.gender} onChange={e => setAddForm(f => ({ ...f, gender: e.target.value }))}>
                    <option value="">Select...</option><option value="male">Male</option><option value="female">Female</option>
                  </select></div>
                <div><label style={lbl}>Applying for Class *</label>
                  <select style={sel} value={addForm.appliedClass} onChange={e => setAddForm(f => ({ ...f, appliedClass: e.target.value }))}>
                    {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                  </select></div>
              </div>
              <div><label style={lbl}>Previous School</label><input style={inp} value={addForm.previousSchool} onChange={e => setAddForm(f => ({ ...f, previousSchool: e.target.value }))} placeholder="Name of last school attended" /></div>

              <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a6b4a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: '0.5rem' }}>Parent / Guardian</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><label style={lbl}>Parent Name *</label><input style={inp} value={addForm.parentName} onChange={e => setAddForm(f => ({ ...f, parentName: e.target.value }))} /></div>
                <div><label style={lbl}>Phone *</label><input style={inp} value={addForm.parentPhone} onChange={e => setAddForm(f => ({ ...f, parentPhone: e.target.value }))} /></div>
                <div><label style={lbl}>Email *</label><input style={inp} type="email" value={addForm.parentEmail} onChange={e => setAddForm(f => ({ ...f, parentEmail: e.target.value }))} /></div>
                <div><label style={lbl}>Relationship</label>
                  <select style={sel} value={addForm.parentRelationship} onChange={e => setAddForm(f => ({ ...f, parentRelationship: e.target.value }))}>
                    <option value="parent">Parent</option><option value="guardian">Guardian</option><option value="uncle">Uncle</option><option value="aunt">Aunt</option><option value="grandparent">Grandparent</option>
                  </select></div>
              </div>
              {addError && <p style={{ fontSize: '0.825rem', color: '#dc2626' }}>{addError}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button onClick={handleAddApplicant} disabled={adding}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: adding ? 0.6 : 1 }}>
                  {adding ? 'Adding...' : 'Add applicant'}
                </button>
                <button onClick={() => setShowAddForm(false)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18' }}>Admissions Settings</h2>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#6b6b65' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={lbl}>Application intake mode</label>
                <select style={sel} value={settingsForm.intake_mode ?? 'both'} onChange={e => setSettingsForm((f: any) => ({ ...f, intake_mode: e.target.value }))}>
                  <option value="public">Public form only</option>
                  <option value="manual">Manual entry only</option>
                  <option value="both">Both (public + manual)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Entrance exam type</label>
                <select style={sel} value={settingsForm.exam_type ?? 'manual'} onChange={e => setSettingsForm((f: any) => ({ ...f, exam_type: e.target.value }))}>
                  <option value="none">No entrance exam</option>
                  <option value="manual">Manual score entry</option>
                  <option value="cbt">Examify CBT exam</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="requireInterview" checked={settingsForm.require_interview ?? false} onChange={e => setSettingsForm((f: any) => ({ ...f, require_interview: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                <label htmlFor="requireInterview" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Require interview</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="acceptanceFeeRequired" checked={settingsForm.acceptance_fee_required ?? false} onChange={e => setSettingsForm((f: any) => ({ ...f, acceptance_fee_required: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                <label htmlFor="acceptanceFeeRequired" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Require acceptance fee</label>
              </div>
              {settingsForm.acceptance_fee_required && (
                <div>
                  <label style={lbl}>Acceptance fee amount (₦)</label>
                  <input style={inp} type="number" value={settingsForm.acceptance_fee ?? 0} onChange={e => setSettingsForm((f: any) => ({ ...f, acceptance_fee: Number(e.target.value) }))} />
                </div>
              )}
              <div>
                <label style={lbl}>Classes accepting applications</label>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.5rem' }}>
                  {CLASS_LEVELS.map(c => {
                    const selected = (settingsForm.apply_for_classes ?? []).includes(c)
                    return (
                      <button key={c} onClick={() => {
                        const current = settingsForm.apply_for_classes ?? []
                        setSettingsForm((f: any) => ({ ...f, apply_for_classes: selected ? current.filter((x: string) => x !== c) : [...current, c] }))
                      }}
                        style={{ padding: '0.25rem 0.875rem', border: `1.5px solid ${selected ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: 20, background: selected ? '#e8f5ee' : 'white', color: selected ? '#0f4a32' : '#6b6b65', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label style={lbl}>Welcome message (shown on public form)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={settingsForm.welcome_message ?? ''} onChange={e => setSettingsForm((f: any) => ({ ...f, welcome_message: e.target.value }))} placeholder="e.g. Welcome to our admissions portal. We are excited to have you apply." />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="applicationOpen" checked={settingsForm.application_open ?? true} onChange={e => setSettingsForm((f: any) => ({ ...f, application_open: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                <label htmlFor="applicationOpen" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Applications are open</label>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                <button onClick={saveSettings} disabled={savingSettings}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: savingSettings ? 0.6 : 1 }}>
                  {savingSettings ? 'Saving...' : '💾 Save settings'}
                </button>
                <button onClick={() => setShowSettings(false)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
