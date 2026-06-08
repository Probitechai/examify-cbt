'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'
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
  const token = document.cookie.split(';')
    .find(c => c.trim().startsWith('examify_token='))?.split('=')[1]
  if (!token) return

  const subdomain = localStorage.getItem('examify_school') ?? 'greensprings'

  async function loadStats() {
    try {
      // Fetch real exams
      const examsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-School-Subdomain': subdomain,
          'Content-Type': 'application/json'
        }
      })
      const examsData = await examsRes.json()
      const exams = examsData.exams ?? []

      // Fetch real students count
      const usersRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users?role=student`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-School-Subdomain': subdomain,
          'Content-Type': 'application/json'
        }
      })
      const usersData = await usersRes.json()
      const students = usersData.users ?? []

      const activeExams = exams.filter((e: any) => e.status === 'active')
      const completedExams = exams.filter((e: any) => e.status === 'completed')

      setStats({
        totalStudents: students.length,
        activeExams: activeExams.length,
        completedExams: completedExams.length,
        avgPassRate: 0,
        recentExams: exams.slice(0, 4).map((e: any) => ({
          id: e.id,
          title: e.title,
          subject: e.subject,
          status: e.status,
          scheduledAt: e.scheduled_at,
          submitted: 0,
          total: students.length,
        }))
      })
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setLoading(false)
    }
  }

  loadStats()
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
