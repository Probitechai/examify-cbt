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

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']
const CURRICULUM_TYPES = [
  { value: 'nigerian', label: 'Nigerian (NERDC)', color: '#1a6b4a', bg: '#e8f5ee' },
  { value: 'british', label: 'British National', color: '#1e40af', bg: '#eff6ff' },
  { value: 'cambridge', label: 'Cambridge (IGCSE)', color: '#7e22ce', bg: '#f5f3ff' },
  { value: 'montessori', label: 'Montessori', color: '#d97706', bg: '#fffbeb' },
  { value: 'ib', label: 'International Baccalaureate', color: '#0891b2', bg: '#ecfeff' },
  { value: 'hybrid', label: 'Hybrid', color: '#dc2626', bg: '#fef2f2' },
]
const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  core: { color: '#0f4a32', bg: '#e8f5ee' },
  elective: { color: '#1e40af', bg: '#eff6ff' },
  vocational: { color: '#d97706', bg: '#fffbeb' },
  extracurricular: { color: '#7e22ce', bg: '#f5f3ff' },
}
const WEEKS = Array.from({ length: 15 }, (_, i) => i + 1)

interface Subject { id: string; name: string; code: string | null; category: string; class_levels: string[]; curriculum_type: string; is_active: boolean }
interface SchemeEntry { id: string; week_number: number; topic: string; sub_topics: string[]; objectives: string[]; resources: string | null; assessment_method: string | null; delivery_status: string | null; delivered_date: string | null; delivery_notes: string | null; delivered_by: string | null }
interface CoverageRow { subject_id: string; subject_name: string; category: string; total_topics: number; delivered: number; partial: number; not_delivered: number; coverage_pct: number }

export default function CurriculumPage() {
  const [activeTab, setActiveTab] = useState<'settings' | 'subjects' | 'scheme' | 'coverage'>('settings')
  const [settings, setSettings] = useState<any>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedClass, setSelectedClass] = useState('SS2')
  const [scheme, setScheme] = useState<SchemeEntry[]>([])
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  // Settings form
  const [settingsForm, setSettingsForm] = useState({ curriculumType: 'nigerian', secondaryCurriculum: '', academicYear: '' })
  const [savingSettings, setSavingSettings] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(false)

  // Subject form
  const [showSubjectForm, setShowSubjectForm] = useState(false)
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', category: 'elective', classLevels: [] as string[], curriculumType: 'nigerian' })
  const [savingSubject, setSavingSubject] = useState(false)

  // Scheme form
  const [showSchemeForm, setShowSchemeForm] = useState(false)
  const [schemeForm, setSchemeForm] = useState({ weekNumber: 1, topic: '', subTopics: '', objectives: '', resources: '', assessmentMethod: '' })
  const [savingScheme, setSavingScheme] = useState(false)

  // Delivery modal
  const [deliveryEntry, setDeliveryEntry] = useState<SchemeEntry | null>(null)
  const [deliveryForm, setDeliveryForm] = useState({ deliveryStatus: 'delivered', deliveredDate: new Date().toISOString().slice(0,10), notes: '', attendanceCount: '' })
  const [savingDelivery, setSavingDelivery] = useState(false)

  useEffect(() => { loadInitial() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])
  useEffect(() => { if (activeTab === 'subjects') loadSubjects() }, [activeTab, selectedClass])
  useEffect(() => { if (activeTab === 'coverage' && selectedTerm && selectedClass) loadCoverage() }, [activeTab, selectedTerm, selectedClass])

  async function loadInitial() {
    try {
      const [settingsRes, sessionsRes] = await Promise.all([
        fetch(`${API}/curriculum/settings`, { headers: hdrs() }),
        fetch(`${API}/sessions`, { headers: hdrs() }),
      ])
      const settingsData = await settingsRes.json()
      const sessionsData = await sessionsRes.json()
      if (settingsData.settings) {
        setSettings(settingsData.settings)
        setSettingsForm({
          curriculumType: settingsData.settings.curriculum_type ?? 'nigerian',
          secondaryCurriculum: settingsData.settings.secondary_curriculum ?? '',
          academicYear: settingsData.settings.academic_year ?? '',
        })
      }
      const sessionList = sessionsData.sessions ?? []
      setSessions(sessionList)
      const active = sessionList.find((s: any) => s.is_active)
      if (active) setSelectedSession(active.id)
    } catch {}
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

  async function loadScheme() {
    if (!selectedSubject || !selectedTerm || !selectedClass) { setError('Please select subject, term and class'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API}/curriculum/scheme?subjectId=${selectedSubject}&termId=${selectedTerm}&classLevel=${selectedClass}`, { headers: hdrs() })
      const data = await res.json()
      setScheme(data.scheme ?? [])
    } catch { setError('Failed to load scheme') } finally { setLoading(false) }
  }

  async function loadCoverage() {
    setLoading(true)
    try {
      const res = await fetch(`${API}/curriculum/coverage?termId=${selectedTerm}&classLevel=${selectedClass}`, { headers: hdrs() })
      const data = await res.json()
      setCoverage(data.coverage ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function saveSettings() {
    setSavingSettings(true)
    try {
      await fetch(`${API}/curriculum/settings`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ curriculumType: settingsForm.curriculumType, secondaryCurriculum: settingsForm.secondaryCurriculum || undefined, academicYear: settingsForm.academicYear || undefined })
      })
      setSuccess('Settings saved!'); setTimeout(() => setSuccess(''), 3000)
      loadInitial()
    } catch { setError('Failed to save settings') } finally { setSavingSettings(false) }
  }

  async function loadDefaults() {
    setLoadingDefaults(true)
    try {
      const res = await fetch(`${API}/curriculum/load-defaults`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ curriculumType: settingsForm.curriculumType })
      })
      const data = await res.json()
      setSuccess(`Loaded ${data.loaded} default subjects!`); setTimeout(() => setSuccess(''), 3000)
    } catch { setError('Failed to load defaults') } finally { setLoadingDefaults(false) }
  }

  async function saveSubject() {
    if (!subjectForm.name || subjectForm.classLevels.length === 0) { setError('Name and at least one class level required'); return }
    setSavingSubject(true)
    try {
      await fetch(`${API}/curriculum/subjects`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ name: subjectForm.name, code: subjectForm.code || undefined, classLevels: subjectForm.classLevels, category: subjectForm.category, curriculumType: subjectForm.curriculumType })
      })
      setShowSubjectForm(false)
      setSubjectForm({ name: '', code: '', category: 'elective', classLevels: [], curriculumType: 'nigerian' })
      loadSubjects()
    } catch { setError('Failed to save subject') } finally { setSavingSubject(false) }
  }

  async function toggleSubject(id: string, isActive: boolean) {
    await fetch(`${API}/curriculum/subjects/${id}`, {
      method: 'PATCH', headers: hdrs(), body: JSON.stringify({ isActive: !isActive })
    })
    loadSubjects()
  }

  async function deleteSubject(id: string) {
    if (!window.confirm('Delete this subject?')) return
    await fetch(`${API}/curriculum/subjects/${id}`, { method: 'DELETE', headers: hdrs() })
    loadSubjects()
  }

  async function saveSchemeEntry() {
    if (!schemeForm.topic) { setError('Topic is required'); return }
    setSavingScheme(true)
    try {
      await fetch(`${API}/curriculum/scheme`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          subjectId: selectedSubject, termId: selectedTerm, classLevel: selectedClass,
          weekNumber: schemeForm.weekNumber, topic: schemeForm.topic,
          subTopics: schemeForm.subTopics ? schemeForm.subTopics.split('\n').filter(Boolean) : [],
          objectives: schemeForm.objectives ? schemeForm.objectives.split('\n').filter(Boolean) : [],
          resources: schemeForm.resources || undefined,
          assessmentMethod: schemeForm.assessmentMethod || undefined,
        })
      })
      setShowSchemeForm(false)
      setSchemeForm({ weekNumber: 1, topic: '', subTopics: '', objectives: '', resources: '', assessmentMethod: '' })
      loadScheme()
    } catch { setError('Failed to save') } finally { setSavingScheme(false) }
  }

  async function saveDelivery() {
    if (!deliveryEntry) return
    setSavingDelivery(true)
    try {
      await fetch(`${API}/curriculum/delivery`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          schemeId: deliveryEntry.id, deliveredDate: deliveryForm.deliveredDate,
          deliveryStatus: deliveryForm.deliveryStatus,
          notes: deliveryForm.notes || undefined,
          attendanceCount: deliveryForm.attendanceCount ? Number(deliveryForm.attendanceCount) : undefined,
        })
      })
      setDeliveryEntry(null)
      loadScheme()
    } catch { setError('Failed to save delivery') } finally { setSavingDelivery(false) }
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const }
  const sel = { ...inp, cursor: 'pointer' }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }

  const curriculumConfig = CURRICULUM_TYPES.find(c => c.value === (settings?.curriculum_type ?? 'nigerian'))

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Curriculum Management</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Manage your school curriculum, subjects, scheme of work and lesson delivery.</p>
      </div>

      {/* Current curriculum badge */}
      {settings && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 1rem', borderRadius: 20, background: curriculumConfig?.bg ?? '#f7f7f5', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.825rem', fontWeight: 700, color: curriculumConfig?.color ?? '#1a1a18' }}>
            📚 {curriculumConfig?.label ?? 'Nigerian'} Curriculum
          </span>
          {settings.secondary_curriculum && (
            <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>+ {settings.secondary_curriculum}</span>
          )}
        </div>
      )}

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && <div style={{ padding: '0.875rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ {success}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
        {([
          { key: 'settings', label: '⚙️ Settings' },
          { key: 'subjects', label: '📚 Subjects' },
          { key: 'scheme', label: '📋 Scheme of Work' },
          { key: 'coverage', label: '📊 Coverage' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.625rem 1.25rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Curriculum Settings</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={lbl}>Primary Curriculum</label>
              <select style={sel} value={settingsForm.curriculumType} onChange={e => setSettingsForm(f => ({ ...f, curriculumType: e.target.value }))}>
                {CURRICULUM_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {settingsForm.curriculumType === 'hybrid' && (
              <div>
                <label style={lbl}>Secondary Curriculum</label>
                <select style={sel} value={settingsForm.secondaryCurriculum} onChange={e => setSettingsForm(f => ({ ...f, secondaryCurriculum: e.target.value }))}>
                  <option value="">Select...</option>
                  {CURRICULUM_TYPES.filter(c => c.value !== 'hybrid').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Current Academic Year</label>
              <input style={inp} value={settingsForm.academicYear} onChange={e => setSettingsForm(f => ({ ...f, academicYear: e.target.value }))} placeholder="e.g. 2025/2026" />
            </div>
          </div>

          {/* Curriculum descriptions */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {CURRICULUM_TYPES.map(c => (
              <div key={c.value} onClick={() => setSettingsForm(f => ({ ...f, curriculumType: c.value }))}
                style={{ padding: '0.875rem', borderRadius: '10px', border: `2px solid ${settingsForm.curriculumType === c.value ? c.color : '#e5e5e0'}`, background: settingsForm.curriculumType === c.value ? c.bg : 'white', cursor: 'pointer', transition: 'all 0.1s' }}>
                <p style={{ fontSize: '0.825rem', fontWeight: 700, color: c.color, marginBottom: '0.25rem' }}>{c.label}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
                  {c.value === 'nigerian' ? 'NERDC approved curriculum for Nigerian schools' :
                   c.value === 'british' ? 'UK National Curriculum framework' :
                   c.value === 'cambridge' ? 'Cambridge IGCSE and A-Level programmes' :
                   c.value === 'montessori' ? 'Child-led, self-paced learning approach' :
                   c.value === 'ib' ? 'International Baccalaureate framework' :
                   'Combination of two or more curricula'}
                </p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={saveSettings} disabled={savingSettings}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: savingSettings ? 0.6 : 1 }}>
              {savingSettings ? 'Saving...' : '💾 Save Settings'}
            </button>
            <button onClick={loadDefaults} disabled={loadingDefaults}
              style={{ padding: '0.625rem 1.5rem', background: '#eff6ff', color: '#1e40af', border: '1.5px solid #bfdbfe', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loadingDefaults ? 0.6 : 1 }}>
              {loadingDefaults ? 'Loading...' : '📥 Load Default Subjects'}
            </button>
          </div>
          <p style={{ fontSize: '0.72rem', color: '#a0a09a', marginTop: '0.75rem' }}>
            "Load Default Subjects" will add the standard subjects for your selected curriculum. You can customise them afterwards.
          </p>
        </div>
      )}

      {/* SUBJECTS TAB */}
      {activeTab === 'subjects' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select style={{ ...sel, width: 'auto' }} value={selectedClass} onChange={e => { setSelectedClass(e.target.value); loadSubjects() }}>
                {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={() => setShowSubjectForm(true)}
              style={{ padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add Subject
            </button>
          </div>

          {showSubjectForm && (
            <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>New Subject</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <div><label style={lbl}>Subject Name *</label><input style={inp} value={subjectForm.name} onChange={e => setSubjectForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mathematics" autoFocus /></div>
                <div><label style={lbl}>Code (optional)</label><input style={inp} value={subjectForm.code} onChange={e => setSubjectForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. MTH" /></div>
                <div><label style={lbl}>Category</label>
                  <select style={sel} value={subjectForm.category} onChange={e => setSubjectForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="core">Core</option><option value="elective">Elective</option><option value="vocational">Vocational</option><option value="extracurricular">Extracurricular</option>
                  </select></div>
              </div>
              <div style={{ marginBottom: '0.875rem' }}>
                <label style={lbl}>Class Levels *</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const }}>
                  {CLASS_LEVELS.map(c => {
                    const sel2 = subjectForm.classLevels.includes(c)
                    return (
                      <button key={c} onClick={() => setSubjectForm(f => ({ ...f, classLevels: sel2 ? f.classLevels.filter(x => x !== c) : [...f.classLevels, c] }))}
                        style={{ padding: '0.25rem 0.875rem', border: `1.5px solid ${sel2 ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: 20, background: sel2 ? '#e8f5ee' : 'white', color: sel2 ? '#0f4a32' : '#6b6b65', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={saveSubject} disabled={savingSubject}
                  style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: savingSubject ? 0.6 : 1 }}>
                  {savingSubject ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setShowSubjectForm(false)}
                  style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 1fr 120px 100px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
              <span>Subject</span><span>Code</span><span>Classes</span><span>Category</span><span></span>
            </div>
            {subjects.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' as const }}>
                <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📚</p>
                <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No subjects yet. Load defaults or add manually.</p>
              </div>
            ) : subjects.map(s => {
              const catCfg = CATEGORY_COLORS[s.category] ?? CATEGORY_COLORS.elective
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 1fr 120px 100px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', opacity: s.is_active ? 1 : 0.5 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{s.name}</span>
                  <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{s.code ?? '—'}</span>
                  <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{s.class_levels.join(', ')}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: catCfg.bg, color: catCfg.color, textTransform: 'capitalize' as const }}>{s.category}</span>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={() => toggleSubject(s.id, s.is_active)}
                      style={{ padding: '0.25rem 0.5rem', background: s.is_active ? '#fffbeb' : '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.65rem', color: s.is_active ? '#92400e' : '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                      {s.is_active ? 'Hide' : 'Show'}
                    </button>
                    <button onClick={() => deleteSubject(s.id)}
                      style={{ padding: '0.25rem 0.5rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.65rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Del</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* SCHEME OF WORK TAB */}
      {activeTab === 'scheme' && (
        <div>
          {/* Filters */}
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
              <div><label style={lbl}>Term</label>
                <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                  <option value="">Select...</option>
                  {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
                </select></div>
              <div><label style={lbl}>Class</label>
                <select style={sel} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                  {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                </select></div>
              <div><label style={lbl}>Subject</label>
                <select style={sel} value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}>
                  <option value="">Select...</option>
                  {subjects.filter(s => s.class_levels.includes(selectedClass) && s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={loadScheme} disabled={loading}
                  style={{ padding: '0.625rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                  {loading ? 'Loading...' : 'Load'}
                </button>
              </div>
              <button onClick={() => { if (!selectedSubject || !selectedTerm) { setError('Load scheme first'); return }; setShowSchemeForm(true) }}
                style={{ padding: '0.625rem 1rem', background: '#eff6ff', color: '#1e40af', border: '1.5px solid #bfdbfe', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                + Add Week
              </button>
            </div>
          </div>

          {showSchemeForm && (
            <div style={{ background: 'white', border: '1.5px solid #1e40af', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Add Week Entry</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <div><label style={lbl}>Week</label>
                  <select style={sel} value={schemeForm.weekNumber} onChange={e => setSchemeForm(f => ({ ...f, weekNumber: Number(e.target.value) }))}>
                    {WEEKS.map(w => <option key={w} value={w}>Week {w}</option>)}
                  </select></div>
                <div><label style={lbl}>Topic *</label><input style={inp} value={schemeForm.topic} onChange={e => setSchemeForm(f => ({ ...f, topic: e.target.value }))} placeholder="e.g. Introduction to Algebra" autoFocus /></div>
                <div><label style={lbl}>Assessment Method</label><input style={inp} value={schemeForm.assessmentMethod} onChange={e => setSchemeForm(f => ({ ...f, assessmentMethod: e.target.value }))} placeholder="e.g. Class test, Quiz" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <div><label style={lbl}>Sub-topics (one per line)</label>
                  <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={schemeForm.subTopics} onChange={e => setSchemeForm(f => ({ ...f, subTopics: e.target.value }))} placeholder="Linear equations&#10;Quadratic equations" /></div>
                <div><label style={lbl}>Objectives (one per line)</label>
                  <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={schemeForm.objectives} onChange={e => setSchemeForm(f => ({ ...f, objectives: e.target.value }))} placeholder="Students will be able to...&#10;Define and solve..." /></div>
                <div><label style={lbl}>Resources</label>
                  <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={schemeForm.resources} onChange={e => setSchemeForm(f => ({ ...f, resources: e.target.value }))} placeholder="Textbook, charts, calculator..." /></div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={saveSchemeEntry} disabled={savingScheme}
                  style={{ padding: '0.5rem 1.25rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: savingScheme ? 0.6 : 1 }}>
                  {savingScheme ? 'Saving...' : 'Save Entry'}
                </button>
                <button onClick={() => setShowSchemeForm(false)}
                  style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          {scheme.length === 0 && !loading ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📋</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Select filters and click Load to view the scheme of work.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {scheme.map(entry => {
                const deliveryCfg = entry.delivery_status === 'delivered' ? { color: '#0f4a32', bg: '#e8f5ee', label: '✓ Delivered' }
                  : entry.delivery_status === 'partial' ? { color: '#d97706', bg: '#fffbeb', label: '◑ Partial' }
                  : entry.delivery_status === 'not_delivered' ? { color: '#dc2626', bg: '#fef2f2', label: '✗ Not Delivered' }
                  : entry.delivery_status === 'rescheduled' ? { color: '#7e22ce', bg: '#f5f3ff', label: '↺ Rescheduled' }
                  : { color: '#a0a09a', bg: '#f7f7f5', label: 'Not recorded' }
                return (
                  <div key={entry.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.625rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af' }}>Week {entry.week_number}</span>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{entry.topic}</p>
                        </div>
                        {entry.sub_topics?.length > 0 && (
                          <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '0.25rem' }}>Sub-topics: {entry.sub_topics.join(' · ')}</p>
                        )}
                        {entry.delivered_by && (
                          <p style={{ fontSize: '0.68rem', color: '#a0a09a' }}>Delivered by {entry.delivered_by} on {entry.delivered_date ? new Date(entry.delivered_date).toLocaleDateString('en-NG') : ''}</p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: deliveryCfg.bg, color: deliveryCfg.color, whiteSpace: 'nowrap' as const }}>
                          {deliveryCfg.label}
                        </span>
                        <button onClick={() => { setDeliveryEntry(entry); setDeliveryForm({ deliveryStatus: 'delivered', deliveredDate: new Date().toISOString().slice(0,10), notes: '', attendanceCount: '' }) }}
                          style={{ padding: '0.3rem 0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                          Record
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* COVERAGE TAB */}
      {activeTab === 'coverage' && (
        <div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
            <div><label style={lbl}>Term</label>
              <select style={{ ...sel, width: 'auto' }} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
                <option value="">Select...</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
              </select></div>
            <div><label style={lbl}>Class</label>
              <select style={{ ...sel, width: 'auto' }} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
              </select></div>
            <button onClick={loadCoverage} style={{ padding: '0.625rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>

          {coverage.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '4rem', textAlign: 'center' as const }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</p>
              <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No coverage data yet. Add scheme of work and record lessons.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 80px 1fr', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                <span>Subject</span><span style={{ textAlign: 'center' as const }}>Total</span><span style={{ textAlign: 'center' as const }}>Done</span><span style={{ textAlign: 'center' as const }}>Partial</span><span style={{ textAlign: 'center' as const }}>Pending</span><span>Coverage</span>
              </div>
              {coverage.map(row => {
                const pct = Number(row.coverage_pct ?? 0)
                const barColor = pct >= 80 ? '#1a6b4a' : pct >= 50 ? '#d97706' : '#dc2626'
                return (
                  <div key={row.subject_id} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 80px 1fr', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{row.subject_name}</p>
                      <p style={{ fontSize: '0.68rem', color: '#6b6b65', textTransform: 'capitalize' as const }}>{row.category}</p>
                    </div>
                    <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{row.total_topics}</span>
                    <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#1a6b4a', fontWeight: 600 }}>{row.delivered}</span>
                    <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#d97706' }}>{row.partial}</span>
                    <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#dc2626' }}>{Number(row.total_topics) - Number(row.delivered) - Number(row.partial)}</span>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.72rem', color: barColor, fontWeight: 700 }}>{pct}%</span>
                        {row.total_topics === 0 && <span style={{ fontSize: '0.68rem', color: '#a0a09a' }}>No scheme</span>}
                      </div>
                      {row.total_topics > 0 && (
                        <div style={{ height: 6, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.3s' }} />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lesson Delivery Modal */}
      {deliveryEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setDeliveryEntry(null)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Record Lesson Delivery</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>Week {deliveryEntry.week_number}: {deliveryEntry.topic}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div><label style={lbl}>Delivery Status</label>
                <select style={sel} value={deliveryForm.deliveryStatus} onChange={e => setDeliveryForm(f => ({ ...f, deliveryStatus: e.target.value }))}>
                  <option value="delivered">✓ Fully Delivered</option>
                  <option value="partial">◑ Partially Delivered</option>
                  <option value="not_delivered">✗ Not Delivered</option>
                  <option value="rescheduled">↺ Rescheduled</option>
                </select></div>
              <div><label style={lbl}>Date</label>
                <input style={inp} type="date" value={deliveryForm.deliveredDate} onChange={e => setDeliveryForm(f => ({ ...f, deliveredDate: e.target.value }))} /></div>
              <div><label style={lbl}>Number of Students Present (optional)</label>
                <input style={inp} type="number" value={deliveryForm.attendanceCount} onChange={e => setDeliveryForm(f => ({ ...f, attendanceCount: e.target.value }))} placeholder="e.g. 32" /></div>
              <div><label style={lbl}>Notes (optional)</label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={deliveryForm.notes} onChange={e => setDeliveryForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any notes about this lesson..." /></div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={saveDelivery} disabled={savingDelivery}
                  style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: savingDelivery ? 0.6 : 1 }}>
                  {savingDelivery ? 'Saving...' : '💾 Save'}
                </button>
                <button onClick={() => setDeliveryEntry(null)}
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