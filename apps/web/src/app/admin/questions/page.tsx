'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './questions.module.css'
import AddQuestionModal from './AddQuestionModal2'

interface Question {
  id: string
  type: string
  subject: string
  class_level: string
  topic: string | null
  question_text: string
  correct_answer: string
  marks: number
  difficulty: string | null
  created_by_name: string
  created_at: string
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
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? 'greensprings'
  } catch {}
  return 'greensprings'
}

export default function QuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => { loadQuestions() }, [])

  async function loadQuestions() {
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'X-School-Subdomain': getSubdomain(),
          'Content-Type': 'application/json',
        }
      })
      const data = await res.json()
      setQuestions(data.questions ?? [])
    } catch (err) {
      console.error('Failed to load questions:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!selected.length) return
    if (!window.confirm(`Delete ${selected.length} question(s)? This cannot be undone.`)) return
    try {
      await Promise.all(selected.map(id =>
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'X-School-Subdomain': getSubdomain(),
          }
        })
      ))
      setSelected([])
      loadQuestions()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const subjects = [...new Set(questions.map(q => q.subject))].sort()
  const types = [...new Set(questions.map(q => q.type))].sort()

  const filtered = questions.filter(q => {
    if (search && !q.question_text.toLowerCase().includes(search.toLowerCase()) &&
        !q.subject.toLowerCase().includes(search.toLowerCase())) return false
    if (subjectFilter && q.subject !== subjectFilter) return false
    if (typeFilter && q.type !== typeFilter) return false
    return true
  })

  function getTypeLabel(type: string) {
    const labels: Record<string, string> = {
      mcq: 'MCQ',
      true_false: 'True/False',
      short_answer: 'Short Answer',
      essay: 'Essay',
    }
    return labels[type] ?? type
  }

  function getTypeBadgeStyle(type: string) {
    const colors: Record<string, { bg: string; color: string }> = {
      mcq: { bg: '#eff6ff', color: '#1e40af' },
      true_false: { bg: '#e8f5ee', color: '#0f4a32' },
      short_answer: { bg: '#fffbeb', color: '#d97706' },
      essay: { bg: '#fdf4ff', color: '#7e22ce' },
    }
    return colors[type] ?? { bg: '#f1f1ef', color: '#6b6b65' }
  }

  function getDifficultyStyle(diff: string | null) {
    if (diff === 'easy') return { bg: '#e8f5ee', color: '#0f4a32' }
    if (diff === 'hard') return { bg: '#fef2f2', color: '#dc2626' }
    return { bg: '#fffbeb', color: '#d97706' }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Question Bank</h1>
          <p className={styles.subtitle}>
            {loading ? 'Loading…' : `${questions.length} questions across all subjects`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {selected.length > 0 && (
            <button onClick={handleDelete}
              style={{ padding: '0.625rem 1.25rem', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#dc2626', cursor: 'pointer' }}>
              🗑 Delete ({selected.length})
            </button>
          )}
          <button className={styles.addBtn} onClick={() => setShowModal(true)}>
            + New question
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' as const }}>
        <input
          className={styles.search}
          placeholder="Search questions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={styles.sel} value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className={styles.sel} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{getTypeLabel(t)}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <span style={{ width: 32 }}></span>
          <span>Question</span>
          <span>Subject</span>
          <span>Type</span>
          <span>Difficulty</span>
          <span>Marks</span>
          <span>Added</span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            {[1,2,3,4,5].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>❓</div>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
              {questions.length === 0 ? 'No questions yet' : 'No questions match this filter'}
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              {questions.length === 0 ? 'Add your first question to get started.' : 'Try a different filter.'}
            </p>
            {questions.length === 0 && (
              <button className={styles.addBtn} onClick={() => setShowModal(true)}>+ Add first question</button>
            )}
          </div>
        ) : filtered.map(q => {
          const typeBadge = getTypeBadgeStyle(q.type)
          const diffBadge = getDifficultyStyle(q.difficulty)
          return (
            <div key={q.id} className={styles.tableRow} style={{ background: selected.includes(q.id) ? '#f0faf4' : undefined }}>
              <span>
                <input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggleSelect(q.id)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#1a6b4a' }} />
              </span>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5 }}>
                {q.question_text.length > 100 ? q.question_text.slice(0, 100) + '…' : q.question_text}
                {q.topic && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>📌 {q.topic}</span>}
              </span>
              <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)' }}>{q.subject}</span>
              <span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 20, background: typeBadge.bg, color: typeBadge.color }}>
                  {getTypeLabel(q.type)}
                </span>
              </span>
              <span>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 20, background: diffBadge.bg, color: diffBadge.color, textTransform: 'capitalize' as const }}>
                  {q.difficulty ?? 'medium'}
                </span>
              </span>
              <span style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', textAlign: 'center' as const }}>{q.marks}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{formatDate(q.created_at)}</span>
            </div>
          )
        })}
      </div>

      {showModal && (
        <AddQuestionModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadQuestions() }}
        />
      )}
    </div>
  )
}
