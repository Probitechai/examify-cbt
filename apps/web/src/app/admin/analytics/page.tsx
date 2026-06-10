'use client'
import { useState, useEffect } from 'react'

interface ExamStat {
  id: string
  title: string
  subject: string
  class_level: string
  class_arms: string[]
  scheduled_at: string
  total: number
  submitted: number
  passed: number
  failed: number
  avg_score: number
  pass_rate: number
  highest: number
  lowest: number
}

interface StudentStat {
  student_name: string
  admission_no: string
  class_level: string
  class_arm: string
  total_exams: number
  submitted: number
  passed: number
  avg_score: number
}

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}

function getSubdomain() {
  try {
    const token = getToken()
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.schoolSubdomain) return payload.schoolSubdomain
    }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? 'greensprings'
  } catch {}
  return 'greensprings'
}

function getHeaders() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'X-School-Subdomain': getSubdomain(),
    'Content-Type': 'application/json'
  }
}

export default function AnalyticsPage() {
  const [exams, setExams] = useState<any[]>([])
  const [examStats, setExamStats] = useState<ExamStat[]>([])
  const [studentStats, setStudentStats] = useState<StudentStat[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'exams' | 'students' | 'subjects'>('overview')
  const [classFilter, setClassFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const API = process.env.NEXT_PUBLIC_API_URL
      const headers = getHeaders()

      const [examsRes, usersRes] = await Promise.all([
        fetch(`${API}/exams`, { headers }),
        fetch(`${API}/users`, { headers }),
      ])

      const examsData = await examsRes.json()
      const usersData = await usersRes.json()

      const examList = examsData.exams ?? []
      const userList = usersData.users ?? []
      setExams(examList)

      // Load results for each submitted exam
      const stats: ExamStat[] = []
      const studentMap: Record<string, StudentStat> = {}

      for (const exam of examList) {
        if (exam.status === 'active' || exam.status === 'completed' || exam.status === 'scheduled') {
          try {
            const resultsRes = await fetch(`${API}/exams/${exam.id}/results`, { headers })
            const resultsData = await resultsRes.json()
            const results = resultsData.results ?? []

            if (results.length > 0) {
              const submitted = results.filter((r: any) => r.status === 'submitted')
              const passed = submitted.filter((r: any) => r.passed)
              const scores = submitted.map((r: any) => r.percentage ?? 0).filter((s: number) => s > 0)

              stats.push({
                id: exam.id,
                title: exam.title,
                subject: exam.subject,
                class_level: exam.class_level,
                class_arms: exam.class_arms ?? [],
                scheduled_at: exam.scheduled_at,
                total: results.length,
                submitted: submitted.length,
                passed: passed.length,
                failed: submitted.length - passed.length,
                avg_score: scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length * 10) / 10 : 0,
                pass_rate: submitted.length ? Math.round((passed.length / submitted.length) * 100) : 0,
                highest: scores.length ? Math.round(Math.max(...scores) * 10) / 10 : 0,
                lowest: scores.length ? Math.round(Math.min(...scores) * 10) / 10 : 0,
              })

              // Build student stats
              for (const r of submitted) {
                const key = r.student_name
                if (!studentMap[key]) {
                  studentMap[key] = {
                    student_name: r.student_name,
                    admission_no: r.admission_no ?? '—',
                    class_level: r.class_level ?? '',
                    class_arm: r.class_arm ?? '',
                    total_exams: 0,
                    submitted: 0,
                    passed: 0,
                    avg_score: 0,
                  }
                }
                studentMap[key].submitted++
                studentMap[key].total_exams++
                if (r.passed) studentMap[key].passed++
                studentMap[key].avg_score = Math.round(
                  ((studentMap[key].avg_score * (studentMap[key].submitted - 1)) + (r.percentage ?? 0)) / studentMap[key].submitted * 10
                ) / 10
              }
            }
          } catch {}
        }
      }

      setExamStats(stats)
      setStudentStats(Object.values(studentMap).sort((a, b) => b.avg_score - a.avg_score))
    } catch (err) {
      console.error('Failed to load analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  // Overview stats
  const totalExams = examStats.length
  const totalSubmissions = examStats.reduce((s, e) => s + e.submitted, 0)
  const totalPassed = examStats.reduce((s, e) => s + e.passed, 0)
  const overallPassRate = totalSubmissions > 0 ? Math.round((totalPassed / totalSubmissions) * 100) : 0
  const avgScore = examStats.length > 0
    ? Math.round(examStats.reduce((s, e) => s + e.avg_score, 0) / examStats.length * 10) / 10
    : 0

  // Subject stats
  const subjectMap: Record<string, { submitted: number; passed: number; avgScore: number; count: number }> = {}
  for (const e of examStats) {
    if (!subjectMap[e.subject]) subjectMap[e.subject] = { submitted: 0, passed: 0, avgScore: 0, count: 0 }
    subjectMap[e.subject].submitted += e.submitted
    subjectMap[e.subject].passed += e.passed
    subjectMap[e.subject].avgScore += e.avg_score
    subjectMap[e.subject].count++
  }
  const subjectStats = Object.entries(subjectMap).map(([subject, data]) => ({
    subject,
    submitted: data.submitted,
    passed: data.passed,
    passRate: data.submitted > 0 ? Math.round((data.passed / data.submitted) * 100) : 0,
    avgScore: data.count > 0 ? Math.round(data.avgScore / data.count * 10) / 10 : 0,
  })).sort((a, b) => b.passRate - a.passRate)

  const classes = [...new Set(examStats.map(e => e.class_level))].sort()
  const subjects = [...new Set(examStats.map(e => e.subject))].sort()

  const filteredExams = examStats.filter(e => {
    if (classFilter && e.class_level !== classFilter) return false
    if (subjectFilter && e.subject !== subjectFilter) return false
    return true
  })

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function getPassRateColor(rate: number) {
    if (rate >= 70) return '#1a6b4a'
    if (rate >= 50) return '#d97706'
    return '#dc2626'
  }

  function getPassRateBg(rate: number) {
    if (rate >= 70) return '#e8f5ee'
    if (rate >= 50) return '#fffbeb'
    return '#fef2f2'
  }

  function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
    return (
      <div style={{ flex: 1, height: 8, background: '#e5e5e0', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, (value / max) * 100)}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 600, marginBottom: '2rem' }}>Analytics</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[1,2,3,4].map(i => <div key={i} style={{ height: 100, background: 'white', borderRadius: 12, border: '1px solid #e5e5e0', animation: 'pulse 1.5s infinite' }} />)}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        <p style={{ color: '#6b6b65', textAlign: 'center', marginTop: '2rem' }}>Loading analytics data…</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em', color: '#1a1a18', marginBottom: '0.25rem' }}>
          Analytics
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#6b6b65' }}>
          Performance insights across all exams and students
        </p>
      </div>

      {/* Overview stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {[
          { label: 'Total exams', value: totalExams, icon: '📋', color: '#1a6b4a', bg: '#e8f5ee' },
          { label: 'Total submissions', value: totalSubmissions, icon: '✅', color: '#1e40af', bg: '#eff6ff' },
          { label: 'Total passed', value: totalPassed, icon: '🏆', color: '#1a6b4a', bg: '#e8f5ee' },
          { label: 'Overall pass rate', value: `${overallPassRate}%`, icon: '📈', color: getPassRateColor(overallPassRate), bg: getPassRateBg(overallPassRate) },
          { label: 'Avg score', value: `${avgScore}%`, icon: '⭐', color: '#7e22ce', bg: '#fdf4ff' },
        ].map(s => (
          <div key={s.label} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 40, height: 40, background: s.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>{s.icon}</div>
              <div>
                <p style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.2rem' }}>{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden', marginBottom: '1.5rem' }}>
        {([
          { key: 'overview', label: '📊 Overview' },
          { key: 'exams', label: '📋 By Exam' },
          { key: 'students', label: '👤 By Student' },
          { key: 'subjects', label: '📚 By Subject' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, padding: '0.875rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65', transition: 'all 0.15s' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* No data state */}
      {examStats.length === 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 16, padding: '4rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No data yet</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Analytics will appear once students start taking exams.</p>
        </div>
      )}

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && examStats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Subject performance */}
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e5e0', background: '#f7f7f5' }}>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>Subject Performance Overview</p>
            </div>
            {subjectStats.map(s => (
              <div key={s.subject} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px 80px 80px', gap: '1rem', padding: '1rem 1.5rem', alignItems: 'center', borderTop: '1px solid #e5e5e0', fontSize: '0.875rem' }}>
                <span style={{ fontWeight: 500, color: '#1a1a18' }}>{s.subject}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <ScoreBar value={s.passRate} color={getPassRateColor(s.passRate)} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getPassRateColor(s.passRate), minWidth: 40 }}>{s.passRate}%</span>
                </div>
                <span style={{ color: '#6b6b65', fontSize: '0.8rem', textAlign: 'center' }}>{s.submitted} sat</span>
                <span style={{ color: '#1a6b4a', fontSize: '0.8rem', textAlign: 'center' }}>{s.passed} passed</span>
                <span style={{ color: '#7e22ce', fontSize: '0.8rem', textAlign: 'center' }}>{s.avgScore}% avg</span>
              </div>
            ))}
          </div>

          {/* Top 5 students */}
          {studentStats.length > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e5e0', background: '#f7f7f5' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>🏆 Top 5 Performing Students</p>
              </div>
              {studentStats.slice(0, 5).map((s, i) => (
                <div key={s.student_name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px 80px', gap: '1rem', padding: '0.875rem 1.5rem', alignItems: 'center', borderTop: '1px solid #e5e5e0', fontSize: '0.875rem' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: i < 3 ? '#fffbeb' : '#f7f7f5', color: i === 0 ? '#d97706' : i === 1 ? '#6b6b65' : i === 2 ? '#92400e' : '#a0a09a', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </span>
                  <span style={{ fontWeight: 500, color: '#1a1a18' }}>{s.student_name}</span>
                  <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{s.class_level} {s.class_arm}</span>
                  <span style={{ color: '#6b6b65', fontSize: '0.8rem', textAlign: 'center' }}>{s.submitted} exams</span>
                  <span style={{ color: '#1a6b4a', fontSize: '0.8rem', textAlign: 'center' }}>{s.passed} passed</span>
                  <span style={{ fontWeight: 600, color: getPassRateColor(s.avg_score), fontSize: '0.875rem', textAlign: 'center' }}>{s.avg_score}%</span>
                </div>
              ))}
            </div>
          )}

          {/* Bottom 5 students */}
          {studentStats.length > 5 && (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e5e0', background: '#fef2f2' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>⚠️ Students Needing Support</p>
                <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>Lowest performing — may need additional help</p>
              </div>
              {[...studentStats].reverse().slice(0, 5).map((s, i) => (
                <div key={s.student_name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 80px 80px 80px', gap: '1rem', padding: '0.875rem 1.5rem', alignItems: 'center', borderTop: '1px solid #e5e5e0', fontSize: '0.875rem' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i + 1}
                  </span>
                  <span style={{ fontWeight: 500, color: '#1a1a18' }}>{s.student_name}</span>
                  <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{s.class_level} {s.class_arm}</span>
                  <span style={{ color: '#6b6b65', fontSize: '0.8rem', textAlign: 'center' }}>{s.submitted} exams</span>
                  <span style={{ color: '#dc2626', fontSize: '0.8rem', textAlign: 'center' }}>{s.passed} passed</span>
                  <span style={{ fontWeight: 600, color: getPassRateColor(s.avg_score), fontSize: '0.875rem', textAlign: 'center' }}>{s.avg_score}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* EXAMS TAB */}
      {activeTab === 'exams' && examStats.length > 0 && (
        <div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)}
              style={{ padding: '0.5rem 0.875rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#1a1a18', cursor: 'pointer', outline: 'none' }}>
              <option value="">All classes</option>
              {classes.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}
              style={{ padding: '0.5rem 0.875rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#1a1a18', cursor: 'pointer', outline: 'none' }}>
              <option value="">All subjects</option>
              {subjects.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 80px 100px', gap: '0.5rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: '#f7f7f5', borderBottom: '1px solid #e5e5e0' }}>
              <span>Exam</span><span>Date</span><span>Sat</span><span>Passed</span><span>Failed</span><span>Avg</span><span>High</span><span>Pass rate</span>
            </div>
            {filteredExams.map(e => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 80px 100px', gap: '0.5rem', padding: '1rem 1.25rem', alignItems: 'center', borderTop: '1px solid #e5e5e0', fontSize: '0.825rem' }}>
                <div>
                  <p style={{ fontWeight: 500, color: '#1a1a18', marginBottom: '0.2rem' }}>{e.title}</p>
                  <p style={{ fontSize: '0.75rem', color: '#6b6b65' }}>{e.subject} · {e.class_level}</p>
                </div>
                <span style={{ color: '#6b6b65', fontSize: '0.75rem' }}>{formatDate(e.scheduled_at)}</span>
                <span style={{ color: '#1a1a18', fontWeight: 500, textAlign: 'center' }}>{e.submitted}</span>
                <span style={{ color: '#1a6b4a', fontWeight: 500, textAlign: 'center' }}>{e.passed}</span>
                <span style={{ color: '#dc2626', fontWeight: 500, textAlign: 'center' }}>{e.failed}</span>
                <span style={{ color: '#7e22ce', fontWeight: 500, textAlign: 'center' }}>{e.avg_score}%</span>
                <span style={{ color: '#1a6b4a', textAlign: 'center' }}>{e.highest}%</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, height: 6, background: '#e5e5e0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${e.pass_rate}%`, height: '100%', background: getPassRateColor(e.pass_rate), borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: getPassRateColor(e.pass_rate), minWidth: 32 }}>{e.pass_rate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STUDENTS TAB */}
      {activeTab === 'students' && studentStats.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '0.4fr 2fr 0.8fr 0.8fr 0.8fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: '#f7f7f5', borderBottom: '1px solid #e5e5e0' }}>
            <span>Rank</span><span>Student</span><span>Class</span><span>Exams</span><span>Passed</span><span>Avg score</span>
          </div>
          {studentStats.map((s, i) => (
            <div key={s.student_name} style={{ display: 'grid', gridTemplateColumns: '0.4fr 2fr 0.8fr 0.8fr 0.8fr 1fr', gap: '0.75rem', padding: '0.875rem 1.25rem', alignItems: 'center', borderTop: '1px solid #e5e5e0', fontSize: '0.875rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a0a09a' }}>{i + 1}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f5ee', color: '#0f4a32', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {s.student_name.charAt(0)}
                </span>
                <span style={{ fontWeight: 500, color: '#1a1a18' }}>{s.student_name}</span>
              </span>
              <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{s.class_level} {s.class_arm}</span>
              <span style={{ color: '#6b6b65', textAlign: 'center' }}>{s.submitted}</span>
              <span style={{ color: '#1a6b4a', textAlign: 'center' }}>{s.passed}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: 6, background: '#e5e5e0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${s.avg_score}%`, height: '100%', background: getPassRateColor(s.avg_score), borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: getPassRateColor(s.avg_score), minWidth: 36 }}>{s.avg_score}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUBJECTS TAB */}
      {activeTab === 'subjects' && subjectStats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {subjectStats.map(s => (
            <div key={s.subject} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.25rem 1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{s.subject}</h3>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: 20, background: getPassRateBg(s.passRate), color: getPassRateColor(s.passRate) }}>
                  {s.passRate}% pass rate
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
                {[
                  { label: 'Students sat', value: s.submitted, color: '#1a1a18' },
                  { label: 'Passed', value: s.passed, color: '#1a6b4a' },
                  { label: 'Failed', value: s.submitted - s.passed, color: '#dc2626' },
                  { label: 'Avg score', value: `${s.avgScore}%`, color: '#7e22ce' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: '#f7f7f5', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, color: stat.color, letterSpacing: '-0.02em' }}>{stat.value}</p>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.25rem' }}>{stat.label}</p>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b6b65', marginBottom: '0.375rem' }}>
                  <span>Pass rate</span>
                  <span>{s.passRate}%</span>
                </div>
                <div style={{ height: 10, background: '#e5e5e0', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${s.passRate}%`, height: '100%', background: getPassRateColor(s.passRate), borderRadius: 5, transition: 'width 0.8s ease' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
