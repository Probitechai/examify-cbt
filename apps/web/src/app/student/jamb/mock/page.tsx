'use client'
// JAMB mock exam: server picks real past questions across the student's four
// subjects, keeps the clock, autosaves answers and marks the paper (out of 400).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useAuthStore } from '@/hooks/useAuth'

const API = process.env.NEXT_PUBLIC_API_URL
const GREEN = '#1a6b4a'

async function call(path: string, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase()
  const res = await apiFetch(`${API}${path}`, { ...init, body: method === 'GET' ? undefined : (init.body ?? '{}') })
  let data: any = {}
  try { data = await res.json() } catch {}
  return { ok: res.ok, status: res.status, data }
}

const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return (h ? `${h}:` : '') + `${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`
}
const OPTS = ['a', 'b', 'c', 'd'] as const
const card = { background: 'white', border: '1px solid #e5e5e0', borderRadius: 16, padding: '1.25rem 1.5rem' }
const btn = { padding: '0.7rem 1.25rem', background: GREEN, color: 'white', border: 'none', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }
const ghost = { ...btn, background: 'white', color: '#3a3a36', border: '1.5px solid #e5e5e0' }

export default function MockExamPage() {
  const router = useRouter()
  const { user, isLoading, hydrate } = useAuthStore()
  const [view, setView] = useState<'intro' | 'exam' | 'review'>('intro')
  const [status, setStatus] = useState<any>(null)
  const [paper, setPaper] = useState<any>(null)
  const [review, setReview] = useState<any>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => { checkAuth(router, 'student') }, [])
  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && String(user.classLevel ?? '').toUpperCase() !== 'SS3') router.replace('/student')
  }, [user, isLoading, router])

  const loadStatus = useCallback(async () => {
    const r = await call('/jamb/mock/status')
    if (r.ok) setStatus(r.data)
    else setError(r.data.message ?? 'Could not load mock exams.')
  }, [])
  useEffect(() => { if (user) loadStatus() }, [user, loadStatus])

  async function start(mode: 'full' | 'short') {
    setStarting(true); setError('')
    const r = await call('/jamb/mock/start', { method: 'POST', body: JSON.stringify({ mode }) })
    setStarting(false)
    if (!r.ok) { setError(r.data.message ?? 'Could not start the mock.'); return }
    setPaper(r.data.attempt); setView('exam')
  }

  async function openAttempt(id: string) {
    const r = await call(`/jamb/mock/${id}`)
    if (!r.ok) { setError('Could not open that mock.'); return }
    if (r.data.attempt.status === 'submitted') { setReview(r.data.attempt); setView('review') }
    else { setPaper(r.data.attempt); setView('exam') }
  }

  if (isLoading || !user) return <div style={{ minHeight: '100vh', background: '#f7f7f5' }} />

  if (view === 'exam' && paper) {
    return <ExamView paper={paper} onDone={(rv: any) => { setReview(rv); setView('review'); loadStatus() }} />
  }
  if (view === 'review' && review) {
    return <ReviewView review={review} onBack={() => { setView('intro'); setReview(null); loadStatus() }} />
  }

  // ── Intro ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #0f4a32 100%)`, padding: '1.5rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <button onClick={() => router.push('/student/jamb')} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 20, padding: '0.375rem 0.875rem', fontSize: '0.78rem', cursor: 'pointer', marginBottom: '1rem' }}>← JAMB Prep</button>
          <h1 style={{ color: 'white', fontSize: '1.4rem', fontWeight: 700 }}>📝 Mock Exam</h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.86rem' }}>Real past UTME questions in your four subjects, timed like the real exam and scored out of 400.</p>
        </div>
      </div>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1.5rem', display: 'grid', gap: '1rem' }}>
        {error && <div style={{ ...card, background: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c', fontSize: '0.86rem' }}>{error}</div>}
        {!status ? <p style={{ color: '#6b6b65' }}>Loading…</p> : status.subjects.length !== 4 ? (
          <div style={card}>
            <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Choose your four JAMB subjects first.</p>
            <button style={btn} onClick={() => router.push('/student/jamb')}>Go to JAMB Prep</button>
          </div>
        ) : (
          <>
            {status.openAttempt && (
              <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontWeight: 700, color: '#92400e' }}>You have a mock in progress</p>
                  <p style={{ fontSize: '0.82rem', color: '#92400e' }}>The clock keeps running. Time ends {new Date(status.openAttempt.endsAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}.</p>
                </div>
                <button style={btn} onClick={() => openAttempt(status.openAttempt.id)}>Resume</button>
              </div>
            )}
            {status.modes.map((m: any) => {
              const lacking = status.subjects.filter((s: any) => s.available < (m.mode === 'full' ? s.neededFull : s.neededShort))
              return (
                <div key={m.mode} style={{ ...card, opacity: m.available ? 1 : 0.75 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '1.05rem', fontWeight: 700 }}>{m.label}</p>
                      <p style={{ fontSize: '0.84rem', color: '#6b6b65' }}>
                        {m.questions} questions · {m.minutes} minutes · {m.mode === 'full' ? 'English 60, other subjects 40 each' : 'English 15, other subjects 10 each'}
                      </p>
                    </div>
                    <button style={{ ...btn, opacity: m.available && !starting && !status.openAttempt ? 1 : 0.5 }}
                      disabled={!m.available || starting || !!status.openAttempt} onClick={() => start(m.mode)}>
                      {starting ? 'Starting…' : 'Start'}
                    </button>
                  </div>
                  {!m.available && (
                    <p style={{ fontSize: '0.78rem', color: '#b45309', marginTop: '0.5rem' }}>
                      Not enough past questions yet in {lacking.map((s: any) => s.name).join(', ')}. More are added regularly.
                    </p>
                  )}
                </div>
              )
            })}
            <div style={{ ...card, fontSize: '0.84rem', color: '#3a3a36' }}>
              <p style={{ fontWeight: 700, marginBottom: '0.4rem' }}>How it works</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
                <li>Answers save automatically as you go. You can move between subjects and questions freely.</li>
                <li>No answers are shown until you submit, just like the real exam.</li>
                <li>When time runs out, your paper is submitted with the answers you’ve given.</li>
                <li>Each subject is scored out of 100; your total is out of 400.</li>
              </ul>
            </div>
            {status.history.length > 0 && (
              <div style={card}>
                <p style={{ fontWeight: 700, marginBottom: '0.6rem' }}>Your mocks</p>
                {status.history.map((h: any) => (
                  <button key={h.id} onClick={() => openAttempt(h.id)}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', background: 'none', border: 'none', borderTop: '1px solid #f0f0ee', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: '0.86rem' }}>{new Date(h.submitted_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} · {h.mode === 'full' ? 'Full mock' : 'Quick mock'}</span>
                    <span style={{ fontWeight: 700, color: GREEN }}>{h.utme_score}<span style={{ color: '#a0a09a', fontWeight: 400 }}>/400</span> ›</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Sitting the exam ───────────────────────────────────────────────────────
function ExamView({ paper, onDone }: { paper: any; onDone: (review: any) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>(paper.answers ?? {})
  const [sIdx, setSIdx] = useState(0)
  const [qIdx, setQIdx] = useState(0)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved')
  const [submitting, setSubmitting] = useState(false)
  const pending = useRef<Record<string, string>>({})
  const offset = useRef(new Date(paper.serverNow).getTime() - Date.now())
  const endsAt = new Date(paper.endsAt).getTime()
  const [now, setNow] = useState(Date.now())
  const submitted = useRef(false)

  const subject = paper.subjects[sIdx]
  const q = subject.questions[qIdx]
  const remaining = endsAt - (now + offset.current)
  const totalQ = useMemo(() => paper.subjects.reduce((n: number, s: any) => n + s.questions.length, 0), [paper])
  const answered = Object.keys(answers).length

  const flush = useCallback(async () => {
    const batch = pending.current
    if (Object.keys(batch).length === 0) return
    pending.current = {}
    setSaveState('saving')
    try {
      const r = await call(`/jamb/mock/${paper.id}/answers`, { method: 'PATCH', body: JSON.stringify({ answers: batch }) })
      if (r.ok) setSaveState('saved')
      else if (r.status === 410) { submitNow(true) }
      else { pending.current = { ...batch, ...pending.current }; setSaveState('offline') }
    } catch { pending.current = { ...batch, ...pending.current }; setSaveState('offline') }
  }, [paper.id])

  const submitNow = useCallback(async (auto = false) => {
    if (submitted.current) return
    submitted.current = true
    setSubmitting(true)
    const r = await call(`/jamb/mock/${paper.id}/submit`, { method: 'POST', body: JSON.stringify({ answers: { ...answersRef.current } }) })
    if (r.ok) onDone(r.data.attempt)
    else { submitted.current = false; setSubmitting(false); if (!auto) alert('Could not submit. Check your connection and try again.') }
  }, [paper.id, onDone])

  const answersRef = useRef(answers)
  useEffect(() => { answersRef.current = answers }, [answers])

  // clock + periodic autosave
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    const s = setInterval(() => { flush() }, 15000)
    return () => { clearInterval(t); clearInterval(s) }
  }, [flush])
  useEffect(() => { if (remaining <= 0 && !submitted.current) submitNow(true) }, [remaining, submitNow])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (!submitted.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  function choose(opt: string) {
    setAnswers(a => ({ ...a, [q.id]: opt }))
    pending.current[q.id] = opt
    setSaveState('saving')
    setTimeout(flush, 1200)
  }

  function next() {
    if (qIdx < subject.questions.length - 1) setQIdx(qIdx + 1)
    else if (sIdx < paper.subjects.length - 1) { setSIdx(sIdx + 1); setQIdx(0) }
  }
  function prev() {
    if (qIdx > 0) setQIdx(qIdx - 1)
    else if (sIdx > 0) { setSIdx(sIdx - 1); setQIdx(paper.subjects[sIdx - 1].questions.length - 1) }
  }
  function confirmSubmit() {
    const left = totalQ - answered
    if (confirm(left > 0 ? `You have ${left} unanswered question(s). Submit anyway? You can't change answers after submitting.` : "Submit your paper? You can't change answers after submitting.")) submitNow()
  }

  const low = remaining < 5 * 60 * 1000
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'white', borderBottom: '1px solid #e5e5e0', padding: '0.75rem 1rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: low ? '#b91c1c' : '#1a1a18', fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtClock(remaining)}</div>
          <div style={{ fontSize: '0.84rem', color: '#6b6b65' }}>
            {answered}/{totalQ} answered · {saveState === 'saved' ? '✓ Saved' : saveState === 'saving' ? 'Saving…' : '⚠ Offline — will retry'}
          </div>
          <button style={{ ...btn, opacity: submitting ? 0.6 : 1 }} disabled={submitting} onClick={confirmSubmit}>{submitting ? 'Submitting…' : 'Submit paper'}</button>
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {paper.subjects.map((s: any, i: number) => {
            const done = s.questions.filter((x: any) => answers[x.id]).length
            return (
              <button key={s.id} onClick={() => { setSIdx(i); setQIdx(0) }}
                style={{ padding: '0.5rem 0.9rem', borderRadius: 10, border: `1.5px solid ${i === sIdx ? GREEN : '#e5e5e0'}`, background: i === sIdx ? '#e8f5ee' : 'white', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
                {s.name} <span style={{ color: '#6b6b65', fontWeight: 400 }}>{done}/{s.questions.length}</span>
              </button>
            )
          })}
        </div>
        <div style={{ ...card, marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '0.5rem' }}>{subject.name} · Question {qIdx + 1} of {subject.questions.length}</p>
          <p style={{ fontSize: '1rem', lineHeight: 1.6, marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>{q.question}</p>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {OPTS.map(o => {
              const sel = answers[q.id] === o
              return (
                <button key={o} onClick={() => choose(o)}
                  style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.8rem 1rem', borderRadius: 12, border: `2px solid ${sel ? '#1e40af' : '#e5e5e0'}`, background: sel ? '#eff6ff' : 'white', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 28, height: 28, borderRadius: '50%', background: sel ? '#1e40af' : '#f0f0ee', color: sel ? 'white' : '#6b6b65', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>{o.toUpperCase()}</span>
                  <span style={{ fontSize: '0.92rem' }}>{q[`option_${o}`]}</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
            <button style={ghost} onClick={prev} disabled={sIdx === 0 && qIdx === 0}>← Previous</button>
            <button style={ghost} onClick={next} disabled={sIdx === paper.subjects.length - 1 && qIdx === subject.questions.length - 1}>Next →</button>
          </div>
        </div>
        <div style={card}>
          <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '0.5rem' }}>{subject.name}: jump to a question</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {subject.questions.map((x: any, i: number) => (
              <button key={x.id} onClick={() => setQIdx(i)}
                style={{ width: 34, height: 34, borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                  border: i === qIdx ? `2px solid ${GREEN}` : '1px solid #e5e5e0',
                  background: answers[x.id] ? '#e8f5ee' : 'white', color: answers[x.id] ? '#0f4a32' : '#6b6b65' }}>{i + 1}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Marked paper ───────────────────────────────────────────────────────────
function ReviewView({ review, onBack }: { review: any; onBack: () => void }) {
  const [sIdx, setSIdx] = useState(0)
  const [filter, setFilter] = useState<'all' | 'wrong' | 'blank'>('wrong')
  const subject = review.subjects[sIdx]
  const qs = (subject?.questions ?? []).filter((q: any) =>
    filter === 'all' || (filter === 'blank' ? !q.yourAnswer : q.yourAnswer && q.yourAnswer !== q.correct_option))
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem', display: 'grid', gap: '1rem' }}>
        <button style={{ ...ghost, width: 'fit-content' }} onClick={onBack}>← Mock exams</button>
        <div style={{ ...card, textAlign: 'center' }}>
          <p style={{ fontSize: '0.84rem', color: '#6b6b65' }}>{review.mode === 'full' ? 'Full UTME mock' : 'Quick mock'} · {new Date(review.submittedAt).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          <p style={{ fontSize: '2.6rem', fontWeight: 800, color: GREEN }}>{review.utmeScore}<span style={{ fontSize: '1.2rem', color: '#a0a09a' }}>/400</span></p>
          <p style={{ fontSize: '0.86rem', color: '#3a3a36' }}>{review.correct} of {review.total} correct</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
          {review.subjects.map((s: any, i: number) => (
            <button key={s.subjectId} onClick={() => setSIdx(i)} style={{ ...card, cursor: 'pointer', textAlign: 'left', borderColor: i === sIdx ? GREEN : '#e5e5e0', borderWidth: i === sIdx ? 2 : 1 }}>
              <p style={{ fontSize: '0.8rem', color: '#6b6b65' }}>{s.name}</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800 }}>{s.score}<span style={{ fontSize: '0.8rem', color: '#a0a09a' }}>/100</span></p>
              <p style={{ fontSize: '0.75rem', color: '#6b6b65' }}>{s.correct}/{s.total} correct · {s.total - s.answered} blank</p>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          {(['wrong', 'blank', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...ghost, padding: '0.45rem 0.9rem', fontSize: '0.8rem', borderColor: filter === f ? GREEN : '#e5e5e0' }}>
              {f === 'wrong' ? 'Wrong answers' : f === 'blank' ? 'Unanswered' : 'All questions'}
            </button>
          ))}
        </div>
        {qs.length === 0 && <p style={{ color: '#6b6b65', fontSize: '0.86rem' }}>Nothing to show here.</p>}
        {qs.map((q: any, i: number) => (
          <div key={q.id} style={card}>
            <p style={{ fontSize: '0.75rem', color: '#a0a09a', marginBottom: '0.35rem' }}>{subject.name}{q.year ? ` · UTME ${q.year}` : ''}</p>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{q.question}</p>
            {OPTS.map(o => {
              const isCorrect = o === q.correct_option, isYours = o === q.yourAnswer
              return (
                <div key={o} style={{ padding: '0.45rem 0.75rem', borderRadius: 8, marginBottom: '0.3rem', fontSize: '0.88rem',
                  background: isCorrect ? '#e8f5ee' : isYours ? '#fef2f2' : 'transparent', color: isCorrect ? '#0f4a32' : isYours ? '#b91c1c' : '#3a3a36' }}>
                  <strong>{o.toUpperCase()}.</strong> {q[`option_${o}`]} {isCorrect ? ' ✓' : isYours ? ' ✗ your answer' : ''}
                </div>
              )
            })}
            {!q.yourAnswer && <p style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '0.35rem' }}>You didn’t answer this one.</p>}
            {q.explanation && <p style={{ fontSize: '0.84rem', color: '#78350f', background: '#fffbeb', borderRadius: 8, padding: '0.6rem 0.8rem', marginTop: '0.5rem' }}>💡 {q.explanation}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
