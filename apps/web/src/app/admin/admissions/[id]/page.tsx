'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

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

const NEXT_ACTIONS: Record<string, { label: string; nextStatus: string; color: string }[]> = {
  pending:             [{ label: 'Start Reviewing', nextStatus: 'reviewing', color: '#1e40af' }, { label: 'Reject', nextStatus: 'rejected', color: '#dc2626' }],
  reviewing:           [{ label: 'Invite for Exam', nextStatus: 'exam_invited', color: '#7e22ce' }, { label: 'Schedule Interview', nextStatus: 'interview_scheduled', color: '#0891b2' }, { label: 'Make Offer', nextStatus: 'offered', color: '#1a6b4a' }, { label: 'Waitlist', nextStatus: 'waitlisted', color: '#92400e' }, { label: 'Reject', nextStatus: 'rejected', color: '#dc2626' }],
  exam_invited:        [{ label: 'Record Exam Score', nextStatus: 'exam_taken', color: '#0369a1' }],
  exam_taken:          [{ label: 'Schedule Interview', nextStatus: 'interview_scheduled', color: '#0891b2' }, { label: 'Make Offer', nextStatus: 'offered', color: '#1a6b4a' }, { label: 'Reject', nextStatus: 'rejected', color: '#dc2626' }],
  interview_scheduled: [{ label: 'Record Interview', nextStatus: 'interview_done', color: '#059669' }],
  interview_done:      [{ label: 'Make Offer', nextStatus: 'offered', color: '#1a6b4a' }, { label: 'Waitlist', nextStatus: 'waitlisted', color: '#92400e' }, { label: 'Reject', nextStatus: 'rejected', color: '#dc2626' }],
  offered:             [{ label: 'Mark Accepted', nextStatus: 'accepted', color: '#0f4a32' }, { label: 'Reject', nextStatus: 'rejected', color: '#dc2626' }],
  accepted:            [{ label: 'Enroll Student', nextStatus: 'enroll', color: '#1a6b4a' }],
  waitlisted:          [{ label: 'Make Offer', nextStatus: 'offered', color: '#1a6b4a' }, { label: 'Reject', nextStatus: 'rejected', color: '#dc2626' }],
  rejected:            [],
  enrolled:            [],
}

export default function ApplicationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const applicantId = params.id as string

  const [application, setApplication] = useState<any>(null)
  const [documents, setDocuments] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Action modal
  const [showActionModal, setShowActionModal] = useState(false)
  const [actionStatus, setActionStatus] = useState('')
  const [actionNotes, setActionNotes] = useState('')
  const [examScore, setExamScore] = useState('')
  const [examDate, setExamDate] = useState('')
  const [interviewDate, setInterviewDate] = useState('')
  const [interviewVenue, setInterviewVenue] = useState('')
  const [interviewOutcome, setInterviewOutcome] = useState('passed')

  // Enroll modal
  const [showEnrollModal, setShowEnrollModal] = useState(false)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [offerForm, setOfferForm] = useState({ acceptanceFeeAmount: 0, offerExpiresAt: '', customMessage: '' })
  const [sendingOffer, setSendingOffer] = useState(false)
  const [enrollForm, setEnrollForm] = useState({ admissionNo: '', classLevel: '', classArm: '', password: 'Student@1234' })
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => { loadApplication() }, [applicantId])

  async function loadApplication() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/admissions/applications/${applicantId}`, { headers: hdrs() })
      const data = await res.json()
      setApplication(data.application)
      setDocuments(data.documents ?? [])
      setLogs(data.logs ?? [])
      if (data.application) setEnrollForm(f => ({ ...f, classLevel: data.application.applied_class }))
    } catch { setError('Failed to load application') } finally { setLoading(false) }
  }

  async function handleAction() {
    setUpdating(true); setError('')
    try {
      const body: any = { status: actionStatus, notes: actionNotes || undefined }
      if (examScore) body.examScore = Number(examScore)
      if (examDate) body.examDate = examDate
      if (interviewDate) body.interviewDate = interviewDate
      if (interviewVenue) body.interviewVenue = interviewVenue
      if (actionStatus === 'interview_done') body.interviewOutcome = interviewOutcome

      const res = await fetch(`${API}/admissions/applications/${applicantId}/status`, {
        method: 'PATCH', headers: hdrs(), body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error('Failed to update')
      setShowActionModal(false)
      setActionNotes(''); setExamScore(''); setExamDate(''); setInterviewDate(''); setInterviewVenue('')
      setSuccess('Application updated!')
      setTimeout(() => setSuccess(''), 3000)
      loadApplication()
    } catch { setError('Failed to update application') } finally { setUpdating(false) }
  }

  async function handleEnroll() {
    if (!enrollForm.classLevel) { setError('Class level is required'); return }
    setEnrolling(true); setError('')
    try {
      const res = await fetch(`${API}/admissions/applications/${applicantId}/enroll`, {
        method: 'POST', headers: hdrs(), body: JSON.stringify(enrollForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to enroll')
      setShowEnrollModal(false)
      setSuccess(data.message)
      setTimeout(() => { setSuccess(''); router.push('/admin/admissions') }, 4000)
    } catch (e: any) { setError(e.message) } finally { setEnrolling(false) }
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui', color: '#6b6b65' }}>Loading...</div>
  if (!application) return <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui', color: '#dc2626' }}>Application not found.</div>

  const cfg = STATUS_CONFIG[application.status] ?? STATUS_CONFIG.pending
  const nextActions = NEXT_ACTIONS[application.status] ?? []

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <button onClick={() => router.back()} style={{ fontSize: '0.825rem', color: '#6b6b65', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '0.5rem', padding: 0 }}>← Back to Admissions</button>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18' }}>{application.first_name} {application.last_name}</h1>
          <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{application.application_number} · Applied for {application.applied_class}</p>
        </div>
        <span style={{ fontSize: '0.825rem', fontWeight: 700, padding: '0.375rem 1rem', borderRadius: 20, background: cfg.bg, color: cfg.color }}>
          {cfg.label}
        </span>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Action buttons */}
      {nextActions.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Next Actions</p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
            {['reviewing', 'exam_done', 'interview_done', 'exam_taken'].includes(application.status) && (
              <button onClick={() => setShowOfferModal(true)}
                style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                📧 Send Offer Letter
              </button>
            )}
            {nextActions.map(action => (
              <button key={action.nextStatus}
                onClick={() => {
                  if (action.nextStatus === 'enroll') { setShowEnrollModal(true); return }
                  setActionStatus(action.nextStatus); setShowActionModal(true)
                }}
                style={{ padding: '0.5rem 1.25rem', background: action.color, color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Applicant details */}
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Applicant Details</p>
          {[
            { label: 'Full Name', value: `${application.first_name} ${application.middle_name ?? ''} ${application.last_name}` },
            { label: 'Date of Birth', value: application.date_of_birth ? new Date(application.date_of_birth).toLocaleDateString('en-NG') : '—' },
            { label: 'Gender', value: application.gender ?? '—' },
            { label: 'State of Origin', value: application.state_of_origin ?? '—' },
            { label: 'Previous School', value: application.previous_school ?? '—' },
            { label: 'Blood Group', value: application.blood_group ?? '—' },
            { label: 'Genotype', value: application.genotype ?? '—' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f0f0ee' }}>
              <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{item.label}</span>
              <span style={{ fontSize: '0.825rem', color: '#1a1a18', textTransform: 'capitalize' as const }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Parent details */}
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem' }}>
          <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Parent / Guardian</p>
          {[
            { label: 'Name', value: application.parent_name },
            { label: 'Email', value: application.parent_email },
            { label: 'Phone', value: application.parent_phone },
            { label: 'Relationship', value: application.parent_relationship ?? 'Parent' },
            { label: 'Address', value: application.parent_address ?? '—' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #f0f0ee' }}>
              <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{item.label}</span>
              <span style={{ fontSize: '0.825rem', color: '#1a1a18' }}>{item.value}</span>
            </div>
          ))}
          {/* Exam score if available */}
          {application.exam_score != null && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#eff6ff', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Entrance Exam Score</p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e40af' }}>{application.exam_score}%</p>
              {application.exam_date && <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{new Date(application.exam_date).toLocaleDateString('en-NG')}</p>}
            </div>
          )}
          {/* Interview details if available */}
          {application.interview_date && (
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#ecfeff', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.72rem', color: '#0891b2', fontWeight: 600 }}>Interview</p>
              <p style={{ fontSize: '0.825rem', color: '#0891b2' }}>{new Date(application.interview_date).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>
              {application.interview_venue && <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>📍 {application.interview_venue}</p>}
              {application.interview_outcome && <p style={{ fontSize: '0.72rem', fontWeight: 600, color: application.interview_outcome === 'passed' ? '#1a6b4a' : '#dc2626', marginTop: '0.25rem', textTransform: 'capitalize' as const }}>Outcome: {application.interview_outcome}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Activity log */}
      {logs.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginTop: '1.5rem' }}>
          <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Activity Log</p>
          {logs.map((log: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: '0.875rem', marginBottom: '0.75rem' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a6b4a', marginTop: 6, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '0.825rem', color: '#1a1a18', fontWeight: 500, textTransform: 'capitalize' as const }}>{log.action.replace(/_/g, ' ')}</p>
                {log.notes && <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{log.notes}</p>}
                <p style={{ fontSize: '0.68rem', color: '#a0a09a' }}>
                  {log.performed_by_name ?? 'System'} · {new Date(log.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowActionModal(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem', textTransform: 'capitalize' as const }}>
              {actionStatus.replace(/_/g, ' ')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {actionStatus === 'exam_taken' && (
                <>
                  <div><label style={lbl}>Exam Score (%)</label><input style={inp} type="number" min={0} max={100} value={examScore} onChange={e => setExamScore(e.target.value)} placeholder="e.g. 75" /></div>
                  <div><label style={lbl}>Exam Date</label><input style={inp} type="date" value={examDate} onChange={e => setExamDate(e.target.value)} /></div>
                </>
              )}
              {actionStatus === 'interview_scheduled' && (
                <>
                  <div><label style={lbl}>Interview Date & Time</label><input style={inp} type="datetime-local" value={interviewDate} onChange={e => setInterviewDate(e.target.value)} /></div>
                  <div><label style={lbl}>Venue</label><input style={inp} value={interviewVenue} onChange={e => setInterviewVenue(e.target.value)} placeholder="e.g. Principal's Office" /></div>
                </>
              )}
              {actionStatus === 'interview_done' && (
                <div><label style={lbl}>Interview Outcome</label>
                  <select style={sel} value={interviewOutcome} onChange={e => setInterviewOutcome(e.target.value)}>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="pending">Pending decision</option>
                  </select>
                </div>
              )}
              <div><label style={lbl}>Notes (optional)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder="Add any notes about this action..." />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleAction} disabled={updating}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: updating ? 0.6 : 1 }}>
                  {updating ? 'Saving...' : 'Confirm'}
                </button>
                <button onClick={() => setShowActionModal(false)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Offer Modal */}
      {showOfferModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowOfferModal(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Send Offer Letter</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>An offer letter will be sent to {application.parent_email}.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={lbl}>Acceptance Fee (₦) — enter 0 if no fee required</label>
                <input style={inp} type="number" min={0} value={offerForm.acceptanceFeeAmount} onChange={e => setOfferForm(f => ({ ...f, acceptanceFeeAmount: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={lbl}>Offer Expires On *</label>
                <input style={inp} type="date" value={offerForm.offerExpiresAt} onChange={e => setOfferForm(f => ({ ...f, offerExpiresAt: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Custom Message (optional)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={offerForm.customMessage} onChange={e => setOfferForm(f => ({ ...f, customMessage: e.target.value }))} placeholder="Additional message to include in the offer letter..." />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button disabled={sendingOffer || !offerForm.offerExpiresAt}
                  onClick={async () => {
                    setSendingOffer(true); setError('')
                    try {
                      const res = await fetch(`${API}/admissions/applications/${applicantId}/offer`, {
                        method: 'POST', headers: hdrs(),
                        body: JSON.stringify({
                          acceptanceFeeAmount: offerForm.acceptanceFeeAmount,
                          offerExpiresAt: new Date(offerForm.offerExpiresAt).toISOString(),
                          customMessage: offerForm.customMessage || undefined,
                        })
                      })
                      const d = await res.json()
                      if (!res.ok) throw new Error(d.error ?? 'Failed to send offer')
                      setShowOfferModal(false)
                      setSuccess(d.message)
                      setTimeout(() => setSuccess(''), 5000)
                      loadApplication()
                    } catch (e: any) { setError(e.message) } finally { setSendingOffer(false) }
                  }}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: sendingOffer || !offerForm.offerExpiresAt ? 0.6 : 1 }}>
                  {sendingOffer ? 'Sending...' : '📧 Send Offer Letter'}
                </button>
                <button onClick={() => setShowOfferModal(false)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowEnrollModal(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 440 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Enroll Student</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>This will create a student account for {application.first_name} {application.last_name}.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Admission Number (optional)</label><input style={inp} value={enrollForm.admissionNo} onChange={e => setEnrollForm(f => ({ ...f, admissionNo: e.target.value }))} placeholder="e.g. SCH/2026/001" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><label style={lbl}>Class Level *</label>
                  <select style={sel} value={enrollForm.classLevel} onChange={e => setEnrollForm(f => ({ ...f, classLevel: e.target.value }))}>
                    {['JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(c => <option key={c}>{c}</option>)}
                  </select></div>
                <div><label style={lbl}>Class Arm</label><input style={inp} value={enrollForm.classArm} onChange={e => setEnrollForm(f => ({ ...f, classArm: e.target.value }))} placeholder="e.g. A, B, Science" /></div>
              </div>
              <div><label style={lbl}>Initial Password</label><input style={inp} value={enrollForm.password} onChange={e => setEnrollForm(f => ({ ...f, password: e.target.value }))} /></div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.75rem', fontSize: '0.78rem', color: '#92400e' }}>
                ⚠️ A student account will be created automatically. The login email will be generated from the student's name and school subdomain.
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleEnroll} disabled={enrolling}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: enrolling ? 0.6 : 1 }}>
                  {enrolling ? 'Enrolling...' : '🎓 Enroll Student'}
                </button>
                <button onClick={() => setShowEnrollModal(false)}
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
