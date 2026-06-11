'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? 'greensprings'
  } catch {}
  return 'greensprings'
}

function hdrs() {
  return { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}

export default function QuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions`, { headers: hdrs() })
      const data = await res.json()
      setQuestions(data.questions ?? [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  async function del() {
    if (!selected.length || !window.confirm(`Delete ${selected.length} question(s)?`)) return
    await Promise.all(selected.map(id => fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions/${id}`, { method: 'DELETE', headers: hdrs() })))
    setSelected([])
    load()
  }

  const subjects = [...new Set(questions.map(q => q.subject))].sort()
  const filtered = questions.filter(q => {
    if (search && !q.question_text.toLowerCase().includes(search.toLowerCase()) && !q.subject.toLowerCase().includes(search.toLowerCase())) return false
    if (subjectFilter && q.subject !== subjectFilter) return false
    return true
  })

  const typeLabel: Record<string, string> = { mcq: 'MCQ', true_false: 'True/False', short_answer: 'Short Answer', essay: 'Essay' }
  const typeBadge: Record<string, { bg: string; color: string }> = {
    mcq: { bg: '#eff6ff', color: '#1e40af' },
    true_false: { bg: '#e8f5ee', color: '#0f4a32' },
    short_answer: { bg: '#fffbeb', color: '#d97706' },
    essay: { bg: '#fdf4ff', color: '#7e22ce' },
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Question Bank</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>{loading ? 'Loading…' : `${questions.length} questions across all subjects`}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {selected.length > 0 && (
            <button onClick={del}
              style={{ padding: '0.625rem 1.25rem', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#dc2626', cursor: 'pointer' }}>
              🗑 Delete ({selected.length})
            </button>
          )}
          <button onClick={() => router.push('/admin/qbank/add')}
            style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            + New question
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' as const }}>
        <input
          style={{ padding: '0.625rem 0.875rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', minWidth: 240, fontFamily: 'inherit' }}
          placeholder="Search questions…" value={search} onChange={e => setSearch(e.target.value)} />
        <select
          style={{ padding: '0.625rem 0.875rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit' }}
          value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 140px 120px 70px 80px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
          <span></span><span>Question</span><span>Subject</span><span>Type</span><span>Marks</span><span>Added</span>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b6b65' }}>Loading questions…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>❓</p>
            <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>
              {questions.length === 0 ? 'No questions yet' : 'No questions match this filter'}
            </p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.25rem' }}>
              {questions.length === 0 ? 'Add your first question to get started.' : 'Try a different filter.'}
            </p>
            {questions.length === 0 && (
              <button onClick={() => router.push('/admin/qbank/add')}
                style={{ padding: '0.75rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                + Add first question
              </button>
            )}
          </div>
        ) : filtered.map(q => {
          const badge = typeBadge[q.type] ?? { bg: '#f1f1ef', color: '#6b6b65' }
          return (
            <div key={q.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 140px 120px 70px 80px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', background: selected.includes(q.id) ? '#f0faf4' : 'white' }}>
              <input type="checkbox" checked={selected.includes(q.id)}
                onChange={() => setSelected(p => p.includes(q.id) ? p.filter(x => x !== q.id) : [...p, q.id])}
                style={{ width: 16, height: 16, accentColor: '#1a6b4a', cursor: 'pointer' }} />
              <div>
                <p style={{ fontSize: '0.875rem', color: '#1a1a18', lineHeight: 1.4 }}>
                  {q.question_text.length > 120 ? q.question_text.slice(0, 120) + '…' : q.question_text}
                </p>
                {q.topic && <p style={{ fontSize: '0.72rem', color: '#a0a09a', marginTop: '0.2rem' }}>📌 {q.topic}</p>}
              </div>
              <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{q.subject}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.625rem', borderRadius: 20, background: badge.bg, color: badge.color, display: 'inline-block' }}>
                {typeLabel[q.type] ?? q.type}
              </span>
              <span style={{ fontSize: '0.825rem', color: '#6b6b65', textAlign: 'center' as const }}>{q.marks}</span>
              <span style={{ fontSize: '0.75rem', color: '#a0a09a' }}>{formatDate(q.created_at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
