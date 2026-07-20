'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL

const NIGERIAN_STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']

export default function PublicApplyPage() {
  const params = useParams()
  const subdomain = params.subdomain as string

  const [schoolInfo, setSchoolInfo] = useState<any>(null)
  const [settings, setSettings] = useState<any>(null)
  const [open, setOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [applicationNumber, setApplicationNumber] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState(1) // 1=applicant, 2=parent, 3=review

  const [form, setForm] = useState({
    firstName: '', lastName: '', middleName: '',
    dateOfBirth: '', gender: '', religion: '',
    stateOfOrigin: '', lga: '', homeAddress: '',
    bloodGroup: '', genotype: '',
    appliedClass: '', previousSchool: '', previousClass: '',
    parentName: '', parentEmail: '', parentPhone: '',
    parentRelationship: 'parent', parentAddress: '',
    guardian2Name: '', guardian2Phone: '', guardian2Relationship: '',
  })

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  useEffect(() => { loadSchool() }, [subdomain])

  async function loadSchool() {
    try {
      const res = await fetch(`${API}/admissions/public/${subdomain}`)
      const data = await res.json()
      setOpen(data.open)
      setSchoolInfo(data.school)
      setSettings(data.settings)
      if (data.settings?.applyForClasses?.length > 0) {
        setForm(f => ({ ...f, appliedClass: data.settings.applyForClasses[0] }))
      }
    } catch { setError('Failed to load application form') } finally { setLoading(false) }
  }

  async function handleSubmit() {
    if (!form.firstName || !form.lastName || !form.appliedClass || !form.parentName || !form.parentEmail || !form.parentPhone) {
      setError('Please fill all required fields marked with *'); return
    }
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${API}/admissions/apply/${subdomain}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          middleName: form.middleName || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          religion: form.religion || undefined,
          stateOfOrigin: form.stateOfOrigin || undefined,
          lga: form.lga || undefined,
          homeAddress: form.homeAddress || undefined,
          bloodGroup: form.bloodGroup || undefined,
          genotype: form.genotype || undefined,
          appliedClass: form.appliedClass,
          previousSchool: form.previousSchool || undefined,
          previousClass: form.previousClass || undefined,
          parentName: form.parentName, parentEmail: form.parentEmail,
          parentPhone: form.parentPhone, parentRelationship: form.parentRelationship,
          parentAddress: form.parentAddress || undefined,
          guardian2Name: form.guardian2Name || undefined,
          guardian2Phone: form.guardian2Phone || undefined,
          guardian2Relationship: form.guardian2Relationship || undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit application')
      setApplicationNumber(data.applicationNumber)
      setSubmitted(true)
    } catch (e: any) { setError(e.message) } finally { setSubmitting(false) }
  }

  const inp = { padding: '0.75rem 1rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, transition: 'border-color 0.15s' }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', display: 'block', marginBottom: '0.5rem' }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <p style={{ color: '#6b6b65' }}>Loading application form...</p>
    </div>
  )

  if (!open) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '3rem', maxWidth: 480, textAlign: 'center' as const }}>
        {schoolInfo?.logo_url && <img src={schoolInfo.logo_url} alt="School logo" style={{ width: 80, height: 80, objectFit: 'contain' as const, marginBottom: '1rem' }} />}
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>{schoolInfo?.name}</h1>
        <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</p>
        <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Applications are currently closed</p>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Please check back later or contact the school for more information.</p>
      </div>
    </div>
  )

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '3rem', maxWidth: 520, textAlign: 'center' as const, border: '2px solid #1a6b4a' }}>
        <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</p>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a', marginBottom: '0.5rem' }}>Application Submitted!</h1>
        <p style={{ fontSize: '1rem', color: '#1a1a18', marginBottom: '0.5rem' }}>Your application number is:</p>
        <p style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1a6b4a', marginBottom: '1.5rem', letterSpacing: '0.05em' }}>{applicationNumber}</p>
        <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem', textAlign: 'left' as const, marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#3a3a36', lineHeight: 1.7 }}>
            ✅ We have received your application.<br />
            📧 A confirmation will be sent to <strong>{form.parentEmail}</strong>.<br />
            📱 We will contact you at <strong>{form.parentPhone}</strong> with next steps.<br />
            📋 Please keep your application number safe for reference.
          </p>
        </div>
        <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.5rem' }}>Thank you for applying to {schoolInfo?.name}.</p>
        <button onClick={() => window.close()}
          style={{ padding: '0.625rem 1.5rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer', marginRight: '0.75rem' }}>
          Close page
        </button>
        <button onClick={() => { setSubmitted(false); setForm({ firstName: '', lastName: '', middleName: '', dateOfBirth: '', gender: '', religion: '', stateOfOrigin: '', lga: '', homeAddress: '', bloodGroup: '', genotype: '', appliedClass: '', previousSchool: '', previousClass: '', parentName: '', parentEmail: '', parentPhone: '', parentRelationship: 'parent', parentAddress: '', guardian2Name: '', guardian2Phone: '', guardian2Relationship: '' }); setStep(1) }}
          style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
          Submit another application
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* School header */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' as const, border: '1px solid #e5e5e0' }}>
          {schoolInfo?.logo_url && <img src={schoolInfo.logo_url} alt="School logo" style={{ width: 72, height: 72, objectFit: 'contain' as const, marginBottom: '0.75rem' }} />}
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.25rem' }}>{schoolInfo?.name}</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: settings?.welcomeMessage ? '0.75rem' : 0 }}>Online Admissions Application</p>
          {settings?.welcomeMessage && <p style={{ fontSize: '0.825rem', color: '#3a3a36', lineHeight: 1.6 }}>{settings.welcomeMessage}</p>}
        </div>

        {/* Progress steps */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', background: 'white', borderRadius: '12px', padding: '1rem 1.5rem', border: '1px solid #e5e5e0' }}>
          {['Applicant Info', 'Parent / Guardian', 'Review & Submit'].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: step > i + 1 ? '#1a6b4a' : step === i + 1 ? '#1a6b4a' : '#e5e5e0', color: step >= i + 1 ? 'white' : '#a0a09a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0 }}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: step === i + 1 ? 600 : 400, color: step === i + 1 ? '#1a1a18' : '#a0a09a', whiteSpace: 'nowrap' as const }}>{s}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 2, background: step > i + 1 ? '#1a6b4a' : '#e5e5e0', margin: '0 0.5rem' }} />}
            </div>
          ))}
        </div>

        {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}

        <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', border: '1px solid #e5e5e0' }}>

          {/* Step 1 — Applicant Info */}
          {step === 1 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Applicant Information</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div><label style={lbl}>First Name *</label><input style={inp} value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="e.g. Amara" /></div>
                <div><label style={lbl}>Last Name *</label><input style={inp} value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="e.g. Obi" /></div>
                <div><label style={lbl}>Middle Name</label><input style={inp} value={form.middleName} onChange={e => set('middleName', e.target.value)} /></div>
                <div><label style={lbl}>Date of Birth</label><input style={inp} type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></div>
                <div><label style={lbl}>Gender</label>
                  <select style={sel} value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">Select...</option><option value="male">Male</option><option value="female">Female</option>
                  </select></div>
                <div><label style={lbl}>Religion</label>
                  <select style={sel} value={form.religion} onChange={e => set('religion', e.target.value)}>
                    <option value="">Select...</option><option>Christianity</option><option>Islam</option><option>Traditional</option><option>Other</option>
                  </select></div>
                <div><label style={lbl}>State of Origin</label>
                  <select style={sel} value={form.stateOfOrigin} onChange={e => set('stateOfOrigin', e.target.value)}>
                    <option value="">Select...</option>
                    {NIGERIAN_STATES.map(s => <option key={s}>{s}</option>)}
                  </select></div>
                <div><label style={lbl}>LGA</label><input style={inp} value={form.lga} onChange={e => set('lga', e.target.value)} placeholder="Local Government Area" /></div>
                <div><label style={lbl}>Blood Group</label>
                  <select style={sel} value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                    <option value="">Select...</option>
                    {['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'].map(b => <option key={b}>{b}</option>)}
                  </select></div>
                <div><label style={lbl}>Genotype</label>
                  <select style={sel} value={form.genotype} onChange={e => set('genotype', e.target.value)}>
                    <option value="">Select...</option>
                    {['AA','AS','SS','AC','SC','Unknown'].map(g => <option key={g}>{g}</option>)}
                  </select></div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={lbl}>Home Address</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={form.homeAddress} onChange={e => set('homeAddress', e.target.value)} placeholder="Full home address" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div><label style={lbl}>Applying for Class *</label>
                  <select style={sel} value={form.appliedClass} onChange={e => set('appliedClass', e.target.value)}>
                    <option value="">Select...</option>
                    {(settings?.applyForClasses?.length > 0 ? settings.applyForClasses : ['JSS1','JSS2','JSS3','SS1','SS2','SS3']).map((c: string) => <option key={c}>{c}</option>)}
                  </select></div>
                <div><label style={lbl}>Previous School</label><input style={inp} value={form.previousSchool} onChange={e => set('previousSchool', e.target.value)} /></div>
                <div><label style={lbl}>Last Class Attended</label><input style={inp} value={form.previousClass} onChange={e => set('previousClass', e.target.value)} placeholder="e.g. JSS2" /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { if (!form.firstName || !form.lastName || !form.appliedClass) { setError('First name, last name and class are required'); return }; setError(''); setStep(2) }}
                  style={{ padding: '0.75rem 2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                  Next: Parent Info →
                </button>
              </div>
            </>
          )}

          {/* Step 2 — Parent Info */}
          {step === 2 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Parent / Guardian Information</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div><label style={lbl}>Full Name *</label><input style={inp} value={form.parentName} onChange={e => set('parentName', e.target.value)} /></div>
                <div><label style={lbl}>Phone Number *</label><input style={inp} value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} placeholder="08012345678" /></div>
                <div><label style={lbl}>Email Address *</label><input style={inp} type="email" value={form.parentEmail} onChange={e => set('parentEmail', e.target.value)} /></div>
                <div><label style={lbl}>Relationship to Applicant</label>
                  <select style={sel} value={form.parentRelationship} onChange={e => set('parentRelationship', e.target.value)}>
                    <option value="parent">Parent</option><option value="guardian">Guardian</option><option value="uncle">Uncle</option><option value="aunt">Aunt</option><option value="grandparent">Grandparent</option>
                  </select></div>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={lbl}>Address</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={form.parentAddress} onChange={e => set('parentAddress', e.target.value)} />
              </div>
              <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#6b6b65', marginBottom: '0.875rem' }}>Second Guardian (Optional)</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div><label style={lbl}>Name</label><input style={inp} value={form.guardian2Name} onChange={e => set('guardian2Name', e.target.value)} /></div>
                <div><label style={lbl}>Phone</label><input style={inp} value={form.guardian2Phone} onChange={e => set('guardian2Phone', e.target.value)} /></div>
                <div><label style={lbl}>Relationship</label><input style={inp} value={form.guardian2Relationship} onChange={e => set('guardian2Relationship', e.target.value)} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => { setError(''); setStep(1) }}
                  style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  ← Back
                </button>
                <button onClick={() => { if (!form.parentName || !form.parentEmail || !form.parentPhone) { setError('Parent name, email and phone are required'); return }; setError(''); setStep(3) }}
                  style={{ padding: '0.75rem 2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                  Next: Review →
                </button>
              </div>
            </>
          )}

          {/* Step 3 — Review */}
          {step === 3 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Review & Submit</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.875rem' }}>Applicant</p>
                  {[
                    { label: 'Name', value: `${form.firstName} ${form.middleName} ${form.lastName}` },
                    { label: 'Date of Birth', value: form.dateOfBirth || '—' },
                    { label: 'Gender', value: form.gender || '—' },
                    { label: 'Applying for', value: form.appliedClass },
                    { label: 'Previous School', value: form.previousSchool || '—' },
                    { label: 'State of Origin', value: form.stateOfOrigin || '—' },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid #e5e5e0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{item.label}</span>
                      <span style={{ fontSize: '0.78rem', color: '#1a1a18', fontWeight: 500 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.875rem' }}>Parent / Guardian</p>
                  {[
                    { label: 'Name', value: form.parentName },
                    { label: 'Email', value: form.parentEmail },
                    { label: 'Phone', value: form.parentPhone },
                    { label: 'Relationship', value: form.parentRelationship },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid #e5e5e0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{item.label}</span>
                      <span style={{ fontSize: '0.78rem', color: '#1a1a18', fontWeight: 500 }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.825rem', color: '#92400e' }}>
                ⚠️ Please review your information carefully before submitting. Once submitted, you cannot edit your application.
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => { setError(''); setStep(2) }}
                  style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  ← Back
                </button>
                <button onClick={handleSubmit} disabled={submitting}
                  style={{ padding: '0.75rem 2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'Submitting...' : '🎓 Submit Application'}
                </button>
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center' as const, fontSize: '0.72rem', color: '#a0a09a', marginTop: '1.5rem' }}>
          Powered by Examify · Probitechai
        </p>
      </div>
    </div>
  )
}