'use client'
import { useRouter } from 'next/navigation'
import styles from '../../overview.module.css'

export default function NewExamPage() {
  const router = useRouter()
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>New Exam</h1>
          <p className={styles.subtitle}>Create a new examination</p>
        </div>
        <button className={styles.newExamBtn} onClick={() => router.back()}>
          ← Back
        </button>
      </div>
      <div className={styles.section}>
        <p style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
          Exam creation is available in the Teacher Portal. Go to Teacher → Exams → New Exam.
        </p>
        <button 
          className={styles.newExamBtn} 
          style={{ margin: '0 2rem' }}
          onClick={() => router.push('/teacher/exams/new')}
        >
          Go to Teacher Portal →
        </button>
      </div>
    </div>
  )
}