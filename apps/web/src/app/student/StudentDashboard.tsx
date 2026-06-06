'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import styles from './student.module.css'

interface ExamSummary {
  id: string
  title: string
  subject: string
  durationMinutes: number
  scheduledAt: string
  scheduled_at: string
  endsAt: string
  ends_at: string
  status: string
  sessionStatus: string | null
  session_status: string | null
  duration_minutes: number
}
export default function StudentDashboard() {
  const router = useRouter()
  const { user, isLoading, hydrate, logout } = useAuthStore()
  const [exams, setExams] = useState<ExamSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role !== 'student') router.replace('/admin')
  }, [user, isLoading, router])

  useEffect(() => {
    if (!user) return
    api.getAvailableExams()
      .then((d: any) => setExams(d.exams ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user])

  function getStatusInfo(exam: ExamSummary) {
    if (exam.sessionStatus === 'submitted' || exam.sessionStatus === 'timed_out')
      return { label: 'Completed', color: styles.tagDone }
    if (exam.sessionStatus === 'in_progress')
      return { label: 'In progress', color: styles.tagActive }
    if (exam.status === 'active')
      return { label: 'Open now', color: styles.tagOpen }
    return { label: 'Scheduled', color: styles.tagScheduled }
  }

  function canStart(exam: ExamSummary) {
    return exam.status === 'active' &&
      exam.sessionStatus !== 'submitted' &&
      exam.sessionStatus !== 'timed_out'
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-NG', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  if (isLoading || !user) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <span className={styles.logo}>E</span>
            <span className={styles.schoolName}>{user.school?.name ?? 'Examify'}</span>
          </div>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>{user.fullName.charAt(0)}</div>
            <div>
              <p className={styles.userName}>{user.fullName}</p>
              <p className={styles.userMeta}>{user.classLevel} {user.classArm}</p>
            </div>
            <button
              className={styles.logoutBtn}
              onClick={() => { logout(); router.push('/login') }}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.greeting}>
          <h1>My Exams</h1>
          <p>All examinations scheduled for you this term</p>
        </div>

        {loading ? (
          <div className={styles.loadingExams}>
            {[1, 2, 3].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : exams.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📋</div>
            <p>No exams scheduled yet. Check back later.</p>
          </div>
        ) : (
          <div className={styles.examGrid}>
            {exams.map(exam => {
              const { label, color } = getStatusInfo(exam)
              return (
                <div key={exam.id} className={styles.examCard}>
                  <div className={styles.examTop}>
                    <div className={styles.examSubject}>{exam.subject}</div>
                    <span className={`${styles.tag} ${color}`}>{label}</span>
                  </div>
                  <h2 className={styles.examTitle}>{exam.title}</h2>
                  <div className={styles.examMeta}>
                    <span>⏱ {exam.durationMinutes ?? exam.duration_minutes} minutes</span>
                    <span>📅 {formatDate(exam.scheduledAt ?? exam.scheduled_at)}</span>
                  </div>
                  {canStart(exam) ? (
                    <button
                      className={styles.startBtn}
                      onClick={() => router.push(`/student/exam/${exam.id}`)}
                    >
                      {exam.sessionStatus === 'in_progress' ? 'Continue exam →' : 'Start exam →'}
                    </button>
                  ) : exam.sessionStatus === 'submitted' ? (
                    <button
                      className={styles.resultBtn}
                      onClick={() => router.push(`/student`)}
                    >
                      View result
                    </button>
                  ) : (
                    <p className={styles.scheduledNote}>
                      Opens {formatDate(exam.scheduledAt)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
