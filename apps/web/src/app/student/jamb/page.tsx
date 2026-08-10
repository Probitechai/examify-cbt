'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../hooks/useAuth'

const API = process.env.NEXT_PUBLIC_API_URL

`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}

// ── Confetti animation ────────────────────────────────────────────────────────
function Confetti({ show }: { show: boolean }) {
  if (!show) return null
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.5}s`,
    color: ['#1a6b4a', '#d4af37', '#1e40af', '#dc2626', '#7e22ce'][Math.floor(Math.random() * 5)],
    size: `${6 + Math.random() * 8}px`,
  }))
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: '-10px', left: p.left,
          width: p.size, height: p.size, background: p.color, borderRadius: '2px',
          animation: `fall 1.5s ${p.delay} ease-in forwards`,
        }} />
      ))}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes bounce-in {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes slide-in {
          0% { transform: translateX(60px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        @keyframes pulse-xp {
          0% { transform: scale(1); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes progress-fill {
          0% { width: 0; }
        }
      `}</style>
    </div>
  )
}

// ── Heart lives ───────────────────────────────────────────────────────────────
function Hearts({ lives }: { lives: number }) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem' }}>
      {[1,2,3].map(i => (
        <span key={i} style={{ fontSize: '1.25rem', opacity: i <= lives ? 1 : 0.2, transition: 'opacity 0.3s' }}>❤️</span>
      ))}
    </div>
  )
}

// ── XP Badge ──────────────────────────────────────────────────────────────────
function XPBadge({ xp, animate }: { xp: number; animate: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.875rem', background: '#d4af37', borderRadius: 20, animation: animate ? 'pulse-xp 0.5s ease' : 'none' }}>
      <span style={{ fontSize: '0.875rem' }}>⚡</span>
      <span style={{ fontSize: '0.825rem', fontWeight: 700, color: 'white' }}>{xp} XP</span>
    </div>
  )
}

// ── Progress ring ─────────────────────────────────────────────────────────────
function ProgressRing({ pct, size = 60, color = '#1a6b4a', label }: { pct: number; size?: number; color?: string; label?: string }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f0f0ee" strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease', strokeLinecap: 'round' }} />
      </svg>
      {label && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color }}>
          {label}
        </div>
      )}
    </div>
  )
}

type Screen = 'home' | 'setup' | 'subject' | 'topic' | 'quiz' | 'result' | 'summary'

export default function JambPrepPage() {
  const router = useRouter()
  const { user, isLoading, hydrate } = useAuthStore()
  const [screen, setScreen] = useState<Screen>('home')
  const [subjects, setSubjects] = useState<any[]>([])
  const [topics, setTopics] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [progress, setProgress] = useState<any[]>([])
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [activeSubject, setActiveSubject] = useState<any>(null)
  const [activeTopic, setActiveTopic] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [lives, setLives] = useState(3)
  const [score, setScore] = useState(0)
  const [sessionXp, setSessionXp] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)
  const [animateXp, setAnimateXp] = useState(false)
  const [sessionType, setSessionType] = useState<'practice' | 'past_questions' | 'ai_generated'>('practice')
  const [aiLoading, setAiLoading] = useState(false)
  const [summaryContent, setSummaryContent] = useState('')
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [error, setError] = useState('')
  const questionRef = useRef<HTMLDivElement>(null)

  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.classLevel !== 'SS3') router.replace('/student')
  }, [user, isLoading, router])
  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => {
    if (user) {
      loadSubjects()
      loadProfile()
    }
  }, [user])

  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => {
    // Auto-select English Language when subjects load
    if (subjects.length > 0 && selectedSubjects.length === 0) {
      const english = subjects.find(s => s.is_compulsory)
      if (english) setSelectedSubjects([english.id])
    }
  }, [subjects])

  async function loadSubjects() {
    const res = await apiFetch(`${API}/jamb/subjects`)
    const data = await res.json()
    setSubjects(data.subjects ?? [])
  }

  async function loadProfile() {
    const res = await apiFetch(`${API}/jamb/profile`)
    const data = await res.json()
    setProfile(data.profile)
    if (data.profile?.selected_subjects?.length) {
      setSelectedSubjects(data.profile.selected_subjects)
    }
    const progRes = await apiFetch(`${API}/jamb/progress`)
    const progData = await progRes.json()
    setProgress(progData.progress ?? [])
  }

  async function loadTopics(subjectId: string) {
    const res = await apiFetch(`${API}/jamb/subjects/${subjectId}/topics`)
    const data = await res.json()
    setTopics(data.topics ?? [])
  }

  async function saveProfile() {
    if (selectedSubjects.length !== 4) { setError('Please select 3 more subjects in addition to English Language'); return }
        await apiFetch(`${API}/jamb/profile`, {
      body: JSON.stringify({ selectedSubjects, targetScore: 280, dailyGoalQuestions: 20 })
    await loadProfile()
    setScreen('home')
  }

  async function startPastQuestions(subjectId: string, topicId?: string) {
    setLoadingQuestions(true); setError('')
    try {
      let url = `${API}/jamb/questions?subjectId=${subjectId}&limit=10`
      if (topicId) url += `&topicId=${topicId}`
      const res = await apiFetch(url)
      const data = await res.json()
      if (!data.questions?.length) { setError('No past questions available for this topic yet. Try AI Practice instead.'); setLoadingQuestions(false); return }
      setQuestions(data.questions)
      setCurrentQ(0); setSelectedAnswer(null); setConfirmed(false)
      setLives(3); setScore(0); setSessionXp(0)
      setSessionType('past_questions')
      setScreen('quiz')
    } catch { setError('Failed to load questions') } finally { setLoadingQuestions(false) }
  }

  async function startAiQuiz(subject: any, topic: any) {
    setAiLoading(true); setError('')
    try {
            const res = await apiFetch(`${API}/jamb/ai/quiz`, {
        body: JSON.stringify({ subjectName: subject.name, topicName: topic.name })
      const data = await res.json()
      if (!res.ok || !data.questions?.length) throw new Error('No questions generated')
      setQuestions(data.questions.slice(0, 10).map((q: any, i: number) => ({ ...q, id: `ai-${i}` })))
      setCurrentQ(0); setSelectedAnswer(null); setConfirmed(false)
      setLives(3); setScore(0); setSessionXp(0)
      setSessionType('ai_generated')
      setScreen('quiz')
    } catch (e: any) { setError('Failed to generate questions. Please try again.') } finally { setAiLoading(false) }
  }

  async function loadAiSummary(subject: any, topic: any) {
    setAiLoading(true); setSummaryContent(''); setScreen('summary')
    try {
            const res = await apiFetch(`${API}/jamb/ai/summary`, {
        body: JSON.stringify({ subjectName: subject.name, topicName: topic.name })
      const data = await res.json()
      setSummaryContent(data.summary ?? 'Could not generate summary.')
    } catch { setSummaryContent('Failed to generate summary. Please try again.') } finally { setAiLoading(false) }
  }

  function confirmAnswer() {
    if (!selectedAnswer) return
    const q = questions[currentQ]
    const isCorrect = selectedAnswer === q.correct_option
    setConfirmed(true)
    if (isCorrect) {
      const xp = 10
      setScore(s => s + 1)
      setSessionXp(s => s + xp)
      setAnimateXp(true)
      setTimeout(() => setAnimateXp(false), 500)
      if (currentQ === questions.length - 1) setShowConfetti(true)
    } else {
      setLives(l => l - 1)
    }
  }

  async function nextQuestion() {
    if (lives <= 0 || currentQ >= questions.length - 1) {
      await saveSession()
      setScreen('result')
      return
    }
    setCurrentQ(q => q + 1)
    setSelectedAnswer(null)
    setConfirmed(false)
    if (questionRef.current) {
      questionRef.current.style.animation = 'none'
      setTimeout(() => { if (questionRef.current) questionRef.current.style.animation = 'slide-in 0.3s ease' }, 10)
    }
  }

  async function saveSession() {
    if (!activeSubject) return
    try {
            await apiFetch(`${API}/jamb/sessions`, {
        body: JSON.stringify({
          subjectId: activeSubject.id,
          topicId: activeTopic?.id,
          sessionType,
          questions,
          answers: {},
          score,
          totalQuestions: questions.length,
      await loadProfile()
    } catch {}
    setShowConfetti(false)
  }

  if (isLoading || !user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const initials = user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  // ── SETUP SCREEN ─────────────────────────────────────────────────────────────
  if (screen === 'setup') return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <button onClick={() => setScreen('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.5rem' }}>← Back</button>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>Choose Your JAMB Subjects</h1>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '2rem' }}>Select exactly <strong>4 subjects</strong>. English Language is compulsory.</p>
        {error && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.825rem', color: '#dc2626' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '2rem' }}>
          {subjects.map(s => {
            const selected = selectedSubjects.includes(s.id)
            const isCompulsory = s.is_compulsory
            return (
              <button key={s.id}
                onClick={() => {
                  if (isCompulsory) return
                  if (selected) setSelectedSubjects(prev => prev.filter(id => id !== s.id))
                  else if (selectedSubjects.length < 4) setSelectedSubjects(prev => [...prev, s.id])
                  // Max 4 total (1 compulsory + 3 chosen)
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', background: selected ? s.color ?? '#1a6b4a' : 'white', border: `2px solid ${selected ? s.color ?? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '12px', cursor: isCompulsory ? 'default' : 'pointer', transition: 'all 0.2s', textAlign: 'left' as const }}>
                <span style={{ fontSize: '1.25rem' }}>{s.icon}</span>
                <div>
                  <p style={{ fontSize: '0.825rem', fontWeight: 600, color: selected ? 'white' : '#1a1a18' }}>{s.name}</p>
                  {isCompulsory && <p style={{ fontSize: '0.65rem', color: selected ? 'rgba(255,255,255,0.8)' : '#6b6b65' }}>Compulsory</p>}
                </div>
                {selected && <span style={{ marginLeft: 'auto', color: 'white', fontSize: '0.875rem' }}>✓</span>}
              </button>
            )
          })}
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.875rem', color: '#1a1a18' }}>Selected: {selectedSubjects.length}/4 ({selectedSubjects.length === 4 ? '✓ Ready!' : `pick ${4 - selectedSubjects.length} more`})</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {selectedSubjects.map(sid => {
              const s = subjects.find(s => s.id === sid)
              return s ? <span key={sid} style={{ fontSize: '1.25rem' }}>{s.icon}</span> : null
            })}
          </div>
        </div>
        <button onClick={saveProfile} disabled={selectedSubjects.length !== 4}
          style={{ width: '100%', padding: '1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', opacity: selectedSubjects.length !== 4 ? 0.5 : 1, transition: 'opacity 0.2s' }}>
          Start Preparing! 🚀
        </button>
      </div>
    </div>
  )

  // ── SUBJECT SCREEN ────────────────────────────────────────────────────────────
  if (screen === 'subject' && activeSubject) return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ background: activeSubject.color ?? '#1a6b4a', padding: '1.5rem', paddingTop: '2rem' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <button onClick={() => setScreen('home')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: 'white', padding: '0.375rem 0.875rem', borderRadius: 20, marginBottom: '1rem' }}>← Back</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2.5rem' }}>{activeSubject.icon}</span>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>{activeSubject.name}</h1>
              <p style={{ fontSize: '0.825rem', color: 'rgba(255,255,255,0.8)' }}>{topics.length} topics</p>
            </div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '1.5rem' }}>
        {error && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.825rem', color: '#dc2626' }}>{error}</div>}
        {loadingQuestions && <div style={{ textAlign: 'center' as const, padding: '2rem', color: '#6b6b65' }}>Loading questions...</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {topics.map(topic => {
            const topicProgress = progress.find(p => p.topic_id === topic.id)
            const mastery = topicProgress?.mastery_pct ?? 0
            return (
              <div key={topic.id} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.875rem' }}>
                  <ProgressRing pct={mastery} size={52} color={activeSubject.color ?? '#1a6b4a'} label={`${mastery}%`} />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>{topic.name}</h3>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>
                      {topic.question_count > 0 ? `${topic.question_count} past questions` : 'No past questions yet'} · {topic.difficulty_level}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => { setActiveTopic(topic); loadAiSummary(activeSubject, topic) }}
                    style={{ flex: 1, padding: '0.5rem', background: '#f0fdf4', border: '1.5px solid #1a6b4a', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer' }}>
                    📝 Study Notes
                  </button>
                  <button onClick={() => { setActiveTopic(topic); startAiQuiz(activeSubject, topic) }} disabled={aiLoading}
                    style={{ flex: 1, padding: '0.5rem', background: '#7e22ce', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, color: 'white', cursor: 'pointer', opacity: aiLoading ? 0.6 : 1 }}>
                    🤖 AI Practice
                  </button>
                  {Number(topic.question_count) > 0 && (
                    <button onClick={() => { setActiveTopic(topic); startPastQuestions(activeSubject.id, topic.id) }} disabled={loadingQuestions}
                      style={{ flex: 1, padding: '0.5rem', background: '#1e40af', border: 'none', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, color: 'white', cursor: 'pointer', opacity: loadingQuestions ? 0.6 : 1 }}>
                      📚 Past Q's
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  // ── SUMMARY SCREEN ────────────────────────────────────────────────────────────
  if (screen === 'summary') return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ background: activeSubject?.color ?? '#1a6b4a', padding: '1.25rem' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setScreen('subject')} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: 'white', padding: '0.375rem 0.875rem', borderRadius: 20 }}>← Back</button>
          <h2 style={{ color: 'white', fontSize: '0.95rem', fontWeight: 600 }}>{activeTopic?.name}</h2>
          <div style={{ width: 80 }} />
        </div>
      </div>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '1.5rem' }}>
        {aiLoading ? (
          <div style={{ background: 'white', borderRadius: '16px', padding: '3rem', textAlign: 'center' as const }}>
            <div style={{ width: 40, height: 40, border: '3px solid #e5e5e0', borderTopColor: activeSubject?.color ?? '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1rem' }} />
            <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Claude is preparing your study notes...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f0f0ee' }}>
              <span style={{ fontSize: '1.5rem' }}>{activeSubject?.icon}</span>
              <div>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{activeSubject?.name}</p>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a18' }}>{activeTopic?.name}</h2>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: '#7e22ce', color: 'white' }}>AI Notes</span>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#1a1a18', lineHeight: 1.8, whiteSpace: 'pre-wrap' as const }}>
              {summaryContent}
            </div>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => startAiQuiz(activeSubject, activeTopic)}
                style={{ flex: 1, padding: '0.75rem', background: '#7e22ce', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                🤖 Practice with AI Quiz
              </button>
              <button onClick={() => setScreen('subject')}
                style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ── QUIZ SCREEN ───────────────────────────────────────────────────────────────
  if (screen === 'quiz' && questions.length > 0) {
    const q = questions[currentQ]
    const progress_pct = ((currentQ) / questions.length) * 100
    const isCorrect = confirmed && selectedAnswer === q.correct_option
    const isWrong = confirmed && selectedAnswer !== q.correct_option
    const options = [
      { key: 'a', text: q.option_a }, { key: 'b', text: q.option_b },
      { key: 'c', text: q.option_c }, { key: 'd', text: q.option_d },
    ].filter(o => o.text)

    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui', display: 'flex', flexDirection: 'column' }}>
        <Confetti show={showConfetti} />

        {/* Quiz header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e5e5e0', padding: '0.875rem 1.5rem' }}>
          <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => { setScreen('subject'); setShowConfetti(false) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b65', fontSize: '1.25rem', flexShrink: 0 }}>✕</button>
            <div style={{ flex: 1 }}>
              <div style={{ height: 8, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${progress_pct}%`, height: '100%', background: activeSubject?.color ?? '#1a6b4a', borderRadius: 4, transition: 'width 0.4s ease' }} />
              </div>
            </div>
            <Hearts lives={lives} />
            <XPBadge xp={sessionXp} animate={animateXp} />
          </div>
        </div>

        {/* Question */}
        <div style={{ flex: 1, maxWidth: 700, margin: '0 auto', padding: '2rem 1.5rem', width: '100%' }}>
          <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
              {sessionType === 'ai_generated' ? '🤖 AI Practice' : sessionType === 'past_questions' ? '📚 Past Question' : '📝 Practice'}
              {q.year && ` · JAMB ${q.year}`}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{currentQ + 1}/{questions.length}</span>
          </div>

          <div ref={questionRef} style={{ animation: 'slide-in 0.3s ease' }}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.75rem', marginBottom: '1.25rem', border: '1px solid #e5e5e0', minHeight: 120 }}>
              <p style={{ fontSize: '1rem', fontWeight: 500, color: '#1a1a18', lineHeight: 1.7 }}>{q.question}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
              {options.map(opt => {
                let bg = 'white', border = '#e5e5e0', color = '#1a1a18', fontWeight = 400
                if (confirmed) {
                  if (opt.key === q.correct_option) { bg = '#e8f5ee'; border = '#1a6b4a'; color = '#0f4a32'; fontWeight = 600 }
                  else if (opt.key === selectedAnswer) { bg = '#fef2f2'; border = '#dc2626'; color = '#dc2626'; fontWeight = 600 }
                  else { bg = '#f7f7f5'; color = '#a0a09a' }
                } else if (selectedAnswer === opt.key) {
                  bg = '#eff6ff'; border = '#1e40af'; color = '#1e40af'; fontWeight = 600
                }
                return (
                  <button key={opt.key} onClick={() => !confirmed && setSelectedAnswer(opt.key)}
                    disabled={confirmed}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1.25rem', background: bg, border: `2px solid ${border}`, borderRadius: '12px', cursor: confirmed ? 'default' : 'pointer', textAlign: 'left' as const, transition: 'all 0.15s', animation: confirmed && opt.key === selectedAnswer && opt.key !== q.correct_option ? 'shake 0.4s ease' : 'none' }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: selectedAnswer === opt.key && !confirmed ? '#1e40af' : confirmed && opt.key === q.correct_option ? '#1a6b4a' : confirmed && opt.key === selectedAnswer ? '#dc2626' : '#f0f0ee', color: (selectedAnswer === opt.key) || (confirmed && (opt.key === q.correct_option || opt.key === selectedAnswer)) ? 'white' : '#6b6b65', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, flexShrink: 0, transition: 'all 0.15s' }}>
                      {opt.key.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.9rem', color, fontWeight, flex: 1 }}>{opt.text}</span>
                    {confirmed && opt.key === q.correct_option && <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>✅</span>}
                    {confirmed && opt.key === selectedAnswer && opt.key !== q.correct_option && <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>❌</span>}
                  </button>
                )
              })}
            </div>

            {/* Explanation */}
            {confirmed && q.explanation && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem', animation: 'bounce-in 0.4s ease' }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e', marginBottom: '0.375rem' }}>💡 Explanation</p>
                <p style={{ fontSize: '0.875rem', color: '#78350f', lineHeight: 1.6 }}>{q.explanation}</p>
              </div>
            )}
          </div>

          {/* Action button */}
          <button
            onClick={confirmed ? nextQuestion : confirmAnswer}
            disabled={!selectedAnswer && !confirmed}
            style={{ width: '100%', padding: '1rem', background: confirmed ? (isCorrect ? '#1a6b4a' : '#dc2626') : '#1e40af', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', opacity: !selectedAnswer && !confirmed ? 0.5 : 1, transition: 'all 0.2s' }}>
            {!confirmed ? 'Check Answer' : currentQ >= questions.length - 1 || lives <= 0 ? 'See Results 🏆' : isCorrect ? 'Next Question →' : 'Continue →'}
          </button>
        </div>
      </div>
    )
  }

  // ── RESULT SCREEN ─────────────────────────────────────────────────────────────
  if (screen === 'result') {
    const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0
    const grade = pct >= 80 ? { label: 'Excellent! 🌟', color: '#1a6b4a', bg: '#e8f5ee' }
      : pct >= 60 ? { label: 'Good work! 👍', color: '#1e40af', bg: '#eff6ff' }
      : pct >= 40 ? { label: 'Keep going! 💪', color: '#d97706', bg: '#fffbeb' }
      : { label: 'Study more! 📚', color: '#dc2626', bg: '#fef2f2' }
    return (
      <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
        <div style={{ background: 'white', borderRadius: '24px', padding: '2.5rem', width: '100%', maxWidth: 420, textAlign: 'center' as const, animation: 'bounce-in 0.5s ease' }}>
          <div style={{ width: 120, height: 120, margin: '0 auto 1.5rem' }}>
            <ProgressRing pct={pct} size={120} color={grade.color} label={`${pct}%`} />
          </div>
          <div style={{ background: grade.bg, borderRadius: '12px', padding: '0.875rem', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, color: grade.color }}>{grade.label}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1rem' }}>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a6b4a' }}>{score}</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Correct</p>
            </div>
            <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1rem' }}>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{questions.length - score}</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Wrong</p>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: '12px', padding: '1rem' }}>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d4af37' }}>+{sessionXp}</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>XP</p>
            </div>
          </div>
          {profile && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1.5rem', padding: '0.875rem', background: '#f7f7f5', borderRadius: '12px' }}>
              <div style={{ textAlign: 'center' as const }}>
                <p style={{ fontSize: '1.25rem' }}>🔥</p>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>{profile.current_streak}</p>
                <p style={{ fontSize: '0.65rem', color: '#6b6b65' }}>Day streak</p>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <p style={{ fontSize: '1.25rem' }}>⚡</p>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>{profile.total_xp}</p>
                <p style={{ fontSize: '0.65rem', color: '#6b6b65' }}>Total XP</p>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <p style={{ fontSize: '1.25rem' }}>🎯</p>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>{profile.total_questions_attempted}</p>
                <p style={{ fontSize: '0.65rem', color: '#6b6b65' }}>Questions</p>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={() => { setCurrentQ(0); setSelectedAnswer(null); setConfirmed(false); setLives(3); setScore(0); setSessionXp(0); setShowConfetti(false); setScreen('quiz') }}
              style={{ flex: 1, padding: '0.875rem', background: activeSubject?.color ?? '#1a6b4a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer' }}>
              Try Again 🔄
            </button>
            <button onClick={() => setScreen('subject')}
              style={{ flex: 1, padding: '0.875rem', background: 'white', border: '2px solid #e5e5e0', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', cursor: 'pointer' }}>
              More Topics
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── HOME SCREEN ───────────────────────────────────────────────────────────────
  const mySubjects = subjects.filter(s => profile?.selected_subjects?.includes(s.id))
  const totalXp = profile?.total_xp ?? 0
  const streak = profile?.current_streak ?? 0
  const totalAttempted = profile?.total_questions_attempted ?? 0
  const accuracy = totalAttempted > 0 ? Math.round((profile?.total_correct / totalAttempted) * 100) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a6b4a 0%, #0f4a32 100%)', padding: '1.5rem' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>JAMB Prep</p>
              <h1 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700 }}>Welcome back, {user.fullName.split(' ')[0]}! 👋</h1>
            </div>
            <button onClick={() => router.push('/student')}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 20, padding: '0.375rem 0.875rem', fontSize: '0.78rem', cursor: 'pointer' }}>
              Dashboard
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {[
              { icon: '🔥', value: streak, label: 'Day Streak' },
              { icon: '⚡', value: totalXp, label: 'Total XP' },
              { icon: '📝', value: totalAttempted, label: 'Questions' },
              { icon: '🎯', value: `${accuracy}%`, label: 'Accuracy' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '0.875rem', textAlign: 'center' as const }}>
                <p style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{stat.icon}</p>
                <p style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>{stat.value}</p>
                <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', padding: '1.5rem' }}>
        {!profile?.selected_subjects?.length ? (
          <div style={{ background: 'white', borderRadius: '16px', padding: '2.5rem', textAlign: 'center' as const, border: '2px dashed #e5e5e0' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎯</p>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>Set Up Your JAMB Prep</h2>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>Choose your 4 JAMB subjects to get a personalized study plan.</p>
            <button onClick={() => setScreen('setup')}
              style={{ padding: '0.875rem 2rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>
              Get Started 🚀
            </button>
          </div>
        ) : (
          <>
            {/* My Subjects */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1a1a18' }}>My Subjects</h2>
              <button onClick={() => setScreen('setup')}
                style={{ fontSize: '0.78rem', color: '#1a6b4a', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                Change subjects
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {mySubjects.map(s => {
                const subjectProgress = progress.filter(p => {
                  return subjects.find(sub => sub.id === s.id)
                })
                const avgMastery = subjectProgress.length > 0
                  ? Math.round(subjectProgress.reduce((a: number, b: any) => a + Number(b.mastery_pct), 0) / subjectProgress.length)
                  : 0
                return (
                  <button key={s.id}
                    onClick={async () => {
                      setActiveSubject(s)
                      await loadTopics(s.id)
                      setScreen('subject')
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '1rem', background: 'white', border: `2px solid ${s.color ?? '#e5e5e0'}20`, borderRadius: '14px', cursor: 'pointer', textAlign: 'left' as const, transition: 'transform 0.15s, box-shadow 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none' }}>
                    <ProgressRing pct={avgMastery} size={52} color={s.color ?? '#1a6b4a'} label={`${avgMastery}%`} />
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>{s.name}</p>
                      <p style={{ fontSize: '0.72rem', color: s.color ?? '#6b6b65' }}>{s.topic_count} topics</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Daily goal */}
            {profile && (
              <div style={{ background: 'white', borderRadius: '14px', padding: '1.25rem', border: '1px solid #e5e5e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>📅 Today's Goal</h3>
                  <span style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{Math.min(totalAttempted, profile.daily_goal_questions)}/{profile.daily_goal_questions} questions</span>
                </div>
                <div style={{ height: 10, background: '#f0f0ee', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (totalAttempted / profile.daily_goal_questions) * 100)}%`, height: '100%', background: 'linear-gradient(to right, #1a6b4a, #d4af37)', borderRadius: 5, transition: 'width 0.8s ease' }} />
                </div>
                {streak > 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#d97706', marginTop: '0.625rem', fontWeight: 600 }}>🔥 {streak} day streak! Keep it up!</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}