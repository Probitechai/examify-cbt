'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './exams.module.css'

interface Exam {
  id: string
  title: string
  subject: string
  class_level: string
  duration_minutes: number
  scheduled_at: string
  ends_at: string
  status: string
  question_count: number
  created_by_name: string
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
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('examify_school') ?? 'greensprings'
    }
  } catch {}
  return 'greensprings'
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Live',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  draft: 'Draft'
}

export default function ExamsPage() {
  const router = useRouter()
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    loadExams()
  }, [])

  async function loadExams() {
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'X-School-Subdomain': getSubdomain(),
          'Content-Type': 'application/json'
        }
      })
      const data = await res.json()
      setExams(data.exams ?? [])
    } catch (err) {
      console.error('Failed to load exams:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(examId: string, title: string) {
    if (!window.confirm(`Are you sure you want to cancel "${title}"? This cannot be undone.`)) return
    setDeleting(examId)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/exams/${examId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'X-School-Subdomain': getSubdomain(),
          'Content-Type': 'application/json'
        }
      })
      if (res.ok) {
        setExams(prev => prev.filter(e => e.id !== examId))
      }
    } catch (err) {
      console.error('Failed to delete exam:', err)
    } finally {
      setDeleting(null)
    }
  }

  const filtered = filter === 'all' ? exams : exams.filter(e => e.status === filter)

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-NG', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
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
          <p className={styles.subtitle}>
            {loading ? 'Loading...' : `${exams.length} exam${exams.length !== 1 ? 's' : ''} total`}
          </p>
        </div>
        <button className={styles.newBtn} onClick={() => router.push('/admin/exams/new')}>
          + New exam
        </button>
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

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: 'white', borderRadius: 12, height: 100, border: '1px solid #e5e5e0', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
          <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            {exams.length === 0 ? 'No exams yet' : 'No exams match this filter'}
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            {exams.length === 0 ? 'Create your first exam to get started.' : 'Try selecting a different filter.'}
          </p>
          {exams.length === 0 && (
            <button className={styles.newBtn} onClick={() => router.push('/admin/exams/new')}>
              + Create first exam
            </button>
          )}
        </div>
      ) : (
        <div className={styles.examList}>
          {filtered.map(exam => (
            <div key={exam.id} className={styles.examCard}>
              <div className={styles.examCardLeft}>
                <div className={styles.examCardTop}>
                  <span className={`${styles.tag} ${getStatusStyle(exam.status)}`}>
                    {STATUS_LABELS[exam.status] ?? exam.status}
                  </span>
                  <span className={styles.subject}>{exam.subject}</span>
                  <span className={styles.classBadge}>{exam.class_level}</span>
                </div>
                <h2 className={styles.examTitle}>{exam.title}</h2>
                <div className={styles.examMeta}>
                  <span>⏱ {exam.duration_minutes} min</span>
                  <span>📋 {exam.question_count ?? 0} questions</span>
                  <span>📅 {formatDate(exam.scheduled_at)}</span>
                  {exam.created_by_name && <span>👤 {exam.created_by_name}</span>}
                </div>
              </div>
              <div className={styles.examCardRight}>
                <button
                  className={styles.resultsBtn}
                  onClick={() => router.push('/admin/results')}
                >
                  Results
                </button>
                {exam.status !== 'completed' && (
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(exam.id, exam.title)}
                    disabled={deleting === exam.id}
                  >
                    {deleting === exam.id ? '...' : 'Delete'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
