'use client'
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
}

interface Stats {
  total: number
  submitted: number
  passed: number
  avgScore: number
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
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [results, setResults] = useState<ExamResult[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loadingExams, setLoadingExams] = useState(true)
  const [loadingResults, setLoadingResults] = useState(false)
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all')
  const [sort, setSort] = useState<'percentage' | 'name'>('percentage')
  const [exporting, setExporting] = useState(false)

  function getToken() {
    return document.cookie.split(';')
      .find(c => c.trim().startsWith('examify_token='))?.split('=')[1]
  }

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-School-Subdomain': 'greensprings',
        'Content-Type': 'application/json'
      }
    })
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${exam.id}/results`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-School-Subdomain': 'greensprings',
          'Content-Type': 'application/json'
        }
      })
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

    const headers = ['Rank','Student Name','Admission No','Class','Arm','Score','Percentage','Result','Status','Submitted At']
    const rows = results.map((r, i) => [
      r.status === 'submitted' ? i + 1 : '',
      r.student_name ?? '',
      r.admission_no ?? '',
      r.class_level ?? '',
      r.class_arm ?? '',
      r.score ?? '',
      r.percentage ? `${Math.round(r.percentage * 10) / 10}%` : '',
      r.passed === true ? 'Pass' : r.passed === false ? 'Fail' : '',
      r.status ?? '',
      r.submitted_at ? new Date(r.submitted_at).toLocaleString('en-NG') : '',
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
      if (filter === 'failed') return !r.passed && r.status === 'submitted'
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

          {results.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
              <p>No results yet. Students haven't submitted this exam.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '0.4fr 2fr 1fr 0.8fr 1.8fr 0.7fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                <span>Rank</span><span>Student</span><span>Adm. No.</span><span>Class</span><span>Score</span><span>Result</span><span>Status</span>
              </div>
              {filteredResults.map((r, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.4fr 2fr 1fr 0.8fr 1.8fr 0.7fr 1fr', gap: '0.75rem', padding: '0.875rem 1.25rem', alignItems: 'center', borderTop: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>{r.status === 'submitted' ? i + 1 : '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--brand-light)', color: 'var(--brand-dark)', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.student_name?.charAt(0)}</span>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.student_name}</span>
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{r.admission_no ?? '—'}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{r.class_level} {r.class_arm}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    {r.status === 'submitted' ? (
                      <>
                        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', maxWidth: 80 }}>
                          <div style={{ width: `${r.percentage}%`, height: '100%', background: getScoreColor(r.percentage), borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: '0.825rem', fontWeight: 600, color: getScoreColor(r.percentage), minWidth: 36 }}>{Math.round(r.percentage * 10) / 10}%</span>
                      </>
                    ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                  </span>
                  <span>
                    {r.status === 'submitted' && (
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
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {selectedExam && loadingResults && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading results…</div>
      )}
    </div>
  )
}
