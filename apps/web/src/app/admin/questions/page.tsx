'use client'
import { useRouter } from 'next/navigation'
import styles from '../overview.module.css'

export default function AdminQuestionsPage() {
  const router = useRouter()
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Question Bank</h1>
          <p className={styles.subtitle}>Manage all exam questions</p>
        </div>
        <button className={styles.newExamBtn} onClick={() => router.push('/teacher/questions/new')}>
          + New question
        </button>
      </div>
      <div className={styles.section}>
        <p style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
          Question bank management is available in the Teacher Portal.
        </p>
      </div>
    </div>
  )
}