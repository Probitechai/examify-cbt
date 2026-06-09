'use client'
import { useState, useEffect } from 'react'

interface Exam {
  id: string
  title: string
  subject: string
  class_level: string
  class_arms: string[] | null
  duration_minutes: number
  scheduled_at: string
  ends_at: string
  status: string
  question_count: number
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  active:    { bg: '#e8f5ee', color: '#0f4a32', border: '#1a6b4a' },
  scheduled: { bg: '#eff6ff', color: '#1e40af', border: '#3b82f6' },
  completed: { bg: '#f1f1ef', color: '#6b6b65', border: '#d0d0c8' },
  draft:     { bg: '#fffbeb', color: '#92400e', border: '#fbbf24' },
  cancelled: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
}

const SUBJECT_COLORS = [
  { bg: '#eff6ff', color: '#1e40af' },
  { bg: '#f0fdf4', color: '#166534' },
  { bg: '#fdf4ff', color: '#7e22ce' },
  { bg: '#fff7ed', color: '#9a3412' },
  { bg: '#fef2f2', color: '#991b1b' },
  { bg: '#ecfeff', color: '#155e75' },
  { bg: '#fefce8', color: '#854d0e' },
  { bg: '#f0fdfa', color: '#134e4a' },
]

export default function TimetablePage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'week' | 'list'>('week')
  const [currentWeek, setCurrentWeek] = useState(new Date())
  const [classFilter, setClassFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

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
        'X-School-Subdomain': localStorage.getItem('examify_school') ?? 'greensprings',
        'Content-Type': 'application/json'
      }
    })
      .then(r => r.json())
      .then(d => setExams(d.exams ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Get week dates
  function getWeekDates(date: Date) {
    const start = new Date(date)
    const day = start.getDay()
    const diff = start.getDate() - day + (day === 0 ? -6 : 1) // Monday start
    start.setDate(diff)
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }

  function prevWeek() {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() - 7)
    setCurrentWeek(d)
  }

  function nextWeek() {
    const d = new Date(currentWeek)
    d.setDate(d.getDate() + 7)
    setCurrentWeek(d)
  }

  function goToToday() {
    setCurrentWeek(new Date())
  }

  function isSameDay(d1: Date, d2: Date) {
    return d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear()
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function formatFullDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  function getSubjectColor(subject: string) {
    const index = subject.charCodeAt(0) % SUBJECT_COLORS.length
    return SUBJECT_COLORS[index]
  }

  const weekDates = getWeekDates(currentWeek)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  const filtered = exams.filter(e => {
    if (classFilter && e.class_level !== classFilter) return false
    if (statusFilter && e.status !== statusFilter) return false
    return true
  })

  const classes = [...new Set(exams.map(e => e.class_level))].sort()

  // Group exams by day for week view
  function getExamsForDay(date: Date) {
    return filtered.filter(e => isSameDay(new Date(e.scheduled_at), date))
  }

  // Sort exams by date for list view
  const sortedExams = [...filtered].sort((a, b) =>
    new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  )

  // Group list exams by date
  const groupedByDate: Record<string, Exam[]> = {}
  sortedExams.forEach(exam => {
    const dateKey = new Date(exam.scheduled_at).toDateString()
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = []
    groupedByDate[dateKey].push(exam)
  })

  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  function ExamCard({ exam, compact = false }: { exam: Exam; compact?: boolean }) {
    const status = STATUS_COLORS[exam.status] ?? STATUS_COLORS.scheduled
    const subjectColor = getSubjectColor(exam.subject)
    return (
      <div style={{
        background: subjectColor.bg,
        border: `1.5px solid ${status.border}`,
        borderRadius: '8px',
        padding: compact ? '0.5rem 0.625rem' : '0.75rem 0.875rem',
        marginBottom: '0.375rem',
        cursor: 'default',
        transition: 'transform 0.15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <p style={{ fontSize: compact ? '0.75rem' : '0.825rem', fontWeight: 600, color: subjectColor.color, lineHeight: 1.3, flex: 1 }}>
            {exam.subject}
          </p>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '20px', background: status.bg, color: status.color, border: `1px solid ${status.border}`, whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'uppercase' }}>
            {exam.status}
          </span>
        </div>
        {!compact && (
          <p style={{ fontSize: '0.78rem', color: '#1a1a18', marginBottom: '0.25rem', lineHeight: 1.3 }}>{exam.title}</p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.7rem', color: '#6b6b65' }}>
          <span>⏰ {formatTime(exam.scheduled_at)}</span>
          <span>⏱ {exam.duration_minutes}min</span>
          <span>📚 {exam.class_level} {exam.class_arms?.join(', ') ?? 'All'}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Exam Timetable
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            {loading ? 'Loading...' : `${exams.length} exams scheduled this term`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filters */}
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            style={{ padding: '0.5rem 0.875rem', background: 'white', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.825rem', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}>
            <option value="">All classes</option>
            {classes.map(c => <option key={c}>{c}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.875rem', background: 'white', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.825rem', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
          </select>
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'white', border: '1.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            {(['week', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '0.5rem 1rem', fontSize: '0.825rem', fontWeight: 500, cursor: 'pointer', border: 'none', background: view === v ? 'var(--brand)' : 'transparent', color: view === v ? 'white' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                {v === 'week' ? '📅 Week' : '📋 List'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading timetable…
        </div>
      ) : exams.length === 0 ? (
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📅</div>
          <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No exams scheduled yet</p>
          <p style={{ fontSize: '0.875rem' }}>Create exams from the Exams page to see them here.</p>
          <a href="/admin/exams/new" style={{ display: 'inline-block', marginTop: '1rem', padding: '0.625rem 1.25rem', background: 'var(--brand)', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', textDecoration: 'none' }}>
            + Create first exam
          </a>
        </div>
      ) : view === 'week' ? (
        // WEEK VIEW
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          {/* Week navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <button onClick={prevWeek} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {weekStart.toLocaleDateString('en-NG', { day: 'numeric', month: 'long' })} — {weekEnd.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={goToToday} style={{ padding: '0.375rem 0.875rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Today</button>
              <button onClick={nextWeek} style={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </div>
          </div>

          {/* Day columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: '400px' }}>
            {weekDates.map((date, i) => {
              const dayExams = getExamsForDay(date)
              const isToday = isSameDay(date, new Date())
              const isWeekend = i >= 5
              return (
                <div key={i} style={{
                  borderRight: i < 6 ? '1px solid var(--border)' : 'none',
                  background: isWeekend ? '#fafafa' : isToday ? '#f0fdf4' : 'white',
                  minHeight: '400px',
                }}>
                  {/* Day header */}
                  <div style={{
                    padding: '0.625rem 0.5rem',
                    borderBottom: '1px solid var(--border)',
                    textAlign: 'center',
                    background: isToday ? 'var(--brand)' : isWeekend ? '#f1f1ef' : 'var(--bg)',
                  }}>
                    <p style={{ fontSize: '0.72rem', fontWeight: 600, color: isToday ? 'white' : 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                      {DAY_NAMES[i]}
                    </p>
                    <p style={{ fontSize: '1.1rem', fontWeight: 600, color: isToday ? 'white' : isWeekend ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                      {date.getDate()}
                    </p>
                  </div>
                  {/* Exams for this day */}
                  <div style={{ padding: '0.5rem' }}>
                    {dayExams.length === 0 ? (
                      isWeekend ? null : (
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textAlign: 'center', padding: '0.5rem 0' }}>—</p>
                      )
                    ) : dayExams.map(exam => (
                      <ExamCard key={exam.id} exam={exam} compact />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {Object.entries(STATUS_COLORS).map(([status, colors]) => (
              <span key={status} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: colors.bg, border: `1.5px solid ${colors.border}`, flexShrink: 0 }} />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        // LIST VIEW
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {Object.keys(groupedByDate).length === 0 ? (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No exams match your filters.
            </div>
          ) : Object.entries(groupedByDate).map(([dateKey, dayExams]) => (
            <div key={dateKey}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '0.75rem' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {formatFullDate(dayExams[0].scheduled_at)}
                </p>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                  {dayExams.length} exam{dayExams.length > 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {dayExams.map(exam => {
                  const status = STATUS_COLORS[exam.status] ?? STATUS_COLORS.scheduled
                  const subjectColor = getSubjectColor(exam.subject)
                  return (
                    <div key={exam.id} style={{ background: 'white', border: `1px solid ${status.border}`, borderRadius: '12px', padding: '1.125rem 1.375rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.625rem', borderRadius: '20px', background: subjectColor.bg, color: subjectColor.color }}>
                            {exam.subject}
                          </span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.625rem', borderRadius: '20px', background: status.bg, color: status.color, border: `1px solid ${status.border}`, textTransform: 'uppercase' }}>
                            {exam.status}
                          </span>
                        </div>
                        <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>{exam.title}</p>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                          <span>⏰ {formatTime(exam.scheduled_at)} — {formatTime(exam.ends_at)}</span>
                          <span>⏱ {exam.duration_minutes} minutes</span>
                          <span>📚 {exam.class_level} {exam.class_arms?.join(', ') ?? '(all arms)'}</span>
                          <span>📋 {exam.question_count ?? 0} questions</span>
                        </div>
                      </div>
                      <a href="/admin/results" style={{ padding: '0.5rem 1rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                        View results →
                      </a>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
