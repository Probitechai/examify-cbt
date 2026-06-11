'use client'
import { useState, useEffect } from 'react'

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

type QType = 'mcq' | 'true_false' | 'short_answer' | 'fill_blank' | 'essay'

const SUBJECTS = ['Agricultural Science','Biology','Chemistry','Christian Religious Studies','Civic Education','Commerce','Computer Science','Economics','English Language','Financial Accounting','French','Further Mathematics','Geography','Government','History','Home Economics','Islamic Religious Studies','Literature in English','Mathematics','Music','Physical Education','Physics','Technical Drawing']

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

const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
const lbl = { fontSize: '0.825rem', fontWeight: 500 as const, color: '#1a1a18', display: 'block' as const, marginBottom: '0.4rem' }

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
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
    } catch {}
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
    if (search && !q.question_text.toLowerCase().includes(search.toLowerCase())) return false
    if (subjectFilter && q.subject !== subjectFilter) return false
    return true
  })

  const typeLabel: Record<string, string> = { mcq: 'MCQ', true_false: 'True/False', short_answer: 'Short Answer', essay: 'Essay' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Question Bank</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>{loading ? 'Loading…' : `${questions.length} questions`}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {selected.length > 0 && <button onClick={del} style={{ padding: '0.625rem 1.25rem', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#dc2626', cursor: 'pointer' }}>🗑 Delete ({selected.length})</button>}
          <button onClick={() => setShowModal(true)} style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>+ New question</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <input style={{ ...inp, maxWidth: 300 }} placeholder="Search questions…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inp, width: 'auto' }} value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 140px 120px 60px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, borderBottom: '1px solid #e5e5e0' }}>
          <span></span><span>Question</span><span>Subject</span><span>Type</span><span>Marks</span>
        </div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6b6b65' }}>Loading questions…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>❓</p>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No questions yet</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1rem' }}>Add your first question to get started.</p>
            <button onClick={() => setShowModal(true)} style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>+ Add first question</button>
          </div>
        ) : filtered.map(q => (
          <div key={q.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 140px 120px 60px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
            <input type="checkbox" checked={selected.includes(q.id)} onChange={() => setSelected(p => p.includes(q.id) ? p.filter(x => x !== q.id) : [...p, q.id])} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
            <span style={{ fontSize: '0.875rem', color: '#1a1a18' }}>{q.question_text.length > 100 ? q.question_text.slice(0, 100) + '…' : q.question_text}</span>
            <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{q.subject}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 20, background: '#eff6ff', color: '#1e40af', display: 'inline-block' }}>{typeLabel[q.type] ?? q.type}</span>
            <span style={{ fontSize: '0.825rem', color: '#6b6b65', textAlign: 'center' as const }}>{q.marks}</span>
          </div>
        ))}
      </div>

      {showModal && <Modal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}
    </div>
  )
}

function Modal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [type, setType] = useState<QType>('mcq')
  const [subject, setSubject] = useState('English Language')
  const [customSubject, setCustomSubject] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [classLevel, setClassLevel] = useState('SS2')
  const [difficulty, setDifficulty] = useState('medium')
  const [marks, setMarks] = useState(1)
  const [topic, setTopic] = useState('')
  const [qText, setQText] = useState('')
  const [optA, setOptA] = useState('')
  const [optB, setOptB] = useState('')
  const [optC, setOptC] = useState('')
  const [optD, setOptD] = useState('')
  const [correct, setCorrect] = useState('A')
  const [answer, setAnswer] = useState('')

  async function save() {
    if (!qText.trim()) { setError('Question text is required'); return }
    if (type === 'mcq' && (!optA.trim() || !optB.trim())) { setError('Options A and B are required'); return }
    if ((type === 'short_answer' || type === 'fill_blank') && !answer.trim()) { setError('Correct answer is required'); return }
    setSaving(true); setError('')
    try {
      let options = null, correctAnswer = '', apiType = type as string
      if (type === 'mcq') {
        options = [{ key: 'A', text: optA }, { key: 'B', text: optB }, ...(optC ? [{ key: 'C', text: optC }] : []), ...(optD ? [{ key: 'D', text: optD }] : [])]
        correctAnswer = correct
      } else if (type === 'true_false') {
        options = [{ key: 'True', text: 'True' }, { key: 'False', text: 'False' }]
        correctAnswer = correct
      } else if (type === 'fill_blank') { correctAnswer = answer.trim(); apiType = 'short_answer'
      } else if (type === 'short_answer') { correctAnswer = answer.trim()
      } else if (type === 'essay') { correctAnswer = 'ESSAY'; apiType = 'short_answer' }

      const finalSubject = showCustom && customSubject.trim() ? customSubject.trim() : subject
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ type: apiType, subject: finalSubject, classLevel, topic: topic || undefined, questionText: qText, options: options || undefined, correctAnswer, marks, difficulty })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to save')
      onSaved()
    } catch (e: any) { setError(e.message ?? 'Error') } finally { setSaving(false) }
  }

  const types: { key: QType; icon: string; label: string; desc: string }[] = [
    { key: 'mcq', icon: '🔤', label: 'Multiple Choice', desc: 'Pick from A, B, C, D' },
    { key: 'true_false', icon: '✅', label: 'True / False', desc: 'True or False answer' },
    { key: 'short_answer', icon: '✏️', label: 'Short Answer', desc: 'Auto-graded typed answer' },
    { key: 'fill_blank', icon: '📝', label: 'Fill in Blank', desc: 'Complete the sentence' },
    { key: 'essay', icon: '📄', label: 'Essay', desc: 'Teacher marks manually' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18' }}>New Question</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#a0a09a' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={lbl}>Question type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {types.map(t => (
                <button key={t.key} type="button" onClick={() => setType(t.key)}
                  style={{ padding: '0.75rem', border: `2px solid ${type === t.key ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '10px', background: type === t.key ? '#e8f5ee' : 'white', cursor: 'pointer', textAlign: 'left' as const }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span>{t.icon}</span>
                    <span style={{ fontSize: '0.825rem', fontWeight: 600, color: type === t.key ? '#0f4a32' : '#1a1a18' }}>{t.label}</span>
                  </div>
                  <p style={{ fontSize: '0.7rem', color: '#6b6b65' }}>{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={lbl}>Subject</label>
            {showCustom ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input style={{ ...inp, flex: 1 }} value={customSubject} onChange={e => setCustomSubject(e.target.value)} placeholder="Type subject name…" autoFocus />
                <button type="button" onClick={() => setShowCustom(false)} style={{ padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65' }}>Cancel</button>
              </div>
            ) : (
              <select style={inp} value={subject} onChange={e => { if (e.target.value === '__custom__') setShowCustom(true); else setSubject(e.target.value) }}>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="__custom__">➕ Add new subject…</option>
              </select>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '0.875rem' }}>
            <div>
              <label style={lbl}>Class</label>
              <select style={inp} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
                <option>SS1</option><option>SS2</option><option>SS3</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Difficulty</label>
              <select style={inp} value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Marks</label>
              <input style={inp} type="number" min={1} max={20} value={marks} onChange={e => setMarks(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label style={lbl}>Topic <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional)</span></label>
            <input style={inp} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Grammar, Algebra, Cell Biology" />
          </div>

          <div>
            <label style={lbl}>{type === 'fill_blank' ? 'Question — use ___ for the blank' : 'Question text'}</label>
            <textarea style={{ ...inp, resize: 'vertical' as const, lineHeight: 1.6 }} rows={3} value={qText} onChange={e => setQText(e.target.value)}
              placeholder={type === 'fill_blank' ? 'e.g. The capital of Nigeria is ___.' : type === 'true_false' ? 'e.g. The earth revolves around the sun.' : type === 'essay' ? 'e.g. Discuss the causes of the Nigerian Civil War.' : type === 'short_answer' ? 'e.g. What is the chemical symbol for water?' : 'Type the question here…'} />
          </div>

          {type === 'mcq' && (
            <div>
              <label style={{ ...lbl, marginBottom: '0.75rem' }}>Options — click letter to mark correct <span style={{ fontWeight: 400, color: '#1a6b4a' }}>({correct} is correct)</span></label>
              {[{ k: 'A', v: optA, s: setOptA }, { k: 'B', v: optB, s: setOptB }, { k: 'C', v: optC, s: setOptC }, { k: 'D', v: optD, s: setOptD }].map(o => (
                <div key={o.k} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', marginBottom: '0.5rem', background: correct === o.k ? '#e8f5ee' : '#f7f7f5', border: `1.5px solid ${correct === o.k ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '8px' }}>
                  <button type="button" onClick={() => setCorrect(o.k)} style={{ width: 28, height: 28, borderRadius: '50%', background: correct === o.k ? '#1a6b4a' : 'white', border: `1.5px solid ${correct === o.k ? '#1a6b4a' : '#d0d0c8'}`, color: correct === o.k ? 'white' : '#6b6b65', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{o.k}</button>
                  <input style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit' }} value={o.v} onChange={e => o.s(e.target.value)} placeholder={`Option ${o.k}${o.k === 'C' || o.k === 'D' ? ' (optional)' : ''}`} />
                </div>
              ))}
            </div>
          )}

          {type === 'true_false' && (
            <div>
              <label style={lbl}>Correct answer</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {['True', 'False'].map(v => (
                  <button key={v} type="button" onClick={() => setCorrect(v)} style={{ flex: 1, padding: '0.875rem', border: `2px solid ${correct === v ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '10px', background: correct === v ? '#e8f5ee' : 'white', fontSize: '0.95rem', fontWeight: 600, color: correct === v ? '#0f4a32' : '#6b6b65', cursor: 'pointer' }}>
                    {v === 'True' ? '✅ True' : '❌ False'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(type === 'short_answer' || type === 'fill_blank') && (
            <div>
              <label style={lbl}>{type === 'fill_blank' ? 'Correct word/phrase for the blank' : 'Correct answer'}</label>
              <input style={inp} value={answer} onChange={e => setAnswer(e.target.value)} placeholder={type === 'fill_blank' ? 'e.g. Lagos, photosynthesis, 42' : 'e.g. H₂O, osmosis, 1914'} />
              <p style={{ fontSize: '0.75rem', color: '#6b6b65', marginTop: '0.375rem' }}>ℹ️ Not case sensitive — exact match required</p>
            </div>
          )}

          {type === 'essay' && (
            <div style={{ padding: '1rem', background: '#fdf4ff', border: '1.5px solid #e9d5ff', borderRadius: '10px' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#7e22ce', marginBottom: '0.375rem' }}>📄 Essay question</p>
              <p style={{ fontSize: '0.8rem', color: '#6b6b65', lineHeight: 1.5 }}>Students write a long answer. Mark manually in Results after the exam.</p>
              <div style={{ marginTop: '0.75rem' }}>
                <label style={lbl}>Marking guide <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional)</span></label>
                <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="e.g. 2 marks for X, 2 marks for Y, 1 mark for conclusion…" />
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: '0.875rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.625rem 0.875rem' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, color: '#6b6b65', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save question'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
