'use client'
import { useState } from 'react'

interface InlineQuestion {
  id: string
  question: string
  option_a: string
  option_b: string
  option_c: string | null
  option_d: string | null
  correct_option: string
  explanation: string | null
}

interface Props {
  questions: InlineQuestion[]
  isTeacher?: boolean
  onDelete?: (id: string) => void
}

export default function InlineQuiz({ questions, isTeacher, onDelete }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({})
  const [score, setScore] = useState<{ correct: number; total: number } | null>(null)

  if (questions.length === 0) return (
    <div style={{ textAlign: 'center' as const, padding: '2rem', background: '#f7f7f5', borderRadius: '12px', color: '#6b6b65', fontSize: '0.875rem' }}>
      No quiz questions yet.
    </div>
  )

  function submitAnswer(questionId: string) {
    setSubmitted(prev => ({ ...prev, [questionId]: true }))
  }

  function submitAll() {
    const newSubmitted: Record<string, boolean> = {}
    for (const q of questions) { newSubmitted[q.id] = true }
    setSubmitted(newSubmitted)
    const correct = questions.filter(q => answers[q.id] === q.correct_option).length
    setScore({ correct, total: questions.length })
  }

  function reset() {
    setAnswers({})
    setSubmitted({})
    setScore(null)
  }

  const optionLabels: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' }

  return (
    <div>
      {score && (
        <div style={{ background: score.correct === score.total ? '#e8f5ee' : score.correct >= score.total / 2 ? '#fffbeb' : '#fef2f2', border: `1px solid ${score.correct === score.total ? '#1a6b4a' : score.correct >= score.total / 2 ? '#fde68a' : '#fecaca'}`, borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' as const }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{score.correct === score.total ? '🎉' : score.correct >= score.total / 2 ? '👍' : '📚'}</p>
          <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18' }}>{score.correct}/{score.total} correct</p>
          <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1rem' }}>
            {score.correct === score.total ? 'Perfect score! Excellent work!' : score.correct >= score.total / 2 ? 'Good effort! Review the ones you missed.' : 'Keep studying! Read the lesson again.'}
          </p>
          <button onClick={reset}
            style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
            🔄 Try Again
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {questions.map((q, idx) => {
          const isSubmitted = submitted[q.id]
          const selectedAnswer = answers[q.id]
          const isCorrect = selectedAnswer === q.correct_option
          const options = [
            { key: 'a', text: q.option_a },
            { key: 'b', text: q.option_b },
            ...(q.option_c ? [{ key: 'c', text: q.option_c }] : []),
            ...(q.option_d ? [{ key: 'd', text: q.option_d }] : []),
          ]

          return (
            <div key={q.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Question {idx + 1}</span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginTop: '0.25rem', lineHeight: 1.5 }}>{q.question}</p>
                </div>
                {isTeacher && onDelete && (
                  <button onClick={() => onDelete(q.id)}
                    style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', background: '#fef2f2', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#dc2626', fontWeight: 600, flexShrink: 0, marginLeft: '0.75rem' }}>
                    Delete
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
                {options.map(opt => {
                  let bg = 'white'
                  let border = '#e5e5e0'
                  let color = '#1a1a18'
                  if (isSubmitted) {
                    if (opt.key === q.correct_option) { bg = '#e8f5ee'; border = '#1a6b4a'; color = '#0f4a32' }
                    else if (opt.key === selectedAnswer && selectedAnswer !== q.correct_option) { bg = '#fef2f2'; border = '#fecaca'; color = '#dc2626' }
                    else { bg = '#f7f7f5'; color = '#a0a09a' }
                  } else if (selectedAnswer === opt.key) {
                    bg = '#eff6ff'; border = '#1e40af'; color = '#1e40af'
                  }
                  return (
                    <button key={opt.key}
                      onClick={() => !isSubmitted && setAnswers(prev => ({ ...prev, [q.id]: opt.key }))}
                      disabled={isSubmitted}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: bg, border: `1.5px solid ${border}`, borderRadius: '10px', cursor: isSubmitted ? 'default' : 'pointer', textAlign: 'left' as const, transition: 'all 0.15s' }}>
                      <span style={{ width: 24, height: 24, borderRadius: '50%', background: selectedAnswer === opt.key && !isSubmitted ? '#1e40af' : isSubmitted && opt.key === q.correct_option ? '#1a6b4a' : isSubmitted && opt.key === selectedAnswer ? '#dc2626' : '#f0f0ee', color: (selectedAnswer === opt.key && !isSubmitted) || (isSubmitted && (opt.key === q.correct_option || opt.key === selectedAnswer)) ? 'white' : '#6b6b65', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>
                        {optionLabels[opt.key]}
                      </span>
                      <span style={{ fontSize: '0.875rem', color, fontWeight: selectedAnswer === opt.key ? 500 : 400 }}>{opt.text}</span>
                      {isSubmitted && opt.key === q.correct_option && <span style={{ marginLeft: 'auto', fontSize: '0.875rem' }}>✓</span>}
                      {isSubmitted && opt.key === selectedAnswer && selectedAnswer !== q.correct_option && <span style={{ marginLeft: 'auto', fontSize: '0.875rem' }}>✗</span>}
                    </button>
                  )
                })}
              </div>

              {isSubmitted && q.explanation && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.875rem', marginBottom: '0.875rem' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>💡 Explanation</p>
                  <p style={{ fontSize: '0.825rem', color: '#78350f', lineHeight: 1.6 }}>{q.explanation}</p>
                </div>
              )}

              {!isSubmitted && !isTeacher && (
                <button onClick={() => submitAnswer(q.id)} disabled={!selectedAnswer}
                  style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: !selectedAnswer ? 0.5 : 1 }}>
                  Check Answer
                </button>
              )}

              {isSubmitted && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: 600, color: isCorrect ? '#1a6b4a' : '#dc2626' }}>
                    {isCorrect ? '✓ Correct!' : `✗ Incorrect — correct answer is ${optionLabels[q.correct_option]}`}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!isTeacher && Object.keys(submitted).length < questions.length && questions.length > 1 && (
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={submitAll}
            style={{ padding: '0.625rem 1.5rem', background: '#1e40af', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
            Submit All Answers
          </button>
        </div>
      )}
    </div>
  )
}