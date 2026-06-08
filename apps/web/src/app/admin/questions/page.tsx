'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminQuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const token = document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1]
    if (!token) return
    
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-School-Subdomain': 'greensprings',
        'Content-Type': 'application/json'
      }
    })
    .then(r => r.json())
    .then(d => setQuestions(d.questions ?? []))
    .catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            Question Bank
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#6b6b65' }}>
            {loading ? 'Loading...' : `${questions.length} questions`}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '10px', border: 'none', cursor: 'pointer' }}>
          + New question
        </button>
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 90px 70px', gap: '1rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f7f7f5', borderBottom: '1px solid #e5e5e0' }}>
          <span>Question</span><span>Subject</span><span>Class</span><span>Difficulty</span><span>Marks</span>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b6b65' }}>Loading questions…</div>
        ) : questions.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6b6b65' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❓</div>
            <p>No questions yet. Add your first question.</p>
          </div>
        ) : questions.map((q: any) => (
          <div key={q.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 90px 70px', gap: '1rem', padding: '0.875rem 1.25rem', alignItems: 'center', borderTop: '1px solid #e5e5e0', fontSize: '0.875rem' }}>
            <span style={{ color: '#1a1a18', lineHeight: 1.4 }}>{q.question_text}</span>
            <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{q.subject}</span>
            <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{q.class_level}</span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '20px', background: q.difficulty === 'easy' ? '#e8f5ee' : q.difficulty === 'hard' ? '#fef2f2' : '#fffbeb', color: q.difficulty === 'easy' ? '#0f4a32' : q.difficulty === 'hard' ? '#dc2626' : '#d97706' }}>
              {q.difficulty ?? 'medium'}
            </span>
            <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{q.marks} mk</span>
          </div>
        ))}
      </div>

      {showForm && (
        <AddQuestionForm onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); window.location.reload() }} />
      )}
    </div>
  )
}

function AddQuestionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ subject: 'English Language', classLevel: 'SS2', topic: '', questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A', marks: 1, difficulty: 'medium' })

  function set(key: string, val: any) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form.questionText.trim() || !form.optionA.trim() || !form.optionB.trim()) {
      setError('Question text and at least options A and B are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const token = document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1]
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/questions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'X-School-Subdomain': 'greensprings', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'mcq', subject: form.subject, classLevel: form.classLevel, topic: form.topic || undefined,
          questionText: form.questionText,
          options: [{ key: 'A', text: form.optionA }, { key: 'B', text: form.optionB }, ...(form.optionC ? [{ key: 'C', text: form.optionC }] : []), ...(form.optionD ? [{ key: 'D', text: form.optionD }] : [])],
          correctAnswer: form.correctAnswer, marks: form.marks, difficulty: form.difficulty
        })
      })
      if (!res.ok) throw new Error('Failed to save')
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', width: '100%', fontFamily: 'inherit' }
  const labelStyle = { fontSize: '0.825rem', fontWeight: 500, color: '#1a1a18', display: 'block', marginBottom: '0.4rem' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #e5e5e0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>New Question</h2>
          <button onClick={onClose} style={{ color: '#a0a09a', fontSize: '1rem' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '0.875rem' }}>
            <div><label style={labelStyle}>Subject</label><select style={inputStyle} value={form.subject} onChange={e => set('subject', e.target.value)}><option>English Language</option><option>Mathematics</option><option>Biology</option><option>Chemistry</option><option>Physics</option><option>Economics</option><option>Government</option><option>Literature</option></select></div>
            <div><label style={labelStyle}>Class</label><select style={inputStyle} value={form.classLevel} onChange={e => set('classLevel', e.target.value)}><option>SS1</option><option>SS2</option><option>SS3</option></select></div>
            <div><label style={labelStyle}>Difficulty</label><select style={inputStyle} value={form.difficulty} onChange={e => set('difficulty', e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
            <div><label style={labelStyle}>Marks</label><input style={inputStyle} type="number" min={1} max={10} value={form.marks} onChange={e => set('marks', Number(e.target.value))} /></div>
          </div>
          <div><label style={labelStyle}>Topic (optional)</label><input style={inputStyle} value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="e.g. Grammar, Algebra" /></div>
          <div><label style={labelStyle}>Question text</label><textarea style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} rows={3} value={form.questionText} onChange={e => set('questionText', e.target.value)} placeholder="Type the question here…" /></div>
          <p style={{ fontSize: '0.78rem', color: '#a0a09a' }}>Click the letter to mark the correct answer. Currently: <strong>{form.correctAnswer}</strong></p>
          {[{ key: 'A', field: 'optionA' }, { key: 'B', field: 'optionB' }, { key: 'C', field: 'optionC' }, { key: 'D', field: 'optionD' }].map(opt => (
            <div key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: form.correctAnswer === opt.key ? '#e8f5ee' : '#f7f7f5', border: `1.5px solid ${form.correctAnswer === opt.key ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '8px' }}>
              <button onClick={() => set('correctAnswer', opt.key)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: form.correctAnswer === opt.key ? '#1a6b4a' : 'white', border: `1.5px solid ${form.correctAnswer === opt.key ? '#1a6b4a' : '#d0d0c8'}`, color: form.correctAnswer === opt.key ? 'white' : '#6b6b65', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{opt.key}</button>
              <input style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit' }} value={(form as any)[opt.field]} onChange={e => set(opt.field, e.target.value)} placeholder={`Option ${opt.key}${opt.key === 'C' || opt.key === 'D' ? ' (optional)' : ''}`} />
            </div>
          ))}
          {error && <p style={{ fontSize: '0.875rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.625rem 0.875rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, color: '#6b6b65', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save question'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}