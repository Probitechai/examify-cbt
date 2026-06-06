'use client'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'
import styles from './teacher.dashboard.module.css'

const MY_CLASSES = [
  { classLevel: 'SS1', classArm: 'A', subject: 'English Language', students: 38, upcomingExam: 'Third Term English', examDate: 'Thu 5 Jun' },
  { classLevel: 'SS2', classArm: 'A', subject: 'English Language', students: 42, upcomingExam: 'Third Term English', examDate: 'Today' },
  { classLevel: 'SS2', classArm: 'B', subject: 'English Language', students: 40, upcomingExam: 'Third Term English', examDate: 'Today' },
  { classLevel: 'SS3', classArm: 'Science', subject: 'English Language', students: 34, upcomingExam: null, examDate: null },
]

const RECENT_ACTIVITY = [
  { type: 'result', text: 'SS2A English results published', time: '2 hours ago' },
  { type: 'question', text: '12 new questions added to bank', time: 'Yesterday' },
  { type: 'exam', text: 'SS2B English exam scheduled', time: '2 days ago' },
  { type: 'result', text: 'SS1A English results published', time: '3 days ago' },
]

export default function TeacherDashboard() {
  const router = useRouter()
  const { user } = useAuthStore()

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{greeting}, {user?.fullName.split(' ').slice(-1)[0]}</h1>
          <p className={styles.subtitle}>You teach English Language across 4 classes this term.</p>
        </div>
        <button className={styles.newBtn} onClick={() => router.push('/teacher/questions/new')}>
          <i className="ti ti-plus" aria-hidden="true" /> New question
        </button>
      </div>

      <div className={styles.statsRow}>
        {[
          { label: 'My classes', value: '4', icon: 'ti-school' },
          { label: 'Questions in bank', value: '142', icon: 'ti-clipboard-list' },
          { label: 'Exams this term', value: '6', icon: 'ti-calendar-event' },
          { label: 'Avg. class pass rate', value: '71%', icon: 'ti-chart-bar' },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <i className={`ti ${s.icon} ${styles.statIcon}`} aria-hidden="true" />
            <div>
              <p className={styles.statLabel}>{s.label}</p>
              <p className={styles.statValue}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.twoCol}>
        <div>
          <h2 className={styles.sectionTitle}>My classes</h2>
          <div className={styles.classGrid}>
            {MY_CLASSES.map(cls => (
              <div key={`${cls.classLevel}${cls.classArm}`} className={styles.classCard}>
                <div className={styles.classTop}>
                  <div className={styles.classBadge}>{cls.classLevel} {cls.classArm}</div>
                  <span className={styles.classSubject}>{cls.subject}</span>
                </div>
                <div className={styles.classMeta}>
                  <span><i className="ti ti-users" aria-hidden="true" /> {cls.students} students</span>
                </div>
                {cls.upcomingExam ? (
                  <div className={styles.examChip}>
                    <i className="ti ti-calendar-event" aria-hidden="true" />
                    <span>{cls.upcomingExam} · {cls.examDate}</span>
                  </div>
                ) : (
                  <div className={styles.noExam}>No exam scheduled</div>
                )}
                <div className={styles.classActions}>
                  <button className={styles.actionBtn} onClick={() => router.push('/teacher/results')}>
                    Results
                  </button>
                  <button className={styles.actionBtn} onClick={() => router.push('/teacher/exams/new')}>
                    Set exam
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Recent activity</h2>
          <div className={styles.activityList}>
            {RECENT_ACTIVITY.map((a, i) => (
              <div key={i} className={styles.activityItem}>
                <div className={`${styles.actIcon} ${styles[`act_${a.type}`]}`}>
                  <i className={`ti ${a.type === 'result' ? 'ti-chart-bar' : a.type === 'question' ? 'ti-clipboard-list' : 'ti-calendar-event'}`} aria-hidden="true" />
                </div>
                <div>
                  <p className={styles.actText}>{a.text}</p>
                  <p className={styles.actTime}>{a.time}</p>
                </div>
              </div>
            ))}
          </div>

          <h2 className={styles.sectionTitle} style={{ marginTop: '1.5rem' }}>Quick actions</h2>
          <div className={styles.quickGrid}>
            {[
              { label: 'Add question', icon: 'ti-plus', href: '/teacher/questions/new' },
              { label: 'Set exam', icon: 'ti-calendar-event', href: '/teacher/exams/new' },
              { label: 'View results', icon: 'ti-chart-bar', href: '/teacher/results' },
              { label: 'Question bank', icon: 'ti-clipboard-list', href: '/teacher/questions' },
            ].map(q => (
              <button key={q.label} className={styles.quickBtn} onClick={() => router.push(q.href)}>
                <i className={`ti ${q.icon}`} aria-hidden="true" />
                <span>{q.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
