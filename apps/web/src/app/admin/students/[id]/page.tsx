'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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

async function uploadToSupabase(file: File, studentId: string): Promise<string> {
  const ext = file.name.split('.').pop()
  const path = `${studentId}/${Date.now()}.${ext}`
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/student-documents/${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error('Upload failed')
  return `${SUPABASE_URL}/storage/v1/object/public/student-documents/${path}`
}

const TABS = [
  { key: 'profile', label: 'Bio-data' },
  { key: 'family', label: 'Family' },
  { key: 'medical', label: 'Medical' },
  { key: 'documents', label: 'Documents' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'discipline', label: 'Discipline' },
]

import { NIGERIAN_LGAS } from '../lga-data'
const NIGERIAN_STATES = Object.keys(NIGERIAN_LGAS).sort()

const DOCUMENT_TYPES: Record<string, string> = {
  birth_certificate: 'Birth Certificate',
  passport_photo: 'Passport Photo',
  previous_school_report: 'Previous School Report',
  medical_certificate: 'Medical Certificate',
  local_government_letter: 'Local Government Letter',
  baptismal_certificate: 'Baptismal Certificate',
  scholarship_letter: 'Scholarship Letter',
  other: 'Other',
}

const INCIDENT_TYPES: Record<string, string> = {
  misconduct: 'Misconduct', absenteeism: 'Absenteeism', bullying: 'Bullying',
  cheating: 'Cheating', property_damage: 'Property Damage',
  insubordination: 'Insubordination', violence: 'Violence', other: 'Other',
}

const ACTION_TYPES: Record<string, string> = {
  verbal_warning: 'Verbal Warning', written_warning: 'Written Warning',
  detention: 'Detention', suspension: 'Suspension', parent_invited: 'Parent Invited',
  community_service: 'Community Service', expulsion: 'Expulsion', other: 'Other',
}

const ACHIEVEMENT_CATEGORIES: Record<string, string> = {
  academic: 'Academic', sports: 'Sports', arts: 'Arts',
  leadership: 'Leadership', community: 'Community', competition: 'Competition', other: 'Other',
}

export default function StudentProfilePage() {
  const params = useParams()
  const router = useRouter()
  const studentId = params.id as string

  const [tab, setTab] = useState('profile')
  const [student, setStudent] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [parents, setParents] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [achievements, setAchievements] = useState<any[]>([])
  const [discipline, setDiscipline] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [profileForm, setProfileForm] = useState<any>({})
  const [showAchForm, setShowAchForm] = useState(false)
  const [achForm, setAchForm] = useState({ title: '', category: 'academic', description: '', dateAwarded: '', awardedBy: '' })
  const [showDiscForm, setShowDiscForm] = useState(false)
  const [discForm, setDiscForm] = useState({ incidentDate: '', incidentType: 'misconduct', description: '', actionTaken: 'verbal_warning', actionDetails: '', parentNotified: false })
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [docType, setDocType] = useState('birth_certificate')
  const [docName, setDocName] = useState('')

  useEffect(() => { loadAll() }, [studentId])

  async function loadAll() {
    setLoading(true)
    try {
      const [profileRes, docsRes, achRes, discRes] = await Promise.all([
        fetch(`${API}/students/${studentId}/profile`, { headers: hdrs() }),
        fetch(`${API}/students/${studentId}/documents`, { headers: hdrs() }),
        fetch(`${API}/students/${studentId}/achievements`, { headers: hdrs() }),
        fetch(`${API}/students/${studentId}/discipline`, { headers: hdrs() }),
      ])
      const profileData = await profileRes.json()
      const docsData = await docsRes.json()
      const achData = await achRes.json()
      const discData = await discRes.json()
      setStudent(profileData.student)
      setProfile(profileData.profile)
      setParents(profileData.parents ?? [])
      setProfileForm(profileData.profile ?? {})
      setDocuments(docsData.documents ?? [])
      setAchievements(achData.achievements ?? [])
      setDiscipline(discData.records ?? [])
    } catch { setError('Failed to load student data') } finally { setLoading(false) }
  }

  async function saveProfile() {
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch(`${API}/students/${studentId}/profile`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          dateOfBirth: profileForm.date_of_birth?.slice(0,10) || undefined,
          gender: profileForm.gender || undefined,
          religion: profileForm.religion || undefined,
          nationality: profileForm.nationality || undefined,
          stateOfOrigin: profileForm.state_of_origin || undefined,
          lga: profileForm.lga || undefined,
          homeAddress: profileForm.home_address || undefined,
          bloodGroup: profileForm.blood_group || undefined,
          genotype: profileForm.genotype || undefined,
          allergies: profileForm.allergies || undefined,
          medicalConditions: profileForm.medical_conditions || undefined,
          entryClass: profileForm.entry_class || undefined,
          entryDate: profileForm.entry_date?.slice(0,10) || undefined,
          previousSchool: profileForm.previous_school || undefined,
          previousSchoolAddress: profileForm.previous_school_address || undefined,
          emergencyContactName: profileForm.emergency_contact_name || undefined,
          emergencyContactPhone: profileForm.emergency_contact_phone || undefined,
          emergencyContactRelationship: profileForm.emergency_contact_relationship || undefined,
        })
      })
      if (!res.ok) throw new Error('Failed to save')
      setSuccess('Profile saved!')
      setTimeout(() => setSuccess(''), 3000)
      loadAll()
    } catch { setError('Failed to save profile') } finally { setSaving(false) }
  }

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!docName.trim()) { setError('Please enter a document name first'); return }
    setUploading(true); setError('')
    try {
      const fileUrl = await uploadToSupabase(file, studentId)
      await fetch(`${API}/students/${studentId}/documents`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ documentType: docType, documentName: docName, fileUrl })
      })
      setDocName(''); setDocType('birth_certificate')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSuccess('Document uploaded!'); setTimeout(() => setSuccess(''), 3000)
      loadAll()
    } catch { setError('Failed to upload document') } finally { setUploading(false) }
  }

  async function deleteDocument(docId: string) {
    if (!window.confirm('Delete this document?')) return
    await fetch(`${API}/students/${studentId}/documents/${docId}`, { method: 'DELETE', headers: hdrs() })
    setDocuments(prev => prev.filter(d => d.id !== docId))
  }

  async function addAchievement() {
    if (!achForm.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    try {
      await fetch(`${API}/students/${studentId}/achievements`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ title: achForm.title, category: achForm.category, description: achForm.description || undefined, dateAwarded: achForm.dateAwarded || undefined, awardedBy: achForm.awardedBy || undefined })
      })
      setAchForm({ title: '', category: 'academic', description: '', dateAwarded: '', awardedBy: '' })
      setShowAchForm(false); loadAll()
    } catch { setError('Failed to save') } finally { setSaving(false) }
  }

  async function deleteAchievement(achId: string) {
    if (!window.confirm('Delete this achievement?')) return
    await fetch(`${API}/students/${studentId}/achievements/${achId}`, { method: 'DELETE', headers: hdrs() })
    setAchievements(prev => prev.filter(a => a.id !== achId))
  }

  async function addDisciplineRecord() {
    if (!discForm.incidentDate || !discForm.description.trim()) { setError('Date and description are required'); return }
    setSaving(true)
    try {
      await fetch(`${API}/students/${studentId}/discipline`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ incidentDate: discForm.incidentDate, incidentType: discForm.incidentType, description: discForm.description, actionTaken: discForm.actionTaken, actionDetails: discForm.actionDetails || undefined, parentNotified: discForm.parentNotified })
      })
      setDiscForm({ incidentDate: '', incidentType: 'misconduct', description: '', actionTaken: 'verbal_warning', actionDetails: '', parentNotified: false })
      setShowDiscForm(false); loadAll()
    } catch { setError('Failed to save') } finally { setSaving(false) }
  }

  async function resolveRecord(recId: string) {
    const notes = window.prompt('Resolution notes (optional):')
    if (notes === null) return
    await fetch(`${API}/students/${studentId}/discipline/${recId}/resolve`, {
      method: 'PATCH', headers: hdrs(), body: JSON.stringify({ resolutionNotes: notes })
    })
    loadAll()
  }

  function setField(field: string, value: any) { setProfileForm((prev: any) => ({ ...prev, [field]: value })) }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  if (loading) return (
    <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui' }}>
      <p style={{ color: '#6b6b65' }}>Loading student profile...</p>
    </div>
  )

  if (!student) return (
    <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui' }}>
      <p style={{ color: '#dc2626' }}>Student not found.</p>
      <button onClick={() => router.back()} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Back</button>
    </div>
  )

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 900 }}>
      {/* Student header */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div>
          {student.photo_url ? (
            <img src={student.photo_url} alt={student.full_name} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' as const, border: '3px solid #e5e5e0' }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#e8f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 700, color: '#1a6b4a' }}>
              {student.full_name?.charAt(0)}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.25rem' }}>{student.full_name}</h1>
          <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '0.375rem' }}>
            {student.class_level} {student.class_arm} · {student.admission_no ?? 'No admission number'} · {student.email}
          </p>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: student.is_active ? '#e8f5ee' : '#fef2f2', color: student.is_active ? '#0f4a32' : '#dc2626' }}>
            {student.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <button onClick={() => router.back()} style={{ padding: '0.5rem 1rem', background: '#f7f7f5', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Back</button>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: tab === t.key ? '#1a6b4a' : 'transparent', color: tab === t.key ? 'white' : '#6b6b65' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* BIO-DATA TAB */}
      {tab === 'profile' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Bio-data</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div><label style={lbl}>Date of Birth</label>
              <input style={inp} type="date" value={profileForm.date_of_birth?.slice(0,10) ?? ''} onChange={e => setField('date_of_birth', e.target.value)} /></div>
            <div><label style={lbl}>Gender</label>
              <select style={sel} value={profileForm.gender ?? ''} onChange={e => setField('gender', e.target.value)}>
                <option value="">Select...</option><option value="male">Male</option><option value="female">Female</option>
              </select></div>
            <div><label style={lbl}>Religion</label>
              <select style={sel} value={profileForm.religion ?? ''} onChange={e => setField('religion', e.target.value)}>
                <option value="">Select...</option><option>Christianity</option><option>Islam</option><option>Traditional</option><option>Other</option>
              </select></div>
            <div><label style={lbl}>Nationality</label>
              <input style={inp} value={profileForm.nationality ?? 'Nigerian'} onChange={e => setField('nationality', e.target.value)} /></div>
            <div><label style={lbl}>State of Origin</label>
              <select style={sel} value={profileForm.state_of_origin ?? ''} onChange={e => setField('state_of_origin', e.target.value)}>
                <option value="">Select...</option>
                {NIGERIAN_STATES.map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div><label style={lbl}>LGA</label>
              <select style={sel} value={profileForm.lga ?? ''} onChange={e => setField('lga', e.target.value)}>
                <option value="">Select LGA...</option>
                {profileForm.state_of_origin && NIGERIAN_LGAS[profileForm.state_of_origin]
                  ? NIGERIAN_LGAS[profileForm.state_of_origin].map((l: string) => <option key={l}>{l}</option>)
                  : <option disabled>Select a state first</option>
                }
              </select>
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>Home Address</label>
            <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={profileForm.home_address ?? ''} onChange={e => setField('home_address', e.target.value)} placeholder="Full home address" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div><label style={lbl}>Entry Class</label>
              <input style={inp} value={profileForm.entry_class ?? ''} onChange={e => setField('entry_class', e.target.value)} placeholder="e.g. JSS1" /></div>
            <div><label style={lbl}>Entry Date</label>
              <input style={inp} type="date" value={profileForm.entry_date?.slice(0,10) ?? ''} onChange={e => setField('entry_date', e.target.value)} /></div>
            <div><label style={lbl}>Previous School</label>
              <input style={inp} value={profileForm.previous_school ?? ''} onChange={e => setField('previous_school', e.target.value)} placeholder="Name of previous school" /></div>
            <div><label style={lbl}>Previous School Address</label>
              <input style={inp} value={profileForm.previous_school_address ?? ''} onChange={e => setField('previous_school_address', e.target.value)} placeholder="Address" /></div>
          </div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.875rem', marginTop: '1.5rem' }}>Emergency Contact</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div><label style={lbl}>Contact Name</label>
              <input style={inp} value={profileForm.emergency_contact_name ?? ''} onChange={e => setField('emergency_contact_name', e.target.value)} placeholder="Full name" /></div>
            <div><label style={lbl}>Phone Number</label>
              <input style={inp} value={profileForm.emergency_contact_phone ?? ''} onChange={e => setField('emergency_contact_phone', e.target.value)} placeholder="08012345678" /></div>
            <div><label style={lbl}>Relationship</label>
              <select style={sel} value={profileForm.emergency_contact_relationship ?? ''} onChange={e => setField('emergency_contact_relationship', e.target.value)}>
                <option value="">Select...</option>
                <option>Father</option><option>Mother</option><option>Guardian</option>
                <option>Uncle</option><option>Aunt</option><option>Grandparent</option><option>Other</option>
              </select></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button onClick={saveProfile} disabled={saving}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : '💾 Save bio-data'}
            </button>
          </div>
        </div>
      )}

      {/* FAMILY TAB */}
      {tab === 'family' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Parent / Guardian Information</h2>
          {parents.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' as const, background: '#f7f7f5', borderRadius: '12px' }}>
              <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👨‍👩‍👧</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '0.5rem' }}>No parent accounts linked yet.</p>
              <p style={{ fontSize: '0.78rem', color: '#a0a09a' }}>Go to Students & Staff → Parents tab to add and link a parent.</p>
            </div>
          ) : parents.map((p: any) => (
            <div key={p.id} style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem', marginBottom: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{p.full_name}</p>
                  <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '0.25rem' }}>📧 {p.email}</p>
                  {p.phone && <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>📱 {p.phone}</p>}
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: '#e8f5ee', color: '#0f4a32', textTransform: 'capitalize' as const }}>
                  {p.relationship ?? 'Parent'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MEDICAL TAB */}
      {tab === 'medical' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Medical Information</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div><label style={lbl}>Blood Group</label>
              <select style={sel} value={profileForm.blood_group ?? ''} onChange={e => setField('blood_group', e.target.value)}>
                <option value="">Select...</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'].map(b => <option key={b}>{b}</option>)}
              </select></div>
            <div><label style={lbl}>Genotype</label>
              <select style={sel} value={profileForm.genotype ?? ''} onChange={e => setField('genotype', e.target.value)}>
                <option value="">Select...</option>
                {['AA','AS','SS','AC','SC','Unknown'].map(g => <option key={g}>{g}</option>)}
              </select></div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>Known Allergies</label>
            <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={profileForm.allergies ?? ''} onChange={e => setField('allergies', e.target.value)} placeholder="e.g. Penicillin, groundnuts — or None" />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={lbl}>Medical Conditions / Notes</label>
            <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={profileForm.medical_conditions ?? ''} onChange={e => setField('medical_conditions', e.target.value)} placeholder="e.g. Asthma, Sickle cell trait — or None" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={saveProfile} disabled={saving}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : '💾 Save medical info'}
            </button>
          </div>
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {tab === 'documents' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Documents</h2>
          <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Upload New Document</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
              <div><label style={lbl}>Document Type</label>
                <select style={sel} value={docType} onChange={e => setDocType(e.target.value)}>
                  {Object.entries(DOCUMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select></div>
              <div><label style={lbl}>Document Name</label>
                <input style={inp} value={docName} onChange={e => setDocName(e.target.value)} placeholder="e.g. Birth Certificate 2010" /></div>
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleDocumentUpload} disabled={uploading} style={{ fontSize: '0.825rem' }} />
            {uploading && <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.5rem' }}>Uploading...</p>}
          </div>
          {documents.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: '#a0a09a', textAlign: 'center' as const, padding: '2rem' }}>No documents uploaded yet.</p>
          ) : documents.map((doc: any) => (
            <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem', background: '#f7f7f5', borderRadius: '10px', marginBottom: '0.5rem' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{doc.document_name}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{DOCUMENT_TYPES[doc.document_type]} · {new Date(doc.uploaded_at).toLocaleDateString('en-NG')}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a href={doc.file_url} target="_blank" rel="noreferrer"
                  style={{ padding: '0.3rem 0.75rem', background: '#eff6ff', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#1e40af', cursor: 'pointer', fontWeight: 600, textDecoration: 'none' }}>View</a>
                <button onClick={() => deleteDocument(doc.id)}
                  style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ACHIEVEMENTS TAB */}
      {tab === 'achievements' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Achievements & Awards</h2>
            <button onClick={() => setShowAchForm(!showAchForm)}
              style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add achievement
            </button>
          </div>
          {showAchForm && (
            <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <div><label style={lbl}>Title</label>
                  <input style={inp} value={achForm.title} onChange={e => setAchForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Best Student in Mathematics" /></div>
                <div><label style={lbl}>Category</label>
                  <select style={sel} value={achForm.category} onChange={e => setAchForm(f => ({ ...f, category: e.target.value }))}>
                    {Object.entries(ACHIEVEMENT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><label style={lbl}>Date Awarded</label>
                  <input style={inp} type="date" value={achForm.dateAwarded} onChange={e => setAchForm(f => ({ ...f, dateAwarded: e.target.value }))} /></div>
                <div><label style={lbl}>Awarded By</label>
                  <input style={inp} value={achForm.awardedBy} onChange={e => setAchForm(f => ({ ...f, awardedBy: e.target.value }))} placeholder="e.g. Mathematics Department" /></div>
              </div>
              <div style={{ marginBottom: '0.875rem' }}>
                <label style={lbl}>Description (optional)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={achForm.description} onChange={e => setAchForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={addAchievement} disabled={saving}
                  style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setShowAchForm(false)}
                  style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
          {achievements.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: '#a0a09a', textAlign: 'center' as const, padding: '2rem' }}>No achievements recorded yet.</p>
          ) : achievements.map((a: any) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.875rem 1.25rem', background: '#f7f7f5', borderRadius: '10px', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{a.title}</p>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af', textTransform: 'capitalize' as const }}>
                    {ACHIEVEMENT_CATEGORIES[a.category]}
                  </span>
                </div>
                {a.description && <p style={{ fontSize: '0.78rem', color: '#3a3a36', marginBottom: '0.25rem' }}>{a.description}</p>}
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
                  {a.awarded_by && `By ${a.awarded_by}`}
                  {a.date_awarded && ` · ${new Date(a.date_awarded).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </p>
              </div>
              <button onClick={() => deleteAchievement(a.id)}
                style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* DISCIPLINE TAB */}
      {tab === 'discipline' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Discipline Records</h2>
            <button onClick={() => setShowDiscForm(!showDiscForm)}
              style={{ padding: '0.5rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add record
            </button>
          </div>
          {showDiscForm && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <div><label style={lbl}>Incident Date</label>
                  <input style={inp} type="date" value={discForm.incidentDate} onChange={e => setDiscForm(f => ({ ...f, incidentDate: e.target.value }))} /></div>
                <div><label style={lbl}>Incident Type</label>
                  <select style={sel} value={discForm.incidentType} onChange={e => setDiscForm(f => ({ ...f, incidentType: e.target.value }))}>
                    {Object.entries(INCIDENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><label style={lbl}>Action Taken</label>
                  <select style={sel} value={discForm.actionTaken} onChange={e => setDiscForm(f => ({ ...f, actionTaken: e.target.value }))}>
                    {Object.entries(ACTION_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div><label style={lbl}>Action Details (optional)</label>
                  <input style={inp} value={discForm.actionDetails} onChange={e => setDiscForm(f => ({ ...f, actionDetails: e.target.value }))} placeholder="e.g. 3-day suspension" /></div>
              </div>
              <div style={{ marginBottom: '0.875rem' }}>
                <label style={lbl}>Description of Incident</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={discForm.description} onChange={e => setDiscForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe what happened..." />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                <input type="checkbox" id="parentNotified" checked={discForm.parentNotified} onChange={e => setDiscForm(f => ({ ...f, parentNotified: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                <label htmlFor="parentNotified" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Parent has been notified</label>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={addDisciplineRecord} disabled={saving}
                  style={{ padding: '0.5rem 1.25rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving...' : 'Save record'}
                </button>
                <button onClick={() => setShowDiscForm(false)}
                  style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
          {discipline.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: '#a0a09a', textAlign: 'center' as const, padding: '2rem' }}>No discipline records. Keep it that way! 🌟</p>
          ) : discipline.map((r: any) => (
            <div key={r.id} style={{ border: `1.5px solid ${r.resolved ? '#e5e5e0' : '#fecaca'}`, borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '0.75rem', background: r.resolved ? '#f9f9f8' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: r.resolved ? '#e8f5ee' : '#fef2f2', color: r.resolved ? '#0f4a32' : '#dc2626' }}>
                    {r.resolved ? '✓ Resolved' : '⚠ Open'}
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'capitalize' as const }}>{INCIDENT_TYPES[r.incident_type]}</span>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{new Date(r.incident_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              <p style={{ fontSize: '0.825rem', color: '#1a1a18', marginBottom: '0.375rem' }}>{r.description}</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '0.5rem' }}>
                Action: <strong>{ACTION_TYPES[r.action_taken]}</strong>
                {r.action_details && ` — ${r.action_details}`}
                {r.parent_notified && ' · Parent notified'}
              </p>
              <p style={{ fontSize: '0.68rem', color: '#a0a09a' }}>Recorded by {r.recorded_by_name}</p>
              {r.resolved && r.resolution_notes && (
                <p style={{ fontSize: '0.72rem', color: '#0f4a32', background: '#e8f5ee', padding: '0.375rem 0.625rem', borderRadius: '6px', marginTop: '0.375rem' }}>
                  Resolution: {r.resolution_notes}
                </p>
              )}
              {!r.resolved && (
                <button onClick={() => resolveRecord(r.id)}
                  style={{ marginTop: '0.5rem', padding: '0.3rem 0.75rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                  Mark as resolved
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}