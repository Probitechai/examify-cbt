'use client'
import { useState } from 'react'
import SubjectSelector from '../../../components/SubjectSelector'

interface Props {
  onClose: () => void
  onSaved: () => void
}

type QuestionType = 'mcq' | 'true_false' | 'short_answer' | 'fill_blank'

export default function AddQuestionModal({ onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    type: 'mcq' as QuestionType,
    subject: 'English Language',
    classLevel: 'SS2',
    topic: '',
    questionText: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctAnswer: 'A',
    shortAnswer: '',
    marks: 1,
    difficulty: 'medium',
  })

  function set(key: string, val: any) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function getToken() {
    return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
  }

  function getSubdomain() {
    try {
      const token = getToken()
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.schoolSubdomain) return payload.schoolSubdomain
      }
      return window.localStorage.getItem('examify_school') ?? 'greensprings'
    } catch { return 'greensprings' }
  }

  async function handleSave() {
    if (!form.questionText.trim()) { setError('Question text is required'); return }

    // Validate based on type
    if (form.type === 'mcq' && (!form.optionA.trim() || !form.optionB.trim())) {
      setError('At least options A and B are required for MCQ')
      return
    }
    if (form.type === 'short_answer' && !form.shortAnswer.trim()) {
      setError('Correct answer is required for short answer questions')
      return
    }
    if (form.type === 'fill_blank' && !form.shortAnswer.trim()) {
      setError('The correct word/phrase to fill the blank is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      let options = null
      let correctAnswer = ''

      if (form.type === 'mcq') {
        options = [
          { key: 'A', text: form.optionA },
          { key: 'B', text: form.optionB },
          ...(form.optionC ? [{ key: 'C', text: form.optionC }] : []),
          ...(form.optionD ? [{ key: 'D', text: form.optionD }] : []),
        ]
        correctAnswer = form.correctAnswer
      } else if (form.type === 'true_false') {
        options = [
          { key: 'True', text: 'True' },
          { key: 'False', text: 'False' },
        ]
        correctAnswer = form.correctAnswer
      } else {
        correctAnswer = form.shortAnswer.trim()
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'X-School-Subdomain': getSubdomain(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: form.type === 'fill_blank' ? 'short_answer' : form.type,
          subject: form.subject,
          classLevel: form.classLevel,
          topic: form.topic || undefined,
          questionText: form.questionText,
          options: options || undefined,
          correctAnswer,
          marks: form.marks,
          difficulty: form.difficulty,
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to save question')
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    padding: '0.625rem 0.875rem',
    background: '#f7f7f5',
    border: '1.5px solid #e5e5e0',
    borderRadius: '8px',
    fontSize: '0.875rem',
    color: '#1a1a18',
    outline: 'none',
    width: '100%',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    fontSize: '0.825rem',
    fontWeight: 500,
    color: '#1a1a18',
    display: 'block',
    marginBottom: '0.4rem',
  }

  const TYPE_INFO = {
    mcq: { label: 'Multiple Choice', icon: '🔤', desc: 'Student selects one option from A, B, C, D' },
    true_false: { label: 'True / False', icon: '✅', desc: 'Student selects True or False' },
    short_answer: { label: 'Short Answer', icon: '✏️', desc: 'Student types a short answer (auto-graded)' },
    fill_blank: { label: 'Fill in the Blank', icon: '📝', desc: 'Sentence with a blank — student fills it in' },
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #e5e5e0' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18' }}>New Question</h2>
          <button onClick={onClose} style={{ color: '#a0a09a', fontSize: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Question Type Selector */}
          <div>
            <label style={labelStyle}>Question type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {(Object.entries(TYPE_INFO) as [QuestionType, typeof TYPE_INFO.mcq][]).map(([type, info]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('type', type)}
                  style={{
                    padding: '0.75rem 1rem',
                    border: `2px solid ${form.type === type ? '#1a6b4a' : '#e5e5e0'}`,
                    borderRadius: '10px',
                    background: form.type === type ? '#e8f5ee' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left' as const,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1rem' }}>{info.icon}</span>
                    <span style={{ fontSize: '0.825rem', fontWeight: 600, color: form.type === type ? '#0f4a32' : '#1a1a18' }}>{info.label}</span>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65', lineHeight: 1.3 }}>{info.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Subject, Class, Difficulty, Marks */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '0.875rem' }}>
            <div>
              <label style={labelStyle}>Subject</label>
              <SubjectSelector value={form.subject} onChange={val => set('subject', val)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Class</label>
              <select style={inputStyle} value={form.classLevel} onChange={e => set('classLevel', e.target.value)}>
                <option>SS1</option><option>SS2</option><option>SS3</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Difficulty</label>
              <select style={inputStyle} value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Marks</label>
              <input style={inputStyle} type="number" min={1} max={10} value={form.marks} onChange={e => set('marks', Number(e.target.value))} />
            </div>
          </div>

          {/* Topic */}
          <div>
            <label style={labelStyle}>Topic <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional)</span></label>
            <input style={inputStyle} value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="e.g. Grammar, Algebra, Cell Biology" />
          </div>

          {/* Question Text */}
          <div>
            <label style={labelStyle}>
              {form.type === 'fill_blank' ? 'Question text (use ___ for the blank)' : 'Question text'}
            </label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              rows={3}
              value={form.questionText}
              onChange={e => set('questionText', e.target.value)}
              placeholder={
                form.type === 'fill_blank'
                  ? 'e.g. The capital of Nigeria is ___.'
                  : form.type === 'true_false'
                  ? 'e.g. The earth revolves around the sun.'
                  : form.type === 'short_answer'
                  ? 'e.g. What is the chemical symbol for water?'
                  : 'Type the question here…'
              }
            />
          </div>

          {/* MCQ Options */}
          {form.type === 'mcq' && (
            <div>
              <p style={{ ...labelStyle, marginBottom: '0.75rem' }}>
                Answer options — click the letter to mark the correct answer
                {' '}<span style={{ fontWeight: 400, color: '#1a6b4a' }}>({form.correctAnswer} is correct)</span>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[
                  { key: 'A', field: 'optionA' },
                  { key: 'B', field: 'optionB' },
                  { key: 'C', field: 'optionC' },
                  { key: 'D', field: 'optionD' },
                ].map(opt => (
                  <div
                    key={opt.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.625rem 0.875rem',
                      background: form.correctAnswer === opt.key ? '#e8f5ee' : '#f7f7f5',
                      border: `1.5px solid ${form.correctAnswer === opt.key ? '#1a6b4a' : '#e5e5e0'}`,
                      borderRadius: '8px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => set('correctAnswer', opt.key)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: form.correctAnswer === opt.key ? '#1a6b4a' : 'white',
                        border: `1.5px solid ${form.correctAnswer === opt.key ? '#1a6b4a' : '#d0d0c8'}`,
                        color: form.correctAnswer === opt.key ? 'white' : '#6b6b65',
                        fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      {opt.key}
                    </button>
                    <input
                      style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit' }}
                      value={(form as any)[opt.field]}
                      onChange={e => set(opt.field, e.target.value)}
                      placeholder={`Option ${opt.key}${opt.key === 'C' || opt.key === 'D' ? ' (optional)' : ''}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* True/False Options */}
          {form.type === 'true_false' && (
            <div>
              <label style={labelStyle}>Correct answer</label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {['True', 'False'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set('correctAnswer', val)}
                    style={{
                      flex: 1, padding: '0.875rem',
                      border: `2px solid ${form.correctAnswer === val ? '#1a6b4a' : '#e5e5e0'}`,
                      borderRadius: '10px',
                      background: form.correctAnswer === val ? '#e8f5ee' : 'white',
                      fontSize: '0.95rem', fontWeight: 600,
                      color: form.correctAnswer === val ? '#0f4a32' : '#6b6b65',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {val === 'True' ? '✅ True' : '❌ False'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Short Answer / Fill in the Blank */}
          {(form.type === 'short_answer' || form.type === 'fill_blank') && (
            <div>
              <label style={labelStyle}>
                {form.type === 'fill_blank' ? 'Correct word/phrase for the blank' : 'Correct answer'}
              </label>
              <input
                style={inputStyle}
                value={form.shortAnswer}
                onChange={e => set('shortAnswer', e.target.value)}
                placeholder={form.type === 'fill_blank' ? 'e.g. Lagos, photosynthesis, 42' : 'e.g. H₂O, osmosis, 1914'}
              />
              <p style={{ fontSize: '0.75rem', color: '#6b6b65', marginTop: '0.375rem' }}>
                ℹ️ Answers are compared exactly — consider spelling and capitalisation
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p style={{ fontSize: '0.875rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.625rem 0.875rem' }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, color: '#6b6b65', background: 'transparent', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save question'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
