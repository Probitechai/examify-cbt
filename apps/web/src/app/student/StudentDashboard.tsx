'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../hooks/useAuth'
import { api } from '../lib/api'

interface ExamSummary {
  id: string
  title: string
  subject: string
  duration_minutes: number
  durationMinutes: number
  scheduled_at: string
  scheduledAt: string
  ends_at: string
  endsAt: string
  status: string
  session_status: string | null
  sessionStatus: string | null
}

interface StudentStats {
  totalExams: number
  completed: number
  passed: number
  failed: number
  avgScore: number
}

export default function StudentDashboard() {
  const router = useRouter()
  const { user, isLoading, hydrate, logout } = useAuthStore()
  const [exams, setExams] = useState<ExamSummary[]>([])
  const [stats, setStats] = useState<StudentStats>({
    totalExams: 0, completed: 0, passed: 0, failed: 0, avgScore: 0
  })
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role !== 'student') router.replace('/admin')
  }, [user, isLoading, router])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!user) return
    api.getAvailableExams()
      .then((d: any) => {
        const examList = d.exams ?? []
        setExams(examList)

        // Calculate stats
        const completed = examList.filter((e: any) =>
          e.session_status === 'submitted' || e.sessionStatus === 'submitted'
        )
        const passed = completed.filter((e: any) => e.passed)

        setStats({
          totalExams: examList.length,
          completed: completed.length,
          passed: passed.length,
          failed: completed.length - passed.length,
          avgScore: 0,
        })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user])

  function getGreeting() {
    const hour = currentTime.getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  function formatDate() {
    return currentTime.toLocaleDateString('en-NG', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
  }

  function formatTime(iso: string) {
    const date = new Date(iso)
    return date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  }

  function formatDateTime(iso: string) {
    const date = new Date(iso)
    return date.toLocaleString('en-NG', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  function isToday(iso: string) {
    const date = new Date(iso)
    const today = new Date()
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
  }

  function getSessionStatus(exam: ExamSummary) {
    return exam.session_status ?? exam.sessionStatus
  }

  function getScheduledAt(exam: ExamSummary) {
    return exam.scheduled_at ?? exam.scheduledAt
  }

  function getDuration(exam: ExamSummary) {
    return exam.duration_minutes ?? exam.durationMinutes
  }

  function canStart(exam: ExamSummary) {
    const ss = getSessionStatus(exam)
    return exam.status === 'active' && ss !== 'submitted' && ss !== 'timed_out'
  }

  function isCompleted(exam: ExamSummary) {
    const ss = getSessionStatus(exam)
    return ss === 'submitted' || ss === 'timed_out'
  }

  function isInProgress(exam: ExamSummary) {
    return getSessionStatus(exam) === 'in_progress'
  }

  // Split exams into sections
  const todayExams = exams.filter(e => isToday(getScheduledAt(e)) && canStart(e))
const availableExams = exams.filter(e => canStart(e) && !isToday(getScheduledAt(e)))
const allAvailable = exams.filter(e => canStart(e))
  const completedExams = exams.filter(e => isCompleted(e))
  const upcomingExams = exams.filter(e =>
    !canStart(e) && !isCompleted(e) && e.status === 'scheduled'
  )

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
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'var(--font-body, system-ui)' }}>

      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 36, height: 36, background: '#1a6b4a', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '1rem' }}>E</div>
            <div>
              <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a18', letterSpacing: '-0.02em' }}>Examify</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{user.school?.name}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.825rem', fontWeight: 500, color: '#1a1a18' }}>{user.fullName}</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{user.classLevel} {user.classArm}</p>
            </div>
            <div style={{ width: 38, height: 38, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>
              {initials}
            </div>
            <button
              onClick={() => { logout(); router.push('/login') }}
              style={{ fontSize: '0.825rem', color: '#6b6b65', padding: '0.375rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Welcome banner */}
        <div style={{ background: 'linear-gradient(135deg, #1a6b4a 0%, #0f4a32 100%)', borderRadius: 20, padding: '2rem 2.5rem', marginBottom: '2rem', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.375rem' }}>{formatDate()}</p>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '0.375rem' }}>
              {getGreeting()}, {user.fullName.split(' ')[0]}! 👋
            </h1>
            <p style={{ fontSize: '0.9rem', opacity: 0.85 }}>
              {allAvailable.length > 0
                ? `You have ${allAvailable.length} exam${allAvailable.length > 1 ? 's' : ''} available to take`
                : completedExams.length > 0
                ? `You have completed ${completedExams.length} exam${completedExams.length > 1 ? 's' : ''} — well done!`
                : 'No exams available at the moment. Check back later.'}
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: '1.25rem 1.75rem', textAlign: 'center', backdropFilter: 'blur(10px)' }}>
            <p style={{ fontSize: '0.72rem', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>Class</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{user.classLevel} {user.classArm}</p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total exams', value: stats.totalExams, icon: '📋', color: '#1a6b4a', bg: '#e8f5ee' },
            { label: 'Completed', value: stats.completed, icon: '✅', color: '#1e40af', bg: '#eff6ff' },
            { label: 'Passed', value: stats.passed, icon: '🏆', color: '#1a6b4a', bg: '#e8f5ee' },
            { label: 'Available now', value: allAvailable.length, icon: '⏰', color: '#d97706', bg: '#fffbeb' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 44, height: 44, background: s.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                {s.icon}
              </div>
              <div>
                <p style={{ fontSize: '1.75rem', fontWeight: 700, color: s.color, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ background: 'white', borderRadius: 14, height: 100, border: '1px solid #e5e5e0', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
          </div>
        ) : exams.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 16, padding: '4rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📚</div>
            <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No exams yet</p>
            <p style={{ fontSize: '0.9rem', color: '#6b6b65' }}>Your teacher hasn't scheduled any exams yet. Check back later.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Available exams */}
            {allAvailable.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1a1a18' }}>Available Exams</h2>
                  <span style={{ background: '#1a6b4a', color: 'white', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20 }}>{allAvailable.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {allAvailable.map(exam => (
                    <ExamCard
                      key={exam.id}
                      exam={exam}
                      type="available"
                      onStart={() => router.push(`/student/exam/${exam.id}`)}
                      formatDateTime={formatDateTime}
                      getDuration={getDuration}
                      getScheduledAt={getScheduledAt}
                      isInProgress={isInProgress}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Upcoming exams */}
            {upcomingExams.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1a1a18' }}>Upcoming Exams</h2>
                  <span style={{ background: '#3b82f6', color: 'white', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20 }}>{upcomingExams.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {upcomingExams.map(exam => (
                    <ExamCard
                      key={exam.id}
                      exam={exam}
                      type="upcoming"
                      onStart={() => {}}
                      formatDateTime={formatDateTime}
                      getDuration={getDuration}
                      getScheduledAt={getScheduledAt}
                      isInProgress={isInProgress}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed exams */}
            {completedExams.length > 0 && (
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1a1a18' }}>Completed Exams</h2>
                  <span style={{ background: '#6b6b65', color: 'white', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20 }}>{completedExams.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {completedExams.map(exam => (
                    <ExamCard
                      key={exam.id}
                      exam={exam}
                      type="completed"
                      onStart={() => {}}
                      formatDateTime={formatDateTime}
                      getDuration={getDuration}
                      getScheduledAt={getScheduledAt}
                      isInProgress={isInProgress}
                    />
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </main>
    </div>
  )
}

function ExamCard({ exam, type, onStart, formatDateTime, getDuration, getScheduledAt, isInProgress }: {
  exam: ExamSummary
  type: 'available' | 'upcoming' | 'completed'
  onStart: () => void
  formatDateTime: (iso: string) => string
  getDuration: (exam: ExamSummary) => number
  getScheduledAt: (exam: ExamSummary) => string
  isInProgress: (exam: ExamSummary) => boolean
}) {
  const inProgress = isInProgress(exam)

  const borderColor = type === 'available'
    ? inProgress ? '#d97706' : '#1a6b4a'
    : type === 'upcoming' ? '#3b82f6' : '#e5e5e0'

  const badgeBg = type === 'available'
    ? inProgress ? '#fffbeb' : '#e8f5ee'
    : type === 'upcoming' ? '#eff6ff' : '#f1f1ef'

  const badgeColor = type === 'available'
    ? inProgress ? '#d97706' : '#0f4a32'
    : type === 'upcoming' ? '#1e40af' : '#6b6b65'

  const badgeText = type === 'available'
    ? inProgress ? 'In progress' : 'Open now'
    : type === 'upcoming' ? 'Scheduled'
    : 'Completed'

  return (
    <div style={{
      background: 'white',
      border: `1.5px solid ${borderColor}`,
      borderRadius: 14,
      padding: '1.25rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      flexWrap: 'wrap',
      transition: 'box-shadow 0.15s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: badgeBg, color: badgeColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {badgeText}
          </span>
          <span style={{ fontSize: '0.78rem', color: '#6b6b65', background: '#f7f7f5', padding: '0.2rem 0.625rem', borderRadius: 20 }}>
            {exam.subject}
          </span>
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem', lineHeight: 1.3 }}>
          {exam.title}
        </h3>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#6b6b65' }}>
          <span>⏱ {getDuration(exam)} minutes</span>
          <span>📅 {formatDateTime(getScheduledAt(exam))}</span>
        </div>
      </div>

      {type === 'available' && (
        <button
          onClick={onStart}
          style={{
            padding: '0.75rem 1.5rem',
            background: inProgress ? '#d97706' : '#1a6b4a',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}>
          {inProgress ? 'Continue →' : 'Start exam →'}
        </button>
      )}

      {type === 'upcoming' && (
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '0.25rem' }}>Opens at</p>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e40af' }}>{formatDateTime(getScheduledAt(exam))}</p>
        </div>
      )}

      {type === 'completed' && (
        <div style={{ textAlign: 'center', padding: '0.5rem 1rem', background: '#f7f7f5', borderRadius: 10, flexShrink: 0 }}>
          <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '0.25rem' }}>Status</p>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a6b4a' }}>✓ Submitted</p>
        </div>
      )}
    </div>
  )
}
