'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'
import { api } from '../../lib/api'
import styles from './overview.module.css'

interface Stats {
  totalStudents: number
  activeExams: number
  completedExams: number
  avgPassRate: number
  recentExams: Array<{
    id: string
    title: string
    subject: string
    status: string
    scheduledAt: string
    submitted: number
    total: number
  }>
}

export default function AdminOverview() {
  const { user } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // In production, fetch real stats. Using mock for now.
    setTimeout(() => {
      setStats({
        totalStudents: 312,
        activeExams: 2,
        completedExams: 8,
        avgPassRate: 74,
        recentExams: [
          { id: '1', title: 'Third Term English', subject: 'English Language', status: 'active', scheduledAt: new Date().toISOString(), submitted: 78, total: 104 },
          { id: '2', title: 'Third Term Mathematics', subject: 'Mathematics', status: 'active', scheduledAt: new Date().toISOString(), submitted: 45, total: 104 },
          { id: '3', title: 'Third Term Chemistry', subject: 'Chemistry', status: 'completed', scheduledAt: new Date(Date.now() - 86400000 * 2).toISOString(), submitted: 102, total: 104 },
          { id: '4', title: 'Third Term Biology', subject: 'Biology', status: 'completed', scheduledAt: new Date(Date.now() - 86400000 * 4).toISOString(), submitted: 104, total: 104 },
        ],
      })
      setLoading(false)
    }, 600)
  }, [])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{greeting}, {user?.fullName.split(' ')[1] ?? user?.fullName}</h1>
          <p className={styles.subtitle}>Here's what's happening at your school today.</p>
        </div>
        <button className={styles.newExamBtn} onClick={() => router.push('/admin/exams/new')}>
          + New exam
        </button>
      </div>

      {loading ? (
        <div className={styles.skeletonGrid}>
          {[1,2,3,4].map(i => <div key={i} className={styles.skeleton} />)}
        </div>
      ) : stats && (
        <>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total students</p>
              <p className={styles.statValue}>{stats.totalStudents}</p>
              <p className={styles.statSub}>enrolled this term</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Active exams</p>
              <p className={`${styles.statValue} ${styles.statGreen}`}>{stats.activeExams}</p>
              <p className={styles.statSub}>running now</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Completed exams</p>
              <p className={styles.statValue}>{stats.completedExams}</p>
              <p className={styles.statSub}>this term</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Avg. pass rate</p>
              <p className={`${styles.statValue} ${stats.avgPassRate >= 60 ? styles.statGreen : styles.statAmber}`}>
                {stats.avgPassRate}%
              </p>
              <p className={styles.statSub}>across all exams</p>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recent exams</h2>
              <button className={styles.seeAll} onClick={() => router.push('/admin/exams')}>See all →</button>
            </div>
            <div className={styles.examTable}>
              <div className={styles.tableHead}>
                <span>Exam</span>
                <span>Subject</span>
                <span>Date</span>
                <span>Submissions</span>
                <span>Status</span>
                <span></span>
              </div>
              {stats.recentExams.map(exam => (
                <div key={exam.id} className={styles.tableRow}>
                  <span className={styles.examName}>{exam.title}</span>
                  <span className={styles.cell}>{exam.subject}</span>
                  <span className={styles.cell}>{formatDate(exam.scheduledAt)}</span>
                  <span className={styles.cell}>
                    <span className={styles.subBar}>
                      <span
                        className={styles.subFill}
                        style={{ width: `${(exam.submitted / exam.total) * 100}%` }}
                      />
                    </span>
                    <span className={styles.subText}>{exam.submitted}/{exam.total}</span>
                  </span>
                  <span>
                    <span className={`${styles.statusTag} ${exam.status === 'active' ? styles.statusActive : styles.statusDone}`}>
                      {exam.status === 'active' ? 'Live' : 'Done'}
                    </span>
                  </span>
                  <span>
                    <button className={styles.viewBtn} onClick={() => router.push(`/admin/results/${exam.id}`)}>
                      Results →
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.quickActions}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: '1rem' }}>Quick actions</h2>
            <div className={styles.actionGrid}>
              {[
                { label: 'Add students', desc: 'Upload or create student accounts', icon: '👤', href: '/admin/users' },
                { label: 'Create exam', desc: 'Set up a new CBT examination', icon: '📋', href: '/admin/exams/new' },
                { label: 'Add questions', desc: 'Build your question bank', icon: '❓', href: '/admin/questions/new' },
                { label: 'View results', desc: 'Analyse student performance', icon: '📊', href: '/admin/results' },
              ].map(a => (
                <button key={a.label} className={styles.actionCard} onClick={() => router.push(a.href)}>
                  <span className={styles.actionIcon}>{a.icon}</span>
                  <span className={styles.actionLabel}>{a.label}</span>
                  <span className={styles.actionDesc}>{a.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
