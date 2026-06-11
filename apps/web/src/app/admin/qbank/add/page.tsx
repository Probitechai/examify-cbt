'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

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

const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
const lbl = { fontSize: '0.825rem', fontWeight: 500 as const, color: '#1a1a18', display: 'block' as const, marginBottom: '0.4rem' }

export default function NewQuestionPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
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

  async function save(addAnother = false) {
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
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: apiType, subject: finalSubject, classLevel, topic: topic || undefined, questionText: qText, options: options || undefined, correctAnswer, marks, difficulty })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to save')

      if (addAnother) {
        setQText(''); setOptA(''); setOptB(''); setOptC(''); setOptD(''); setAnswer(''); setTopic(''); setCorrect('A')
        setSuccess(true); setTimeout(() => setSuccess(false), 2000)
      } else {
        router.push('/admin/questions')
      }
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
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button onClick={() => router.push('/admin/questions')}
          style={{ padding: '0.5rem 1rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', background: 'white', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#1a1a18' }}>New Question</h1>
          <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Add a question to the question bank</p>
        </div>
      </div>

      {success && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#0f4a32' }}>
          ✅ Question saved! Add another below.
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Type */}
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

        {/* Subject */}
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

        {/* Class, Difficulty, Marks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '1rem' }}>
          <div>
            <label style={lbl}>Class level</label>
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

        {/* Topic */}
        <div>
          <label style={lbl}>Topic <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional)</span></label>
          <input style={inp} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Grammar, Algebra, Cell Biology" />
        </div>

        {/* Question text */}
        <div>
          <label style={lbl}>{type === 'fill_blank' ? 'Question — use ___ for the blank' : 'Question text'}</label>
          <textarea style={{ ...inp, resize: 'vertical' as const, lineHeight: 1.6 }} rows={4} value={qText} onChange={e => setQText(e.target.value)}
            placeholder={
              type === 'fill_blank' ? 'e.g. The capital of Nigeria is ___.' :
              type === 'true_false' ? 'e.g. The earth revolves around the sun.' :
              type === 'essay' ? 'e.g. Discuss the causes of the Nigerian Civil War (10 marks).' :
              type === 'short_answer' ? 'e.g. What is the chemical symbol for water?' :
              'Type the question here…'
            } />
        </div>

        {/* MCQ options */}
        {type === 'mcq' && (
          <div>
            <label style={{ ...lbl, marginBottom: '0.75rem' }}>
              Answer options — click the letter button to mark correct answer
              <span style={{ fontWeight: 400, color: '#1a6b4a', marginLeft: '0.5rem' }}>({correct} is correct)</span>
            </label>
            {[{ k: 'A', v: optA, s: setOptA }, { k: 'B', v: optB, s: setOptB }, { k: 'C', v: optC, s: setOptC }, { k: 'D', v: optD, s: setOptD }].map(o => (
              <div key={o.k} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', marginBottom: '0.5rem', background: correct === o.k ? '#e8f5ee' : '#f7f7f5', border: `1.5px solid ${correct === o.k ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '8px' }}>
                <button type="button" onClick={() => setCorrect(o.k)}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: correct === o.k ? '#1a6b4a' : 'white', border: `1.5px solid ${correct === o.k ? '#1a6b4a' : '#d0d0c8'}`, color: correct === o.k ? 'white' : '#6b6b65', fontSize: '0.825rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {o.k}
                </button>
                <input style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '0.9rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit' }}
                  value={o.v} onChange={e => o.s(e.target.value)}
                  placeholder={`Option ${o.k}${o.k === 'C' || o.k === 'D' ? ' (optional)' : ''}`} />
              </div>
            ))}
          </div>
        )}

        {/* True/False */}
        {type === 'true_false' && (
          <div>
            <label style={lbl}>Correct answer</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {['True', 'False'].map(v => (
                <button key={v} type="button" onClick={() => setCorrect(v)}
                  style={{ flex: 1, padding: '1rem', border: `2px solid ${correct === v ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '12px', background: correct === v ? '#e8f5ee' : 'white', fontSize: '1rem', fontWeight: 600, color: correct === v ? '#0f4a32' : '#6b6b65', cursor: 'pointer' }}>
                  {v === 'True' ? '✅ True' : '❌ False'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Short answer / fill blank */}
        {(type === 'short_answer' || type === 'fill_blank') && (
          <div>
            <label style={lbl}>{type === 'fill_blank' ? 'Correct word/phrase for the blank' : 'Correct answer'}</label>
            <input style={inp} value={answer} onChange={e => setAnswer(e.target.value)}
              placeholder={type === 'fill_blank' ? 'e.g. Lagos, photosynthesis, 42' : 'e.g. H₂O, osmosis, 1914'} />
            <p style={{ fontSize: '0.75rem', color: '#6b6b65', marginTop: '0.375rem' }}>ℹ️ Not case sensitive — exact match required</p>
          </div>
        )}

        {/* Essay */}
        {type === 'essay' && (
          <div style={{ padding: '1rem', background: '#fdf4ff', border: '1.5px solid #e9d5ff', borderRadius: '10px' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#7e22ce', marginBottom: '0.375rem' }}>📄 Essay question</p>
            <p style={{ fontSize: '0.8rem', color: '#6b6b65', lineHeight: 1.5 }}>Students write a long answer. You will mark these manually in Results after the exam.</p>
            <div style={{ marginTop: '0.75rem' }}>
              <label style={lbl}>Marking guide <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional — for your reference only)</span></label>
              <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder="e.g. 2 marks for mentioning X, 2 marks for Y, 1 mark for conclusion…" />
            </div>
          </div>
        )}

        {error && (
          <p style={{ fontSize: '0.875rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem' }}>
            {error}
          </p>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #e5e5e0' }}>
          <button onClick={() => router.push('/admin/questions')}
            style={{ padding: '0.75rem 1.25rem', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#6b6b65', background: 'white', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => save(true)} disabled={saving}
            style={{ padding: '0.75rem 1.25rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', color: '#1a1a18', fontSize: '0.875rem', fontWeight: 500, borderRadius: '10px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            Save & add another
          </button>
          <button onClick={() => save(false)} disabled={saving}
            style={{ padding: '0.75rem 1.5rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 600, borderRadius: '10px', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save question →'}
          </button>
        </div>
      </div>
    </div>
  )
}
