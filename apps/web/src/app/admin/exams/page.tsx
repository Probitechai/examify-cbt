'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './exams.module.css'

const MOCK_EXAMS = [
  { id: '1', title: 'Third Term English Examination', subject: 'English Language', classLevel: 'SS2', classArms: ['A', 'B'], durationMinutes: 60, scheduledAt: new Date().toISOString(), status: 'active', questionCount: 50, submitted: 78, total: 104 },
  { id: '2', title: 'Third Term Mathematics Examination', subject: 'Mathematics', classLevel: 'SS2', classArms: ['A', 'B'], durationMinutes: 90, scheduledAt: new Date().toISOString(), status: 'active', questionCount: 60, submitted: 45, total: 104 },
  { id: '3', title: 'Third Term Chemistry Examination', subject: 'Chemistry', classLevel: 'SS2', classArms: null, durationMinutes: 60, scheduledAt: new Date(Date.now() - 86400000 * 2).toISOString(), status: 'completed', questionCount: 50, submitted: 102, total: 104 },
  { id: '4', title: 'Third Term Biology Examination', subject: 'Biology', classLevel: 'SS2', classArms: null, durationMinutes: 60, scheduledAt: new Date(Date.now() - 86400000 * 4).toISOString(), status: 'completed', questionCount: 50, submitted: 104, total: 104 },
  { id: '5', title: 'Third Term Physics Examination', subject: 'Physics', classLevel: 'SS2', classArms: ['Science'], durationMinutes: 90, scheduledAt: new Date(Date.now() + 86400000 * 2).toISOString(), status: 'scheduled', questionCount: 60, submitted: 0, total: 62 },
]

const STATUS_LABELS: Record<string, string> = { active: 'Live', scheduled: 'Scheduled', completed: 'Completed', cancelled: 'Cancelled', draft: 'Draft' }

export default function ExamsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState('all')

  const filtered = filter === 'all' ? MOCK_EXAMS : MOCK_EXAMS.filter(e => e.status === filter)

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function getStatusStyle(status: string) {
    if (status === 'active') return styles.tagLive
    if (status === 'scheduled') return styles.tagScheduled
    if (status === 'completed') return styles.tagDone
    return styles.tagDraft
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Exams</h1>
          <p className={styles.subtitle}>Create and manage all examinations</p>
        </div>
        <button className={styles.newBtn} onClick={() => router.push('/admin/exams/new')}>+ New exam</button>
      </div>

      <div className={styles.filterRow}>
        {['all', 'active', 'scheduled', 'completed', 'draft'].map(f => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All exams' : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      <div className={styles.examList}>
        {filtered.map(exam => (
          <div key={exam.id} className={styles.examRow}>
            <div className={styles.examMain}>
              <div className={styles.examTop}>
                <span className={`${styles.tag} ${getStatusStyle(exam.status)}`}>{STATUS_LABELS[exam.status]}</span>
                <span className={styles.examSubject}>{exam.subject} · {exam.classLevel} {exam.classArms ? exam.classArms.join(', ') : '(all arms)'}</span>
              </div>
              <h2 className={styles.examTitle}>{exam.title}</h2>
              <div className={styles.examMeta}>
                <span>⏱ {exam.durationMinutes} min</span>
                <span>📋 {exam.questionCount} questions</span>
                <span>📅 {formatDate(exam.scheduledAt)}</span>
              </div>
            </div>

            {(exam.status === 'active' || exam.status === 'completed') && (
              <div className={styles.examProgress}>
                <p className={styles.progressLabel}>Submissions</p>
                <p className={styles.progressCount}>{exam.submitted}<span>/{exam.total}</span></p>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${(exam.submitted / exam.total) * 100}%` }} />
                </div>
              </div>
            )}

            <div className={styles.examActions}>
              {exam.status === 'active' && (
                <button className={styles.liveBtn}>● Live monitoring</button>
              )}
              <button className={styles.actionBtn} onClick={() => router.push(`/admin/results/${exam.id}`)}>
                Results
              </button>
              <button className={styles.actionBtn}>Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
