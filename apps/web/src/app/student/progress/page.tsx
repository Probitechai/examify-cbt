'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'

interface ExamResult {
  id: string
  title: string
  subject: string
  score: number
  percentage: number
  passed: boolean
  status: string
  submitted_at: string
  duration_minutes: number
  total_marks: number
  class_level: string
}

interface SubjectSummary {
  subject: string
  exams: number
  passed: number
  avgScore: number
  bestScore: number
}

export default function StudentProgressPage() {
  const router = useRouter()
  const { user, isLoading, hydrate } = useAuthStore()
  const [results, setResults] = useState<ExamResult[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'history' | 'subjects' | 'trends'>('history')

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [user, isLoading, router])

  useEffect(() => {
    if (!user) return
    loadProgress()
  }, [user])

  async function loadProgress() {
    setLoading(true)
    try {
      // Get available exams with session status
      const token = document.cookie.match(/examify_token=([^;]+)/)?.[1]
      const subdomain = (() => {
        try {
          const payload = JSON.parse(atob(token!.split('.')[1]))
          return payload.schoolSubdomain ?? localStorage.getItem('examify_school') ?? 'greensprings'
        } catch { return 'greensprings' }
      })()

      const headers = {
        'Authorization': `Bearer ${token}`,
        'X-School-Subdomain': subdomain,
        'Content-Type': 'application/json'
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/available`, { headers })
      const data = await res.json()
      const exams = data.exams ?? []

      // Filter to only submitted ones
      const submitted = exams.filter((e: any) =>
        e.session_status === 'submitted' || e.sessionStatus === 'submitted'
      ).map((e: any) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        score: e.score ?? 0,
        percentage: e.percentage ?? 0,
        passed: e.passed ?? false,
        status: e.session_status ?? e.sessionStatus,
        submitted_at: e.submitted_at ?? e.scheduledAt ?? e.scheduled_at,
        duration_minutes: e.duration_minutes ?? e.durationMinutes ?? 60,
        total_marks: e.total_marks ?? 0,
        class_level: e.class_level ?? '',
      }))

      setResults(submitted)
    } catch (err) {
      console.error('Failed to load progress:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate stats
  const totalExams = results.length
  const totalPassed = results.filter(r => r.passed).length
  const totalFailed = totalExams - totalPassed
  const avgScore = totalExams > 0
    ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalExams * 10) / 10
    : 0
  const passRate = totalExams > 0 ? Math.round((totalPassed / totalExams) * 100) : 0
  const bestScore = totalExams > 0 ? Math.round(Math.max(...results.map(r => r.percentage)) * 10) / 10 : 0

  // Subject summaries
  const subjectMap: Record<string, SubjectSummary> = {}
  for (const r of results) {
    if (!subjectMap[r.subject]) {
      subjectMap[r.subject] = { subject: r.subject, exams: 0, passed: 0, avgScore: 0, bestScore: 0 }
    }
    const s = subjectMap[r.subject]
    s.exams++
    if (r.passed) s.passed++
    s.avgScore = Math.round(((s.avgScore * (s.exams - 1)) + r.percentage) / s.exams * 10) / 10
    s.bestScore = Math.max(s.bestScore, r.percentage)
  }
  const subjectSummaries = Object.values(subjectMap).sort((a, b) => b.avgScore - a.avgScore)
  const strongestSubject = subjectSummaries[0]
  const weakestSubject = subjectSummaries[subjectSummaries.length - 1]

  // Trend data (sorted by date)
  const sortedResults = [...results].sort((a, b) =>
    new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
  )

  function formatDate(iso: string) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function getScoreColor(pct: number) {
    if (pct >= 70) return '#1a6b4a'
    if (pct >= 50) return '#d97706'
    return '#dc2626'
  }

  function getScoreBg(pct: number) {
    if (pct >= 70) return '#e8f5ee'
    if (pct >= 50) return '#fffbeb'
    return '#fef2f2'
  }

  if (isLoading || !user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
        <div style={{ width: 36, height: 36, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  const initials = user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={() => router.push('/student')}
              style={{ fontSize: '0.875rem', color: '#6b6b65', padding: '0.375rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>
              ← Dashboard
            </button>
            <span style={{ color: '#e5e5e0' }}>|</span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>My Progress</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 36, height: 36, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>
              {initials}
            </div>
            <div>
              <p style={{ fontSize: '0.825rem', fontWeight: 500, color: '#1a1a18' }}>{user.fullName}</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{user.classLevel} {user.classArm}</p>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Profile card */}
        <div style={{ background: 'linear-gradient(135deg, #1a6b4a 0%, #0f4a32 100%)', borderRadius: 20, padding: '2rem', marginBottom: '2rem', color: 'white', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' as const }}>
          <div style={{ width: 64, height: 64, background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>{user.fullName}</h1>
            <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>{user.school?.name} · {user.classLevel} {user.classArm}</p>
            {strongestSubject && (
              <p style={{ opacity: 0.75, fontSize: '0.8rem', marginTop: '0.375rem' }}>
                ⭐ Strongest subject: <strong>{strongestSubject.subject}</strong> ({strongestSubject.avgScore}% avg)
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' as const }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '0.875rem 1.25rem', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em' }}>{avgScore}%</p>
              <p style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: '0.2rem' }}>Average score</p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '0.875rem 1.25rem', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
              <p style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em' }}>{passRate}%</p>
              <p style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: '0.2rem' }}>Pass rate</p>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Exams taken', value: totalExams, icon: '📋', color: '#1a6b4a', bg: '#e8f5ee' },
            { label: 'Passed', value: totalPassed, icon: '✅', color: '#1a6b4a', bg: '#e8f5ee' },
            { label: 'Failed', value: totalFailed, icon: '❌', color: '#dc2626', bg: '#fef2f2' },
            { label: 'Best score', value: `${bestScore}%`, icon: '🏆', color: '#d97706', bg: '#fffbeb' },
            { label: 'Subjects', value: subjectSummaries.length, icon: '📚', color: '#7e22ce', bg: '#fdf4ff' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 38, height: 38, background: s.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>{s.icon}</div>
              <div>
                <p style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: '0.7rem', color: '#6b6b65', marginTop: '0.2rem' }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Subject highlights */}
        {subjectSummaries.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
            {strongestSubject && (
              <div style={{ background: '#e8f5ee', border: '1.5px solid #1a6b4a', borderRadius: 14, padding: '1.25rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0f4a32', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '0.5rem' }}>⭐ Strongest subject</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f4a32', marginBottom: '0.25rem' }}>{strongestSubject.subject}</p>
                <p style={{ fontSize: '0.875rem', color: '#1a6b4a' }}>{strongestSubject.avgScore}% average · {strongestSubject.passed}/{strongestSubject.exams} passed</p>
              </div>
            )}
            {weakestSubject && weakestSubject.subject !== strongestSubject?.subject && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 14, padding: '1.25rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '0.5rem' }}>📚 Needs improvement</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#991b1b', marginBottom: '0.25rem' }}>{weakestSubject.subject}</p>
                <p style={{ fontSize: '0.875rem', color: '#dc2626' }}>{weakestSubject.avgScore}% average · {weakestSubject.passed}/{weakestSubject.exams} passed</p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {([
            { key: 'history', label: '📋 Exam History' },
            { key: 'subjects', label: '📚 By Subject' },
            { key: 'trends', label: '📈 Score Trend' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ flex: 1, padding: '0.875rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65', transition: 'all 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ background: 'white', borderRadius: 14, padding: '3rem', textAlign: 'center', border: '1px solid #e5e5e0' }}>
            <div style={{ width: 32, height: 32, border: '2.5px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
            <p style={{ color: '#6b6b65' }}>Loading your progress…</p>
          </div>
        ) : results.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 16, padding: '4rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No exam history yet</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>Take your first exam to see your progress here.</p>
            <button onClick={() => router.push('/student')}
              style={{ padding: '0.75rem 1.5rem', background: '#1a6b4a', color: 'white', fontWeight: 600, fontSize: '0.875rem', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
              View available exams →
            </button>
          </div>
        ) : (
          <>
            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {[...results].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()).map(r => (
                  <div key={r.id} style={{ background: 'white', border: `1.5px solid ${r.passed ? '#1a6b4a' : '#fecaca'}`, borderRadius: 14, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' as const }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem', flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: r.passed ? '#e8f5ee' : '#fef2f2', color: r.passed ? '#0f4a32' : '#dc2626', textTransform: 'uppercase' as const }}>
                          {r.passed ? '✓ Passed' : '✗ Failed'}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#6b6b65', background: '#f7f7f5', padding: '0.2rem 0.625rem', borderRadius: 20 }}>{r.subject}</span>
                      </div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>{r.title}</h3>
                      <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>📅 {formatDate(r.submitted_at)}</p>
                    </div>
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: getScoreBg(r.percentage), border: `3px solid ${getScoreColor(r.percentage)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' as const }}>
                        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: getScoreColor(r.percentage), lineHeight: 1 }}>{Math.round(r.percentage)}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SUBJECTS TAB */}
            {activeTab === 'subjects' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {subjectSummaries.map(s => (
                  <div key={s.subject} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{s.subject}</h3>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: 20, background: getScoreBg(s.avgScore), color: getScoreColor(s.avgScore) }}>
                        {s.avgScore}% avg
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem', marginBottom: '0.875rem' }}>
                      {[
                        { label: 'Exams taken', value: s.exams },
                        { label: 'Passed', value: s.passed },
                        { label: 'Failed', value: s.exams - s.passed },
                        { label: 'Best score', value: `${s.bestScore}%` },
                      ].map(stat => (
                        <div key={stat.label} style={{ background: '#f7f7f5', borderRadius: 8, padding: '0.625rem', textAlign: 'center' }}>
                          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', letterSpacing: '-0.02em' }}>{stat.value}</p>
                          <p style={{ fontSize: '0.7rem', color: '#6b6b65', marginTop: '0.1rem' }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#6b6b65', marginBottom: '0.3rem' }}>
                        <span>Average score</span><span>{s.avgScore}%</span>
                      </div>
                      <div style={{ height: 8, background: '#e5e5e0', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${s.avgScore}%`, height: '100%', background: getScoreColor(s.avgScore), borderRadius: 4, transition: 'width 0.8s ease' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TRENDS TAB */}
            {activeTab === 'trends' && (
              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.5rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.5rem' }}>Score trend over time</h3>
                {sortedResults.length < 2 ? (
                  <p style={{ color: '#6b6b65', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
                    Take at least 2 exams to see your score trend.
                  </p>
                ) : (
                  <div style={{ position: 'relative' }}>
                    {/* Simple bar chart */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 200, borderBottom: '1px solid #e5e5e0', borderLeft: '1px solid #e5e5e0', padding: '0 0.5rem', marginBottom: '0.5rem' }}>
                      {sortedResults.map((r, i) => (
                        <div key={r.id} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: getScoreColor(r.percentage) }}>{Math.round(r.percentage)}%</span>
                          <div style={{ width: '100%', height: `${Math.max(4, r.percentage * 1.8)}px`, background: getScoreColor(r.percentage), borderRadius: '4px 4px 0 0', transition: 'height 0.5s ease', opacity: 0.85 }} />
                        </div>
                      ))}
                    </div>
                    {/* X axis labels */}
                    <div style={{ display: 'flex', gap: '0.5rem', padding: '0 0.5rem' }}>
                      {sortedResults.map(r => (
                        <div key={r.id} style={{ flex: 1, textAlign: 'center' }}>
                          <p style={{ fontSize: '0.6rem', color: '#6b6b65', lineHeight: 1.3 }}>{r.subject.slice(0, 8)}</p>
                        </div>
                      ))}
                    </div>
                    {/* Trend indicator */}
                    {sortedResults.length >= 2 && (() => {
                      const first = sortedResults[0].percentage
                      const last = sortedResults[sortedResults.length - 1].percentage
                      const diff = Math.round((last - first) * 10) / 10
                      const improving = diff > 0
                      return (
                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: improving ? '#e8f5ee' : diff < 0 ? '#fef2f2' : '#f7f7f5', borderRadius: 10, textAlign: 'center' }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: improving ? '#0f4a32' : diff < 0 ? '#dc2626' : '#6b6b65' }}>
                            {improving ? '📈 You are improving!' : diff < 0 ? '📉 Performance has declined' : '➡️ Performance is steady'}
                          </p>
                          <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.25rem' }}>
                            {improving ? `Up ${diff}% from your first exam` : diff < 0 ? `Down ${Math.abs(diff)}% from your first exam` : 'Consistent performance across all exams'}
                          </p>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
