'use client'
// Add or edit a question in the bank (teachers and School Admins).
// Editing: teachers change their own questions; School Admins any. Once students
// have sat an exam with the question, its answer, options, type and marks are
// locked (changing them would change their marks); wording, topic and
// explanation can still be fixed.
import { apiFetch, checkAuth } from '@/lib/auth'
import { acceptedFromText, hasBlank, ACCEPTED_HELP } from '@/lib/questions'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClassLevels, useDefaultClass } from '@/lib/classLevels'

type QType = 'mcq' | 'true_false' | 'short_answer' | 'fill_blank' | 'essay'
const API = process.env.NEXT_PUBLIC_API_URL

const SUBJECTS = ['Agricultural Science','Basic Science','Basic Technology','Biology','Chemistry','Christian Religious Studies','Civic Education','Commerce','Computer Science','Cultural and Creative Arts','Economics','English Language','Financial Accounting','French','Further Mathematics','Geography','Government','History','Home Economics','Islamic Religious Studies','Literature in English','Mathematics','Music','Physical and Health Education','Physics','Social Studies','Technical Drawing']
const LETTERS = ['A', 'B', 'C', 'D', 'E']

const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
const lbl = { fontSize: '0.825rem', fontWeight: 500 as const, color: '#1a1a18', display: 'block' as const, marginBottom: '0.4rem' }
const locked = { opacity: 0.6, pointerEvents: 'none' as const }

export default function QuestionEditor({ questionId }: { questionId?: string }) {
  const CLASS_LEVELS = useClassLevels()
  const router = useRouter()
  const editing = !!questionId
  const [loading, setLoading] = useState(editing)
  const [loadError, setLoadError] = useState('')
  const [inUse, setInUse] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [type, setType] = useState<QType>('mcq')
  const [subject, setSubject] = useState('English Language')
  const [customSubject, setCustomSubject] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [classLevel, setClassLevel] = useState('SS2')
  useDefaultClass(CLASS_LEVELS, classLevel, setClassLevel)
  const [difficulty, setDifficulty] = useState('medium')
  const [marks, setMarks] = useState(1)
  const [topic, setTopic] = useState('')
  const [qText, setQText] = useState('')
  const [opts, setOpts] = useState<string[]>(['', '', '', '', ''])
  const [correct, setCorrect] = useState('A')
  const [answer, setAnswer] = useState('')        // accepted answers (one per line), or the essay marking guide
  const [explanation, setExplanation] = useState('')

  useEffect(() => { checkAuth(router, ['school_admin', 'teacher']) }, [])

  // Editing: load the question
  useEffect(() => {
    if (!questionId) return
    apiFetch(`${API}/questions/${questionId}`).then(async res => {
      const data = await res.json().catch(() => null)
      if (!res.ok) { setLoadError(data?.message ?? 'Question not found.'); return }
      if (!data.canEdit) { setLoadError('You can only edit questions you added. Use Duplicate in the Question Bank to make your own copy.'); return }
      const q = data.question
      setInUse(!!data.inUse)
      setType(q.type); setClassLevel(q.class_level); setDifficulty(q.difficulty ?? 'medium'); setMarks(Number(q.marks))
      setTopic(q.topic ?? ''); setQText(q.question_text)
      if (SUBJECTS.includes(q.subject)) setSubject(q.subject); else { setShowCustom(true); setCustomSubject(q.subject) }
      if (q.type === 'mcq') {
        const o = Array.isArray(q.options) ? q.options : []
        setOpts(LETTERS.map((_, i) => o[i]?.text ?? ''))
        setCorrect(q.correct_answer || 'A')
      } else if (q.type === 'true_false') setCorrect(q.correct_answer || 'True')
      if (q.type === 'short_answer' || q.type === 'fill_blank') setAnswer(String(q.correct_answer ?? '').split('|').join('\n'))
      if (q.type === 'essay') setAnswer(q.explanation ?? '')
      else setExplanation(q.explanation ?? '')
    }).catch(() => setLoadError('Could not load the question.')).finally(() => setLoading(false))
  }, [questionId])

  function setOpt(i: number, v: string) { setOpts(o => o.map((x, j) => j === i ? v : x)) }

  async function save(addAnother = false) {
    if (!qText.trim()) { setError('Type the question.'); return }
    const filled = opts.map((t, i) => ({ key: LETTERS[i], text: t.trim() })).filter(o => o.text)
    if (type === 'mcq' && filled.length < 2) { setError('Give at least two options.'); return }
    if (type === 'mcq' && !filled.some(o => o.key === correct)) { setError('The option marked correct is empty. Choose the correct option.'); return }
    if ((type === 'short_answer' || type === 'fill_blank') && !answer.trim()) { setError('Enter at least one accepted answer.'); return }
    if (type === 'fill_blank' && !hasBlank(qText)) { setError('Mark the blank in the question with ___ (three underscores).'); return }
    const finalSubject = showCustom ? customSubject.trim() : subject
    if (!finalSubject) { setError('Enter the subject.'); return }
    setSaving(true); setError('')
    // Options keep their letters so the correct answer still points at the right one
    let options: { key: string; text: string }[] | undefined, correctAnswer = '', expl: string | undefined = explanation.trim() || undefined
    if (type === 'mcq') { options = filled; correctAnswer = correct }
    else if (type === 'true_false') { options = [{ key: 'True', text: 'True' }, { key: 'False', text: 'False' }]; correctAnswer = correct === 'False' ? 'False' : 'True' }
    else if (type === 'fill_blank' || type === 'short_answer') correctAnswer = acceptedFromText(answer)
    else if (type === 'essay') { correctAnswer = ''; expl = answer.trim() || undefined }
    try {
      const res = await apiFetch(editing ? `${API}/questions/${questionId}` : `${API}/questions`, {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify({ type, subject: finalSubject, classLevel, topic: topic.trim() || undefined, questionText: qText, options, correctAnswer, marks, difficulty, explanation: expl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? 'Could not save the question.')
      if (addAnother) {
        setQText(''); setOpts(['', '', '', '', '']); setAnswer(''); setExplanation(''); setCorrect(type === 'true_false' ? 'True' : 'A')
        setSuccess(true); setTimeout(() => setSuccess(false), 2500)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        router.push('/admin/qbank')
      }
    } catch (e: any) { setError(e.message ?? 'Could not save the question.') } finally { setSaving(false) }
  }

  const types: { key: QType; icon: string; label: string; desc: string }[] = [
    { key: 'mcq', icon: '🔤', label: 'Multiple Choice', desc: 'Pick one of up to five options' },
    { key: 'true_false', icon: '✅', label: 'True / False', desc: 'True or False answer' },
    { key: 'short_answer', icon: '✍️', label: 'Short Answer', desc: 'Typed answer, marked automatically' },
    { key: 'fill_blank', icon: '📝', label: 'Fill in Blank', desc: 'Complete the sentence' },
    { key: 'essay', icon: '📄', label: 'Essay', desc: 'Marked by the teacher' },
  ]

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#6b6b65', fontFamily: 'system-ui' }}>Loading…</div>
  if (loadError) return (
    <div style={{ maxWidth: 560, margin: '3rem auto', padding: '1.5rem', background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, fontFamily: 'system-ui', textAlign: 'center' }}>
      <p style={{ color: '#3a3a36', marginBottom: '1rem' }}>{loadError}</p>
      <button onClick={() => router.push('/admin/qbank')} style={{ padding: '0.6rem 1.2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Back to the Question Bank</button>
    </div>
  )

  return (
    <div style={{ maxWidth: 660, margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <button onClick={() => router.push('/admin/qbank')}
          style={{ padding: '0.5rem 1rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', background: 'white', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#1a1a18' }}>{editing ? 'Edit Question' : 'New Question'}</h1>
          <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{editing ? 'Changes apply wherever this question is used' : 'Add a question to the question bank'}</p>
        </div>
      </div>

      {inUse && (
        <div style={{ padding: '0.875rem 1.1rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#78350f', lineHeight: 1.5 }}>
          🔒 Students have already sat an exam with this question, so its <strong>type, options, answer and marks are locked</strong> (changing them would change their marks).
          You can still fix the wording, topic and explanation. To change the rest, use <strong>Duplicate</strong> in the Question Bank.
        </div>
      )}
      {success && (
        <div style={{ padding: '0.875rem 1.25rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1.25rem', fontSize: '0.875rem', fontWeight: 500, color: '#0f4a32' }}>
          ✅ Question saved. Add the next one below.
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={inUse ? locked : undefined}>
          <label style={lbl}>Question type</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {types.map(t => (
              <button key={t.key} type="button" onClick={() => { setType(t.key); if (t.key === 'true_false') setCorrect('True'); else if (t.key === 'mcq') setCorrect('A') }}
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
              <input style={{ ...inp, flex: 1 }} value={customSubject} onChange={e => setCustomSubject(e.target.value)} placeholder="Type the subject name…" autoFocus={!editing} />
              <button type="button" onClick={() => setShowCustom(false)} style={{ padding: '0.625rem 0.875rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', background: 'white', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65' }}>List</button>
            </div>
          ) : (
            <select style={inp} value={subject} onChange={e => { if (e.target.value === '__custom__') setShowCustom(true); else setSubject(e.target.value) }}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">➕ Another subject…</option>
            </select>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: '1rem' }}>
          <div>
            <label style={lbl}>Class</label>
            <select style={inp} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Difficulty</label>
            <select style={inp} value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </div>
          <div style={inUse ? locked : undefined}>
            <label style={lbl}>Marks</label>
            <input style={inp} type="number" min={0.5} max={100} step={0.5} value={marks} onChange={e => setMarks(Number(e.target.value))} />
          </div>
        </div>

        <div>
          <label style={lbl}>Topic <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional)</span></label>
          <input style={inp} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Grammar, Algebra, Cell Biology" />
        </div>

        <div>
          <label style={lbl}>{type === 'fill_blank' ? 'Question (use ___ for the blank)' : 'Question'}</label>
          <textarea style={{ ...inp, resize: 'vertical' as const, lineHeight: 1.6 }} rows={4} value={qText} onChange={e => setQText(e.target.value)}
            placeholder={
              type === 'fill_blank' ? 'e.g. The capital of Nigeria is ___.' :
              type === 'true_false' ? 'e.g. The earth revolves around the sun.' :
              type === 'essay' ? 'e.g. Discuss the causes of the Nigerian Civil War.' :
              type === 'short_answer' ? 'e.g. What is the chemical symbol for water?' :
              'Type the question here…'
            } />
        </div>

        {type === 'mcq' && (
          <div style={inUse ? locked : undefined}>
            <label style={{ ...lbl, marginBottom: '0.75rem' }}>
              Options (click a letter to mark the correct one)
              <span style={{ fontWeight: 400, color: '#1a6b4a', marginLeft: '0.5rem' }}>({correct} is correct)</span>
            </label>
            {LETTERS.map((k, i) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', marginBottom: '0.5rem', background: correct === k ? '#e8f5ee' : '#f7f7f5', border: `1.5px solid ${correct === k ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '8px' }}>
                <button type="button" onClick={() => setCorrect(k)}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: correct === k ? '#1a6b4a' : 'white', border: `1.5px solid ${correct === k ? '#1a6b4a' : '#d0d0c8'}`, color: correct === k ? 'white' : '#6b6b65', fontSize: '0.825rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                  {k}
                </button>
                <input style={{ flex: 1, background: 'transparent', border: 'none', fontSize: '0.9rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit' }}
                  value={opts[i]} onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${k}${i >= 2 ? ' (optional)' : ''}`} />
              </div>
            ))}
          </div>
        )}

        {type === 'true_false' && (
          <div style={inUse ? locked : undefined}>
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

        {(type === 'short_answer' || type === 'fill_blank') && (
          <div style={inUse ? locked : undefined}>
            <label style={lbl}>{type === 'fill_blank' ? 'Accepted answers for the blank' : 'Accepted answers'}</label>
            <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={answer} onChange={e => setAnswer(e.target.value)} placeholder={type === 'fill_blank' ? 'e.g. Abuja\nFCT Abuja' : 'e.g. H2O\nwater'} />
            <p style={{ fontSize: '0.75rem', color: '#6b6b65', marginTop: '0.375rem' }}>ℹ️ {ACCEPTED_HELP}</p>
          </div>
        )}

        {type === 'essay' ? (
          <div style={{ padding: '1rem', background: '#fdf4ff', border: '1.5px solid #e9d5ff', borderRadius: '10px' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#7e22ce', marginBottom: '0.375rem' }}>📄 Essay question</p>
            <p style={{ fontSize: '0.8rem', color: '#6b6b65', lineHeight: 1.5 }}>Students write a long answer, which you mark in Exam Results after the exam.</p>
            <div style={{ marginTop: '0.75rem' }}>
              <label style={lbl}>Marking guide <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional, shown while marking)</span></label>
              <textarea style={{ ...inp, resize: 'vertical' as const }} rows={3} value={answer} onChange={e => setAnswer(e.target.value)}
                placeholder="e.g. 2 marks for mentioning X, 2 marks for Y, 1 mark for conclusion…" />
            </div>
          </div>
        ) : (
          <div>
            <label style={lbl}>Explanation <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional, shown to students after the exam)</span></label>
            <textarea style={{ ...inp, resize: 'vertical' as const }} rows={2} value={explanation} onChange={e => setExplanation(e.target.value)} placeholder="Why the answer is correct" />
          </div>
        )}

        {error && (
          <p style={{ fontSize: '0.875rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.75rem 1rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #e5e5e0', flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/admin/qbank')}
            style={{ padding: '0.75rem 1.25rem', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#6b6b65', background: 'white', cursor: 'pointer' }}>
            Cancel
          </button>
          {!editing && (
            <button onClick={() => save(true)} disabled={saving}
              style={{ padding: '0.75rem 1.25rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', color: '#1a1a18', fontSize: '0.875rem', fontWeight: 500, borderRadius: '10px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              Save & add another
            </button>
          )}
          <button onClick={() => save(false)} disabled={saving}
            style={{ padding: '0.75rem 1.5rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 600, borderRadius: '10px', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Save question →'}
          </button>
        </div>
      </div>
    </div>
  )
}
