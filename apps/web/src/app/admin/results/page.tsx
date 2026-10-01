'use client'
import { apiFetch, checkAuth, getToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface ExamResult {
  student_name: string
  admission_no: string
  class_level: string
  class_arm: string
  score: number
  percentage: number
  passed: boolean
  status: string
  submitted_at: string
  session_id: string
  tab_switches: number
  time_away_seconds: number
  marking_status: 'complete' | 'pending'
  auto_score: number | null
  has_essay_marks: boolean
}

// "1m 20s", "45s"
function fmtAway(secs: number) {
  const s = Math.max(0, Math.round(Number(secs) || 0))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60), r = s % 60
  return r ? `${m}m ${r}s` : `${m}m`
}
const awayTone = (n: number) => n >= 5 ? { bg: '#fef2f2', fg: '#b91c1c' } : { bg: '#fffbeb', fg: '#92400e' }

interface Stats {
  total: number
  submitted: number
  passed: number
  avgScore: number
  toMark?: number
}

interface Exam {
  id: string
  title: string
  subject: string
  class_level: string
  status: string
  scheduled_at: string
}

export default function AdminResultsPage() {
  const router = useRouter()
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [results, setResults] = useState<ExamResult[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loadingExams, setLoadingExams] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')
  const [sort, setSort] = useState<'percentage' | 'name'>('percentage')
  const [exporting, setExporting] = useState(false)
  const [away, setAway] = useState<{ name: string; data: any | null } | null>(null)
  // Essay marking
  const [marking, setMarking] = useState<{ sessionId: string; data: any | null; error?: string } | null>(null)
  const [markForm, setMarkForm] = useState<Record<string, { marks: string; comment: string }>>({})
  const [markSaving, setMarkSaving] = useState(false)
  const [markMsg, setMarkMsg] = useState('')

  async function openMarking(r: ExamResult) {
    setMarking({ sessionId: r.session_id, data: null }); setMarkMsg('')
    const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/${r.session_id}/marking`)
    const data = await res.json().catch(() => null)
    if (!res.ok) { setMarking({ sessionId: r.session_id, data: null, error: data?.message ?? 'Could not open this paper.' }); return }
    setMarkForm(Object.fromEntries(data.essays.map((e: any) => [e.questionId, { marks: e.given ? String(e.given.marks) : '', comment: e.given?.comment ?? '' }])))
    setMarking({ sessionId: r.session_id, data })
  }

  async function saveMarks() {
    if (!marking?.data) return
    const marks: Record<string, { marks: number; comment: string | null }> = {}
    for (const e of marking.data.essays) {
      const f = markForm[e.questionId]
      if (!e.answer.trim() || !f || f.marks.trim() === '') continue
      const n = Number(f.marks)
      if (!Number.isFinite(n) || n < 0 || n > e.maxMarks) { setMarkMsg(`Question ${e.number}: give a mark from 0 to ${e.maxMarks}.`); return }
      marks[e.questionId] = { marks: n, comment: f.comment.trim() || null }
    }
    setMarkSaving(true); setMarkMsg('')
    const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/${marking.sessionId}/marking`, { method: 'POST', body: JSON.stringify({ marks }) })
    const data = await res.json().catch(() => null)
    setMarkSaving(false)
    if (!res.ok) { setMarkMsg(data?.message ?? 'Could not save the marks.'); return }
    if (data.markingStatus === 'complete') {
      setMarking(null)
      if (selectedExam) loadResults(selectedExam)
    } else {
      setMarkMsg(`Saved. ${data.stillToMark} essay answer${data.stillToMark === 1 ? '' : 's'} still to mark before the final score is worked out.`)
    }
  }

  async function openAway(r: ExamResult) {
    setAway({ name: r.student_name, data: null })
    const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/sessions/${r.session_id}/focus-events`)
    const data = await res.json().catch(() => null)
    setAway({ name: r.student_name, data: res.ok ? data : { error: data?.message ?? 'Could not load the details.' } })
  }

  
  useEffect(() => { checkAuth(router, ['school_admin', 'teacher']) }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/exams`)
      .then(r => r.json())
      .then(d => setExams(d.exams ?? []))
      .catch(console.error)
      .finally(() => setLoadingExams(false))
  }, [])

  async function loadResults(exam: Exam) {
    setSelectedExam(exam)
    setLoadingResults(true)
    setResults([])
    setStats(null)
    const token = getToken()
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${exam.id}/results`)
      const data = await res.json()
      setResults(data.results ?? [])
      setStats(data.stats ?? null)
    } catch (err) {
      console.error('Failed to load results:', err)
    } finally {
      setLoadingResults(false)
    }
  }

  function exportToCSV() {
    if (!selectedExam || results.length === 0) return
    setExporting(true)

    const headers = ['Rank','Student Name','Admission No','Class','Arm','Score','Percentage','Result','Status','Submitted At','Times Left Exam Screen','Time Away']
    const rows = results.map((r, i) => [
      r.status === 'submitted' ? i + 1 : '',
      r.student_name ?? '',
      r.admission_no ?? '',
      r.class_level ?? '',
      r.class_arm ?? '',
      r.score ?? '',
      r.marking_status === 'pending' ? 'Essays to mark' : r.percentage != null ? `${Math.round(r.percentage * 10) / 10}%` : '',
      r.passed === true ? 'Pass' : r.passed === false ? 'Fail' : '',
      r.status ?? '',
      r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-NG') : '',
      Number(r.tab_switches ?? 0),
      Number(r.tab_switches ?? 0) ? fmtAway(r.time_away_seconds) : '',
    ])

    const summaryRows = [
      [],
      ['SUMMARY'],
      ['Total Students', stats?.total ?? results.length],
      ['Submitted', stats?.submitted ?? ''],
      ['Passed', stats?.passed ?? ''],
      ['Failed', (stats?.submitted ?? 0) - (stats?.passed ?? 0)],
      ['Average Score', stats?.avgScore ? `${stats.avgScore}%` : ''],
      ['Pass Rate', stats?.submitted ? `${Math.round((stats.passed / stats.submitted) * 100)}%` : ''],
    ]

    const allRows = [headers, ...rows, ...summaryRows]
    const csv = allRows.map(row =>
      row.map((cell: any) => {
        const str = String(cell ?? '')
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
    ).join('\n')

    const bom = '\uFEFF'
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedExam.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-results.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const filteredResults = results
    .filter(r => {
      if (filter === 'passed') return r.passed
      if (filter === 'failed') return r.passed === false && r.status === 'submitted'
      return true
    })
    .sort((a, b) => sort === 'name'
      ? a.student_name.localeCompare(b.student_name)
      : (b.percentage ?? 0) - (a.percentage ?? 0))

  function getScoreColor(pct: number) {
    if (pct >= 70) return '#1a6b4a'
    if (pct >= 50) return '#d97706'
    return '#dc2626'
  }

  function formatDate(iso: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const passRate = stats && stats.submitted > 0
    ? Math.round((stats.passed / stats.submitted) * 100) : 0

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', fontFamily: 'var(--font-body)' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Results</h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>View and export exam results for all students</p>
      </div>

      <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Select an exam to view results</p>
        </div>
        {loadingExams ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading exams…</div>
        ) : exams.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No exams found.</div>
        ) : exams.map(exam => (
          <div key={exam.id} onClick={() => loadResults(exam)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border)', cursor: 'pointer', background: selectedExam?.id === exam.id ? 'var(--brand-light)' : 'transparent', transition: 'background 0.15s' }}>
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{exam.title}</p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{exam.subject} · {exam.class_level} · {formatDate(exam.scheduled_at)}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '20px', textTransform: 'uppercase' as const, background: exam.status === 'active' ? 'var(--brand-light)' : 'var(--bg)', color: exam.status === 'active' ? 'var(--brand-dark)' : 'var(--text-secondary)', border: exam.status !== 'active' ? '1px solid var(--border)' : 'none' }}>{exam.status}</span>
              {selectedExam?.id === exam.id && <span style={{ color: 'var(--brand)' }}>✓</span>}
            </div>
          </div>
        ))}
      </div>

      {selectedExam && !loadingResults && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Total', value: stats?.total ?? 0, color: 'var(--text-primary)' },
              { label: 'Submitted', value: stats?.submitted ?? 0, color: 'var(--text-primary)' },
              { label: 'Passed', value: stats?.passed ?? 0, color: '#1a6b4a' },
              { label: 'Failed', value: (stats?.submitted ?? 0) - (stats?.passed ?? 0), color: '#dc2626' },
              { label: 'Avg score', value: stats?.avgScore ? `${stats.avgScore}%` : '—', color: 'var(--text-primary)' },
              { label: 'Pass rate', value: `${passRate}%`, color: passRate >= 50 ? '#1a6b4a' : '#dc2626' },
            ].map(s => (
              <div key={s.label} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '0.375rem' }}>{s.label}</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 600, color: s.color, letterSpacing: '-0.02em' }}>{s.value}</p>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' as const }}>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {(['all', 'passed', 'failed'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{ padding: '0.5rem 1rem', fontSize: '0.825rem', fontWeight: 500, borderRadius: '20px', cursor: 'pointer', background: filter === f ? '#1a6b4a' : 'white', color: filter === f ? 'white' : 'var(--text-secondary)', border: `1.5px solid ${filter === f ? '#1a6b4a' : 'var(--border)'}` }}>
                  {f === 'all' ? 'All students' : f === 'passed' ? 'Passed' : 'Failed'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <select value={sort} onChange={e => setSort(e.target.value as 'percentage' | 'name')} style={{ padding: '0.5rem 0.875rem', background: 'white', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.825rem', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}>
                <option value="percentage">Sort by score</option>
                <option value="name">Sort by name</option>
              </select>
              <button onClick={exportToCSV} disabled={exporting || results.length === 0} style={{ padding: '0.5rem 1.25rem', background: 'white', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-secondary)', cursor: exporting ? 'not-allowed' : 'pointer' }}>
                {exporting ? '⏳ Exporting…' : '↓ Export CSV'}
              </button>
            </div>
          </div>

          {(stats?.toMark ?? 0) > 0 && (
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#5b21b6' }}>
              ✎ <strong>{stats!.toMark} paper{stats!.toMark === 1 ? ' has' : 's have'} essay answers to mark.</strong> Their scores, the pass rate and the average are worked out once you’ve marked them. Click <em>Mark essays</em> on a student.
            </div>
          )}
          {results.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
              <p>No results yet. Students haven't submitted this exam.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '0.4fr 2fr 1fr 0.8fr 1.6fr 0.7fr 1fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <span>Rank</span><span>Student</span><span>Adm. No.</span><span>Class</span><span>Score</span><span>Result</span><span>Status</span><span title="Times the student left the exam screen (another tab or app, or minimised)">Left screen</span>
              </div>
              {filteredResults.map((r, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.4fr 2fr 1fr 0.8fr 1.6fr 0.7fr 1fr 1fr', gap: '0.75rem', padding: '0.875rem 1.25rem', alignItems: 'center', borderTop: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>{r.status === 'submitted' ? i + 1 : '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-light)', color: 'var(--brand-dark)', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.student_name?.charAt(0)}</span>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.student_name}</span>
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{r.admission_no ?? '—'}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{r.class_level} {r.class_arm}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    {r.status === 'submitted' && r.marking_status === 'pending' ? (
                      <button onClick={() => openMarking(r)}
                        style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.3rem 0.7rem', borderRadius: '20px', border: '1px solid #c4b5fd', background: '#f5f3ff', color: '#6d28d9', cursor: 'pointer' }}>
                        ✎ Mark essays
                      </button>
                    ) : r.status === 'submitted' ? (
                      <>
                        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', maxWidth: 80 }}>
                          <div style={{ width: `${r.percentage}%`, height: '100%', background: getScoreColor(r.percentage), borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: '0.825rem', fontWeight: 600, color: getScoreColor(r.percentage), minWidth: 36 }}>{Math.round(r.percentage * 10) / 10}%</span>
                        {r.has_essay_marks && (
                          <button onClick={() => openMarking(r)} title="Change essay marks"
                            style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 6, border: '1px solid var(--border)', background: 'white', color: 'var(--text-secondary)', cursor: 'pointer' }}>✎</button>
                        )}
                      </>
                    ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                  </span>
                  <span>
                    {r.status === 'submitted' && r.marking_status !== 'pending' && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '20px', background: r.passed ? 'var(--brand-light)' : 'var(--danger-light)', color: r.passed ? 'var(--brand-dark)' : 'var(--danger)' }}>
                        {r.passed ? 'Pass' : 'Fail'}
                      </span>
                    )}
                  </span>
                  <span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '20px', background: r.status === 'submitted' ? 'var(--bg)' : 'var(--warning-light)', color: r.status === 'submitted' ? 'var(--text-secondary)' : 'var(--warning)', border: r.status === 'submitted' ? '1px solid var(--border)' : 'none' }}>
                      {r.status === 'submitted' ? 'Submitted' : r.status === 'in_progress' ? 'In progress' : r.status}
                    </span>
                  </span>
                  <span>
                    {Number(r.tab_switches ?? 0) > 0 ? (
                      <button onClick={() => openAway(r)} title="See when"
                        style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: awayTone(r.tab_switches).bg, color: awayTone(r.tab_switches).fg }}>
                        {r.tab_switches}× · {fmtAway(r.time_away_seconds)}
                      </button>
                    ) : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>{r.status === 'not_started' ? '—' : 'Never'}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {marking && (
        <div onClick={() => setMarking(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, padding: '1.5rem', width: 720, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            {marking.error ? <p style={{ color: 'var(--danger)' }}>{marking.error}</p> : !marking.data ? <p style={{ color: 'var(--text-secondary)' }}>Loading…</p> : (
              <>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Mark essays: {marking.data.student.name}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.25rem 0 1rem' }}>
                  {marking.data.exam.title} · {marking.data.student.classLevel} {marking.data.student.classArm ?? ''} ·
                  {' '}{marking.data.autoScore} mark{marking.data.autoScore === 1 ? '' : 's'} from the questions marked automatically, out of {marking.data.exam.totalMarks} in total
                </p>
                {marking.data.essays.map((e: any) => (
                  <div key={e.questionId} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem', marginBottom: '0.9rem' }}>
                    <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Question {e.number} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>· out of {e.maxMarks}</span></p>
                    <p style={{ fontSize: '0.88rem', margin: '0.3rem 0 0.6rem', whiteSpace: 'pre-wrap' }}>{e.questionText}</p>
                    {e.guide && <p style={{ fontSize: '0.8rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.5rem 0.7rem', marginBottom: '0.6rem', color: '#78350f', whiteSpace: 'pre-wrap' }}><strong>Marking guide:</strong> {e.guide}</p>}
                    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.7rem 0.85rem', fontSize: '0.88rem', whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', lineHeight: 1.55 }}>
                      {e.answer.trim() ? e.answer : <em style={{ color: 'var(--text-tertiary)' }}>Not answered (scores 0 automatically)</em>}
                    </div>
                    {e.answer.trim() && (
                      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Mark</label>
                        <input type="number" min={0} max={e.maxMarks} step={0.5} value={markForm[e.questionId]?.marks ?? ''}
                          onChange={ev => setMarkForm(f => ({ ...f, [e.questionId]: { ...(f[e.questionId] ?? { comment: '' }), marks: ev.target.value } }))}
                          style={{ width: 80, padding: '0.4rem 0.5rem', border: '1.5px solid var(--border)', borderRadius: 6 }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>/ {e.maxMarks}</span>
                        <input placeholder="Comment for the student (optional)" value={markForm[e.questionId]?.comment ?? ''}
                          onChange={ev => setMarkForm(f => ({ ...f, [e.questionId]: { ...(f[e.questionId] ?? { marks: '' }), comment: ev.target.value } }))}
                          style={{ flex: 1, minWidth: 200, padding: '0.4rem 0.6rem', border: '1.5px solid var(--border)', borderRadius: 6 }} />
                      </div>
                    )}
                  </div>
                ))}
                {markMsg && <p style={{ fontSize: '0.85rem', color: markMsg.startsWith('Saved') ? '#1a6b4a' : 'var(--danger)', marginBottom: '0.6rem' }}>{markMsg}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button onClick={() => setMarking(null)} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'white', fontWeight: 600, cursor: 'pointer' }}>Close</button>
                  <button onClick={saveMarks} disabled={markSaving} style={{ padding: '0.55rem 1.1rem', borderRadius: 8, border: 'none', background: '#1a6b4a', color: 'white', fontWeight: 600, cursor: 'pointer' }}>{markSaving ? 'Saving…' : 'Save marks'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {away && (
        <div onClick={() => setAway(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, padding: '1.5rem', width: 460, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.25rem' }}>{away.name} left the exam screen</h2>
            {!away.data ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading…</p>
              : away.data.error ? <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{away.data.error}</p> : (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.9rem' }}>
                  {away.data.tabSwitches} time{away.data.tabSwitches === 1 ? '' : 's'}, {fmtAway(away.data.timeAwaySeconds)} away in total.
                  Times are from the server. Leaving includes switching tab or app and minimising the browser.
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead><tr>{['#', 'Left at', 'Came back', 'Away'].map(h => <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.5rem', fontSize: '0.68rem', textTransform: 'uppercase' as const, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {away.data.events.map((e: any, i: number) => (
                      <tr key={i}>
                        <td style={{ padding: '0.4rem 0.5rem', color: 'var(--text-tertiary)' }}>{i + 1}</td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>{new Date(e.left_at).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                        <td style={{ padding: '0.4rem 0.5rem' }}>{e.returned_at ? new Date(e.returned_at).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</td>
                        <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600 }}>{e.seconds_away == null ? 'still away' : fmtAway(e.seconds_away)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {away.data.events.length < away.data.tabSwitches && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.6rem' }}>
                    {away.data.tabSwitches - away.data.events.length} more time{away.data.tabSwitches - away.data.events.length === 1 ? ' was' : 's were'} counted while the student was offline, so the exact times weren’t received.
                  </p>
                )}
              </>
            )}
            <div style={{ textAlign: 'right', marginTop: '1rem' }}>
              <button onClick={() => setAway(null)} style={{ padding: '0.5rem 1.1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'white', fontWeight: 600, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
      {selectedExam && loadingResults && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading results…</div>
      )}
    </div>
  )
}
