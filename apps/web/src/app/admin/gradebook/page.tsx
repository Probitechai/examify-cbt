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

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']

function getGrade(pct: number): { grade: string; color: string } {
  if (pct >= 70) return { grade: 'A', color: '#1a6b4a' }
  if (pct >= 60) return { grade: 'B', color: '#1e40af' }
  if (pct >= 50) return { grade: 'C', color: '#d97706' }
  if (pct >= 45) return { grade: 'D', color: '#dc2626' }
  return { grade: 'F', color: '#7f1d1d' }
}

export default function GradebookPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedClass, setSelectedClass] = useState('SS2')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [students, setStudents] = useState<any[]>([])
  const [entries, setEntries] = useState<any[]>([])
  const [assignmentScores, setAssignmentScores] = useState<any[]>([])
  const [cbtScores, setCbtScores] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'assignments' | 'cbt' | 'manual'>('overview')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Manual entry form
  const [showEntryForm, setShowEntryForm] = useState(false)
  const [entryForm, setEntryForm] = useState({ studentId: '', title: '', entryType: 'class_test', score: '', maxScore: '100' })
  const [savingEntry, setSavingEntry] = useState(false)

  // Bulk entry
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [bulkTitle, setBulkTitle] = useState('')
  const [bulkMaxScore, setBulkMaxScore] = useState('100')
  const [bulkScores, setBulkScores] = useState<Record<string, string>>({})
  const [savingBulk, setSavingBulk] = useState(false)

  useEffect(() => { loadInitial() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
  useEffect(() => { loadSubjects() }, [selectedClass])

  async function loadInitial() {
    const res = await fetch(`${API}/sessions`, { headers: hdrs() })
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: any) => s.is_active)
    if (active) { setSelectedSession(active.id); loadTerms(active.id) }
  }

  async function loadTerms(sessionId: string) {
    const res = await fetch(`${API}/sessions/${sessionId}/terms`, { headers: hdrs() })
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: any) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadSubjects() {
    const res = await fetch(`${API}/curriculum/subjects?classLevel=${selectedClass}`, { headers: hdrs() })
    const data = await res.json()
    setSubjects(data.subjects ?? [])
  }

  async function loadGradebook() {
    if (!selectedTerm) { setError('Please select a term'); return }
    setLoading(true); setError('')
    try {
      let url = `${API}/gradebook/class?termId=${selectedTerm}&classLevel=${selectedClass}`
      if (selectedSubject) url += `&subjectId=${selectedSubject}`
      const res = await fetch(url, { headers: hdrs() })
      const data = await res.json()
      setStudents(data.students ?? [])
      setEntries(data.entries ?? [])
      setAssignmentScores(data.assignmentScores ?? [])
      setCbtScores(data.cbtScores ?? [])
      // Init bulk scores
      const scores: Record<string, string> = {}
      for (const s of data.students ?? []) { scores[s.id] = '' }
      setBulkScores(scores)
    } catch { setError('Failed to load gradebook') } finally { setLoading(false) }
  }

  async function saveEntry() {
    if (!entryForm.studentId || !entryForm.title || !entryForm.score) { setError('All fields required'); return }
    setSavingEntry(true)
    try {
      const body: any = {
        studentId: entryForm.studentId,
        termId: selectedTerm,
        entryType: entryForm.entryType,
        title: entryForm.title,
        score: Number(entryForm.score),
        maxScore: Number(entryForm.maxScore),
      }
      if (selectedSubject) body.subjectId = selectedSubject
      await fetch(`${API}/gradebook/entries`, { method: 'POST', headers: hdrs(), body: JSON.stringify(body) })
      setShowEntryForm(false)
      setEntryForm({ studentId: '', title: '', entryType: 'class_test', score: '', maxScore: '100' })
      setSuccess('Entry saved!'); setTimeout(() => setSuccess(''), 3000)
      loadGradebook()
    } catch { setError('Failed to save entry') } finally { setSavingEntry(false) }
  }

  async function saveBulkScores() {
    if (!bulkTitle) { setError('Title required'); return }
    const scores = Object.entries(bulkScores)
      .filter(([, v]) => v !== '')
      .map(([studentId, score]) => ({ studentId, score: Number(score) }))
    if (scores.length === 0) { setError('Enter at least one score'); return }
    setSavingBulk(true)
    try {
      const body: any = {
        termId: selectedTerm,
        entryType: 'class_test',
        title: bulkTitle,
        maxScore: Number(bulkMaxScore),
        scores,
      }
      if (selectedSubject) body.subjectId = selectedSubject
      await fetch(`${API}/gradebook/entries/bulk`, { method: 'POST', headers: hdrs(), body: JSON.stringify(body) })
      setShowBulkForm(false)
      setBulkTitle(''); setBulkMaxScore('100')
      const reset: Record<string, string> = {}
      for (const s of students) { reset[s.id] = '' }
      setBulkScores(reset)
      setSuccess('Scores saved!'); setTimeout(() => setSuccess(''), 3000)
      loadGradebook()
    } catch { setError('Failed to save scores') } finally { setSavingBulk(false) }
  }

  async function deleteEntry(id: string) {
    await fetch(`${API}/gradebook/entries/${id}`, { method: 'DELETE', headers: hdrs() })
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  // Build student summary
  function getStudentSummary(studentId: string) {
    const studentEntries = entries.filter(e => e.student_id === studentId)
    const studentAssignments = assignmentScores.filter(a => a.student_id === studentId)
    const studentCbt = cbtScores.filter(c => c.student_id === studentId)
    const allScores = [
      ...studentEntries.map(e => (Number(e.score) / Number(e.max_score)) * 100),
      ...studentAssignments.filter(a => a.score != null).map(a => (Number(a.score) / Number(a.max_score)) * 100),
      ...studentCbt.map(c => (Number(c.score) / Number(c.total_marks)) * 100),
    ]
    const avg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null
    return { avg, count: allScores.length }
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Gradebook</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Unified view of CBT scores, assignment scores and class test results.</p>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Filters */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
          <div><label style={lbl}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select term...</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select></div>
          <div><label style={lbl}>Class</label>
            <select style={sel} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div><label style={lbl}>Subject (optional)</label>
            <select style={sel} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={loadGradebook} disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setShowBulkForm(true)} disabled={students.length === 0}
              style={{ padding: '0.625rem 1rem', background: '#eff6ff', color: '#1e40af', border: '1.5px solid #bfdbfe', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
              + Bulk Entry
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
        {([
          { key: 'overview', label: '📊 Overview' },
          { key: 'assignments', label: '📝 Assignments' },
          { key: 'cbt', label: '💻 CBT Exams' },
          { key: 'manual', label: '✏️ Manual Entries' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {students.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' as const }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📚</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Select filters and click Load to view the gradebook.</p>
        </div>
      ) : (
        <>
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                <span>Student</span><span>Class</span><span style={{ textAlign: 'center' as const }}>Scores</span><span style={{ textAlign: 'center' as const }}>Average</span><span style={{ textAlign: 'center' as const }}>Grade</span>
              </div>
              {students.map(s => {
                const { avg, count } = getStudentSummary(s.id)
                const gradeInfo = avg != null ? getGrade(avg) : null
                return (
                  <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px 80px 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', cursor: 'pointer' }}
                    onClick={() => router.push(`/admin/students/${s.id}`)}>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{s.full_name}</p>
                      <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{s.admission_no ?? ''}</p>
                    </div>
                    <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{selectedClass} {s.class_arm ?? ''}</span>
                    <span style={{ textAlign: 'center' as const, fontSize: '0.825rem', color: '#6b6b65' }}>{count}</span>
                    <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', fontWeight: 600, color: gradeInfo?.color ?? '#a0a09a' }}>
                      {avg != null ? `${avg.toFixed(1)}%` : '—'}
                    </span>
                    <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', fontWeight: 700, color: gradeInfo?.color ?? '#a0a09a' }}>
                      {gradeInfo?.grade ?? '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* ASSIGNMENTS TAB */}
          {activeTab === 'assignments' && (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              {assignmentScores.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center' as const }}>
                  <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No graded assignment submissions yet for this class and term.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                    <span>Student</span><span>Assignment</span><span>Subject</span><span style={{ textAlign: 'center' as const }}>Score</span><span style={{ textAlign: 'center' as const }}>%</span>
                  </div>
                  {assignmentScores.map((a, i) => {
                    const student = students.find(s => s.id === a.student_id)
                    const pct = Number(a.score) / Number(a.max_score) * 100
                    const gradeInfo = getGrade(pct)
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                        <p style={{ fontSize: '0.875rem', color: '#1a1a18' }}>{student?.full_name ?? 'Unknown'}</p>
                        <p style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{a.title}</p>
                        <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{a.subject_name ?? '—'}</p>
                        <span style={{ textAlign: 'center' as const, fontSize: '0.825rem', color: '#1a1a18' }}>{a.score}/{a.max_score}</span>
                        <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', fontWeight: 700, color: gradeInfo.color }}>{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* CBT TAB */}
          {activeTab === 'cbt' && (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              {cbtScores.filter(c => students.some(s => s.id === c.student_id)).length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center' as const }}>
                  <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No CBT exam scores for this class yet.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                    <span>Student</span><span>Exam</span><span>Subject</span><span style={{ textAlign: 'center' as const }}>Score</span><span style={{ textAlign: 'center' as const }}>%</span>
                  </div>
                  {cbtScores.filter(c => students.some(s => s.id === c.student_id)).map((c, i) => {
                    const student = students.find(s => s.id === c.student_id)
                    const pct = Number(c.score) / Number(c.total_marks) * 100
                    const gradeInfo = getGrade(pct)
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                        <p style={{ fontSize: '0.875rem', color: '#1a1a18' }}>{student?.full_name ?? 'Unknown'}</p>
                        <p style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{c.title}</p>
                        <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{c.subject ?? '—'}</p>
                        <span style={{ textAlign: 'center' as const, fontSize: '0.825rem', color: '#1a1a18' }}>{c.score}/{c.total_marks}</span>
                        <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', fontWeight: 700, color: gradeInfo.color }}>{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}

          {/* MANUAL ENTRIES TAB */}
          {activeTab === 'manual' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                <button onClick={() => setShowEntryForm(true)}
                  style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                  + Add Entry
                </button>
              </div>

              {showEntryForm && (
                <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                    <div><label style={lbl}>Student *</label>
                      <select style={sel} value={entryForm.studentId} onChange={e => setEntryForm(f => ({ ...f, studentId: e.target.value }))}>
                        <option value="">Select...</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select></div>
                    <div><label style={lbl}>Title *</label>
                      <input style={inp} value={entryForm.title} onChange={e => setEntryForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Mid-term test" /></div>
                    <div><label style={lbl}>Type</label>
                      <select style={sel} value={entryForm.entryType} onChange={e => setEntryForm(f => ({ ...f, entryType: e.target.value }))}>
                        <option value="class_test">Class Test</option>
                        <option value="manual">Manual</option>
                      </select></div>
                    <div><label style={lbl}>Score *</label>
                      <input style={inp} type="number" value={entryForm.score} onChange={e => setEntryForm(f => ({ ...f, score: e.target.value }))} /></div>
                    <div><label style={lbl}>Max Score</label>
                      <input style={inp} type="number" value={entryForm.maxScore} onChange={e => setEntryForm(f => ({ ...f, maxScore: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button onClick={saveEntry} disabled={savingEntry}
                      style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: savingEntry ? 0.6 : 1 }}>
                      {savingEntry ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setShowEntryForm(false)}
                      style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
                {entries.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center' as const }}>
                    <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No manual entries yet. Add class test scores or custom entries.</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px 60px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                      <span>Student</span><span>Title</span><span>Type</span><span style={{ textAlign: 'center' as const }}>Score</span><span style={{ textAlign: 'center' as const }}>%</span><span></span>
                    </div>
                    {entries.map(e => {
                      const pct = Number(e.score) / Number(e.max_score) * 100
                      const gradeInfo = getGrade(pct)
                      return (
                        <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px 60px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                          <p style={{ fontSize: '0.875rem', color: '#1a1a18' }}>{e.student_name}</p>
                          <p style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{e.title}</p>
                          <p style={{ fontSize: '0.72rem', color: '#6b6b65', textTransform: 'capitalize' as const }}>{e.entry_type.replace('_', ' ')}</p>
                          <span style={{ textAlign: 'center' as const, fontSize: '0.825rem' }}>{e.score}/{e.max_score}</span>
                          <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', fontWeight: 700, color: gradeInfo.color }}>{pct.toFixed(1)}%</span>
                          <button onClick={() => deleteEntry(e.id)}
                            style={{ padding: '0.25rem 0.5rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Del</button>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk Entry Modal */}
      {showBulkForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setShowBulkForm(false)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' as const }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Bulk Score Entry</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
              <div><label style={lbl}>Test/Assessment Title *</label>
                <input style={inp} value={bulkTitle} onChange={e => setBulkTitle(e.target.value)} placeholder="e.g. Mid-term Class Test" autoFocus /></div>
              <div><label style={lbl}>Max Score</label>
                <input style={inp} type="number" value={bulkMaxScore} onChange={e => setBulkMaxScore(e.target.value)} /></div>
            </div>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', marginBottom: '0.875rem' }}>Enter scores for each student (leave blank to skip):</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {students.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.875rem', color: '#1a1a18', flex: 1 }}>{s.full_name}</span>
                  <input
                    type="number" min={0} max={Number(bulkMaxScore)}
                    value={bulkScores[s.id] ?? ''}
                    onChange={e => setBulkScores(prev => ({ ...prev, [s.id]: e.target.value }))}
                    placeholder="—"
                    style={{ ...inp, width: 80, textAlign: 'center' as const }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#a0a09a', width: 30 }}>/{bulkMaxScore}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={saveBulkScores} disabled={savingBulk}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: savingBulk ? 0.6 : 1 }}>
                {savingBulk ? 'Saving...' : '💾 Save All Scores'}
              </button>
              <button onClick={() => setShowBulkForm(false)}
                style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}