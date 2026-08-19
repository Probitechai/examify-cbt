'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('SS2')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showIssueForm, setShowIssueForm] = useState(false)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [viewingCert, setViewingCert] = useState<any>(null)
  const [issuing, setIssuing] = useState(false)

  const [issueForm, setIssueForm] = useState({
    studentId: '', subjectId: '', certificateType: 'lesson_completion',
    title: 'Certificate of Lesson Completion', description: ''
  })
  const [bulkForm, setBulkForm] = useState({
    subjectId: '', certificateType: 'lesson_completion',
    title: 'Certificate of Lesson Completion',
    description: '', minCompletionPct: '80'
  })

  useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { loadInitial() }, [])

  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])

  useEffect(() => { loadSubjects() }, [selectedClass])

  async function loadInitial() {
    const res = await apiFetch(`${API}/sessions`)
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: any) => s.is_active)
    if (active) { setSelectedSession(active.id); loadTerms(active.id) }
  }

  async function loadTerms(sessionId: string) {
    const res = await apiFetch(`${API}/sessions/${sessionId}/terms`)
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadSubjects() {
    const res = await apiFetch(`${API}/curriculum/subjects?classLevel=${selectedClass}`)
    const data = await res.json()
    setSubjects(data.subjects ?? [])
  }

  async function loadStudents() {
    const res = await apiFetch(`${API}/gradebook/class?termId=${selectedTerm}&classLevel=${selectedClass}`)
    const data = await res.json()
    setStudents(data.students ?? [])
  }

  async function loadCertificates() {
    if (!selectedTerm) { setError('Please select a term'); return }
    setLoading(true); setError('')
    try {
      const res = await apiFetch(`${API}/certificates?termId=${selectedTerm}&classLevel=${selectedClass}`)
      const data = await res.json()
      setCertificates(data.certificates ?? [])
    } catch { setError('Failed to load certificates') } finally { setLoading(false) }
  }

  async function issueCertificate() {
    if (!issueForm.studentId || !issueForm.title) { setError('Student and title required'); return }
    setIssuing(true); setError('')
    try {
      const body: any = {
        studentId: issueForm.studentId,
        termId: selectedTerm,
        certificateType: issueForm.certificateType,
        title: issueForm.title,
        description: issueForm.description || undefined,
      }
      if (issueForm.subjectId) body.subjectId = issueForm.subjectId
      const res = await fetch(`${API}/certificates`, { method: 'POST', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to issue')
      if (data.alreadyIssued) { setSuccess('Certificate already issued to this student.') }
      else { setSuccess(`Certificate issued! Number: ${data.certificate.certificate_number}`) }
      setShowIssueForm(false)
      setTimeout(() => setSuccess(''), 5000)
      loadCertificates()
    } catch (e: any) { setError(e.message) } finally { setIssuing(false) }
  }

  async function bulkIssue() {
    if (!bulkForm.title) { setError('Title required'); return }
    setIssuing(true); setError('')
    try {
      const body: any = {
        termId: selectedTerm,
        classLevel: selectedClass,
        certificateType: bulkForm.certificateType,
        title: bulkForm.title,
        description: bulkForm.description || undefined,
        minCompletionPct: Number(bulkForm.minCompletionPct),
      }
      if (bulkForm.subjectId) body.subjectId = bulkForm.subjectId
      const res = await fetch(`${API}/certificates/bulk-issue`, { method: 'POST', body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to bulk issue')
      setSuccess(`Issued ${data.issued} certificates to eligible students!`)
      setShowBulkForm(false)
      setTimeout(() => setSuccess(''), 5000)
      loadCertificates()
    } catch (e: any) { setError(e.message) } finally { setIssuing(false) }
  }

  async function revoke(id: string) {
    if (!window.confirm('Revoke this certificate?')) return
    await fetch(`${API}/certificates/${id}/revoke`, { method: 'PATCH' })
    setCertificates(prev => prev.filter(c => c.id !== id))
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Completion Certificates</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Issue and manage certificates for lesson completion and term excellence.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => { setShowBulkForm(true); loadSubjects() }}
            style={{ padding: '0.5rem 1rem', background: '#eff6ff', color: '#1e40af', border: '1.5px solid #bfdbfe', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
            📋 Bulk Issue
          </button>
          <button onClick={() => { setShowIssueForm(true); loadStudents(); loadSubjects() }}
            style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
            + Issue Certificate
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
          <div><label style={lbl}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select term...</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select></div>
          <div><label style={lbl}>Class</label>
            <select style={sel} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={loadCertificates} disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, width: '100%' }}>
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>
      </div>

      {/* Certificates list */}
      {certificates.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' as const }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏆</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No certificates yet</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Issue certificates to students who have completed lessons or excelled in a term.</p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Student</span><span>Certificate</span><span>Subject</span><span>Issued</span><span></span>
          </div>
          {certificates.map(cert => (
            <div key={cert.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{cert.student_name}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{cert.class_level} {cert.class_arm} · {cert.certificate_number}</p>
              </div>
              <div>
                <p style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{cert.title}</p>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: cert.certificate_type === 'term_excellence' ? '#fffbeb' : '#e8f5ee', color: cert.certificate_type === 'term_excellence' ? '#92400e' : '#0f4a32', textTransform: 'capitalize' as const }}>
                  {cert.certificate_type.replace('_', ' ')}
                </span>
              </div>
              <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{cert.subject_name ?? 'General'}</span>
              <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{new Date(cert.issued_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button onClick={() => setViewingCert(cert)}
                  style={{ padding: '0.3rem 0.625rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.68rem', color: '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>View</button>
                <button onClick={() => revoke(cert.id)}
                  style={{ padding: '0.3rem 0.5rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.68rem', color: '#dc2626', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Issue Certificate Modal */}
      {showIssueForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowIssueForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 520 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Issue Certificate</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Student *</label>
                <select style={sel} value={issueForm.studentId} onChange={e => setIssueForm(f => ({ ...f, studentId: e.target.value }))}>
                  <option value="">Select student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name} — {s.class_level} {s.class_arm}</option>)}
                </select></div>
              <div><label style={lbl}>Certificate Type</label>
                <select style={sel} value={issueForm.certificateType} onChange={e => {
                  const type = e.target.value
                  const title = type === 'lesson_completion' ? 'Certificate of Lesson Completion' : type === 'term_excellence' ? 'Certificate of Excellence' : 'Certificate of Achievement'
                  setIssueForm(f => ({ ...f, certificateType: type, title }))
                }}>
                  <option value="lesson_completion">Lesson Completion</option>
                  <option value="term_excellence">Term Excellence</option>
                  <option value="custom">Custom</option>
                </select></div>
              <div><label style={lbl}>Subject (optional)</label>
                <select style={sel} value={issueForm.subjectId} onChange={e => setIssueForm(f => ({ ...f, subjectId: e.target.value }))}>
                  <option value="">General (no specific subject)</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label style={lbl}>Certificate Title *</label>
                <input style={inp} value={issueForm.title} onChange={e => setIssueForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><label style={lbl}>Description (appears on certificate)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={issueForm.description} onChange={e => setIssueForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. For successfully completing all Mathematics lessons in Third Term" /></div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={issueCertificate} disabled={issuing}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: issuing ? 0.6 : 1 }}>
                  {issuing ? 'Issuing...' : '🏆 Issue Certificate'}
                </button>
                <button onClick={() => setShowIssueForm(false)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Issue Modal */}
      {showBulkForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowBulkForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 520 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Bulk Issue Certificates</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>Auto-issue to all {selectedClass} students who meet the completion threshold.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Certificate Type</label>
                <select style={sel} value={bulkForm.certificateType} onChange={e => {
                  const type = e.target.value
                  const title = type === 'lesson_completion' ? 'Certificate of Lesson Completion' : type === 'term_excellence' ? 'Certificate of Excellence' : 'Certificate of Achievement'
                  setBulkForm(f => ({ ...f, certificateType: type, title }))
                }}>
                  <option value="lesson_completion">Lesson Completion</option>
                  <option value="term_excellence">Term Excellence</option>
                  <option value="custom">Custom</option>
                </select></div>
              <div><label style={lbl}>Subject (optional)</label>
                <select style={sel} value={bulkForm.subjectId} onChange={e => setBulkForm(f => ({ ...f, subjectId: e.target.value }))}>
                  <option value="">All subjects</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div><label style={lbl}>Minimum Completion % to qualify</label>
                <input style={inp} type="number" min={0} max={100} value={bulkForm.minCompletionPct} onChange={e => setBulkForm(f => ({ ...f, minCompletionPct: e.target.value }))} /></div>
              <div><label style={lbl}>Certificate Title *</label>
                <input style={inp} value={bulkForm.title} onChange={e => setBulkForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><label style={lbl}>Description</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={bulkForm.description} onChange={e => setBulkForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. For successfully completing all lessons in Third Term 2025/2026" /></div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '0.875rem', fontSize: '0.825rem', color: '#92400e' }}>
                ⚡ This will auto-issue to all {selectedClass} students with average lesson progress ≥ {bulkForm.minCompletionPct}%
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={bulkIssue} disabled={issuing}
                  style={{ flex: 1, padding: '0.75rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: issuing ? 0.6 : 1 }}>
                  {issuing ? 'Issuing...' : '📋 Bulk Issue'}
                </button>
                <button onClick={() => setShowBulkForm(false)}
                  style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Viewer Modal */}
      {viewingCert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setViewingCert(null)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1rem', width: '100%', maxWidth: 680, maxHeight: '95vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Certificate Preview</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => window.print()}
                  style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  🖨️ Print
                </button>
                <button onClick={() => setViewingCert(null)}
                  style={{ padding: '0.375rem 0.75rem', background: '#f7f7f5', border: '1px solid #e5e5e0', borderRadius: '6px', fontSize: '0.78rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
            <CertificateRenderer cert={viewingCert} />
          </div>
        </div>
      )}
    </div>
  )
}

function CertificateRenderer({ cert }: { cert: any }) {
  const typeLabel = cert.certificate_type === 'lesson_completion' ? 'Certificate of Completion'
    : cert.certificate_type === 'term_excellence' ? 'Certificate of Excellence'
    : 'Certificate of Achievement'

  return (
    <div style={{ background: 'white', fontFamily: 'Georgia, serif', padding: '2rem', border: '3px solid #1a6b4a', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
      {/* Decorative corners */}
      <div style={{ position: 'absolute', top: 8, left: 8, width: 40, height: 40, borderTop: '3px solid #d4af37', borderLeft: '3px solid #d4af37', borderRadius: '4px 0 0 0' }} />
      <div style={{ position: 'absolute', top: 8, right: 8, width: 40, height: 40, borderTop: '3px solid #d4af37', borderRight: '3px solid #d4af37', borderRadius: '0 4px 0 0' }} />
      <div style={{ position: 'absolute', bottom: 8, left: 8, width: 40, height: 40, borderBottom: '3px solid #d4af37', borderLeft: '3px solid #d4af37', borderRadius: '0 0 0 4px' }} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 40, height: 40, borderBottom: '3px solid #d4af37', borderRight: '3px solid #d4af37', borderRadius: '0 0 4px 0' }} />

      <div style={{ textAlign: 'center' as const, padding: '1.5rem 2rem' }}>
        {/* School header */}
        <div style={{ marginBottom: '1.5rem' }}>
          {cert.school_logo && (
            <img src={cert.school_logo} alt="School logo" style={{ width: 72, height: 72, objectFit: 'contain' as const, marginBottom: '0.75rem' }} />
          )}
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a', margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>{cert.school_name}</h1>
        </div>

        {/* Gold divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, #d4af37)' }} />
          <span style={{ fontSize: '1.25rem' }}>🏆</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, #d4af37)' }} />
        </div>

        {/* Certificate type */}
        <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#6b6b65', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: '0.5rem' }}>
          This is to certify that
        </p>

        {/* Student name */}
        <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#1a1a18', margin: '0.5rem 0', fontStyle: 'italic', letterSpacing: '-0.02em' }}>
          {cert.student_name}
        </h2>

        <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1rem' }}>
          {cert.class_level} {cert.class_arm} · Adm No: {cert.admission_no ?? 'N/A'}
        </p>

        {/* Gold divider */}
        <div style={{ width: 120, height: 2, background: '#d4af37', margin: '0 auto 1rem' }} />

        {/* Certificate title */}
        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a6b4a', margin: '0 0 0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
          {cert.title}
        </h3>

        {/* Description */}
        {cert.description ? (
          <p style={{ fontSize: '0.925rem', color: '#3a3a36', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 1.5rem' }}>
            {cert.description}
          </p>
        ) : (
          <p style={{ fontSize: '0.925rem', color: '#3a3a36', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 1.5rem' }}>
            For successfully completing the requirements of{cert.subject_name ? ` ${cert.subject_name}` : ''} in{' '}
            <strong>{cert.term_name}</strong> — <strong>{cert.session_name}</strong>
          </p>
        )}

        {/* Gold divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, #d4af37)' }} />
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, #d4af37)' }} />
        </div>

        {/* Signatures and details */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ height: 40, borderBottom: '1.5px solid #1a1a18', marginBottom: '0.375rem' }} />
            <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontFamily: 'system-ui' }}>Class Teacher</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ height: 40, borderBottom: '1.5px solid #1a1a18', marginBottom: '0.375rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {cert.school_logo && <img src={cert.school_logo} alt="Stamp" style={{ width: 40, height: 40, opacity: 0.3, objectFit: 'contain' as const }} />}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontFamily: 'system-ui' }}>School Stamp</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ height: 40, borderBottom: '1.5px solid #1a1a18', marginBottom: '0.375rem' }} />
            <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontFamily: 'system-ui' }}>Principal</p>
          </div>
        </div>

        {/* Certificate details */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#a0a09a', fontFamily: 'system-ui', borderTop: '1px solid #e5e5e0', paddingTop: '0.875rem' }}>
          <span>Certificate No: <strong>{cert.certificate_number}</strong></span>
          <span>Issued: {new Date(cert.issued_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span>Examify · Probitechai</span>
        </div>
      </div>
    </div>
  )
}