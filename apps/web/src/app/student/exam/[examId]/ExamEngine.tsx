'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '../../../../hooks/useAuth'
import { api } from '../../../../lib/api'
import styles from './exam.module.css'

type ExamState = 'loading' | 'taking' | 'submitting' | 'submitted' | 'error'

export default function ExamEngine() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const { user, hydrate } = useAuthStore()

  const [examState, setExamState] = useState<ExamState>('loading')
  const [session, setSession] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [result, setResult] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'offline'>('saved')
  const [tabWarnings, setTabWarnings] = useState(0)
  const [error, setError] = useState('')

  const saveTimerRef = useRef<any>()
  const countdownRef = useRef<any>()
  const sessionIdRef = useRef<string>()

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!examId) return
    async function loadExam() {
  try {
    console.log('Starting exam:', examId)
    const { sessionId } = await api.startExam(examId)
    sessionIdRef.current = sessionId
    console.log('Session created:', sessionId)

    const data = await api.getExamSession(examId)
    console.log('Exam data received:', data)

    const parsedQuestions = (data.questions ?? []).map((q: any) => ({
      ...q,
      options: typeof q.options === 'string'
        ? JSON.parse(q.options)
        : (q.options ?? [])
    }))
    setQuestions(parsedQuestions)
    setSession(data.session)
setAnswers(data.session?.answers ?? {})

// Handle both camelCase and snake_case from API
const deadlineStr = data.session?.serverDeadline 
  ?? data.session?.server_deadline
  ?? new Date(Date.now() + 60 * 60 * 1000).toISOString()

const deadline = new Date(deadlineStr).getTime()
const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
setTimeLeft(isNaN(remaining) ? 3600 : remaining)
setExamState('taking')

  } catch (err: any) {
  console.error('Exam load failed:', err)
  if (err.code === 'ALREADY_SUBMITTED') {
  router.replace('/student')
} else if (err.code === 'TIME_EXPIRED') {
  setError('The exam window has closed. Please contact your teacher.')
  setExamState('error')
} else {
  const errorMessage = `${err.message ?? 'Unknown error'} (code: ${err.code ?? 'none'}, status: ${err.status ?? 'none'})`
  setError(errorMessage)
  setExamState('error')
}
}
}
    loadExam()
  }, [examId, router])

  useEffect(() => {
    if (examState !== 'taking') return
    countdownRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(countdownRef.current); handleSubmit(true); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [examState])

  useEffect(() => {
    if (examState !== 'taking' || !sessionIdRef.current) return
    saveTimerRef.current = setInterval(() => {
      if (sessionIdRef.current) autoSave(answers, sessionIdRef.current)
    }, 30000)
    return () => clearInterval(saveTimerRef.current)
  }, [examState, answers])

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); setSyncStatus('saved') }
    const handleOffline = () => { setIsOnline(false); setSyncStatus('offline') }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (examState !== 'taking') return
    const handleVisibility = () => { if (document.hidden) setTabWarnings(w => w + 1) }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [examState])

  const autoSave = useCallback(async (currentAnswers: Record<string, string>, sid: string) => {
    if (Object.keys(currentAnswers).length === 0) return
    setSyncStatus('saving')
    try {
      await api.saveAnswers(sid, currentAnswers)
      setSyncStatus('saved')
    } catch {
      setSyncStatus('offline')
    }
  }, [])

  function selectAnswer(questionId: string, answer: string) {
    const updated = { ...answers, [questionId]: answer }
    setAnswers(updated)
    if (sessionIdRef.current) autoSave(updated, sessionIdRef.current)
  }

  async function handleSubmit(autoSubmit = false) {
    if (!sessionIdRef.current) return
    if (!autoSubmit) {
      const unanswered = questions.length - Object.keys(answers).length
      if (unanswered > 0) {
        const confirm = window.confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Submit anyway?`)
        if (!confirm) return
      }
    }
    setExamState('submitting')
    clearInterval(saveTimerRef.current)
    clearInterval(countdownRef.current)
    try {
      const data = await api.submitExam(sessionIdRef.current)
      setResult(data.result)
      setExamState('submitted')
    } catch {
      setError('Submission failed. Please check your connection and try again.')
      setExamState('taking')
    }
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const answeredCount = Object.keys(answers).length
  const currentQuestion = questions[currentIndex]
  const isLast = currentIndex === questions.length - 1
  const isWarning = timeLeft < 300
  const isDanger = timeLeft < 60

  if (examState === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading your exam…</p>
      </div>
    )
  }

  if (examState === 'error') {
    return (
      <div className={styles.errorScreen}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2>Unable to load exam</h2>
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={() => router.push('/student')}>Back to dashboard</button>
      </div>
    )
  }

  if (examState === 'submitted') {
    return (
      <div className={styles.resultScreen}>
        <div className={styles.resultCard}>
          <div className={styles.resultBadge}>{result?.passed ? '🎉' : '📝'}</div>
          <h1 className={styles.resultTitle}>Exam Submitted</h1>
          {result ? (
            <>
              <div className={styles.scoreCircle}>
                <span className={styles.scoreNum}>{Math.round(result.percentage)}%</span>
                <span className={styles.scoreLabel}>{result.score}/{result.totalMarks} marks</span>
              </div>
              <p className={`${styles.passLabel} ${result.passed ? styles.passGreen : styles.passFail}`}>
                {result.passed ? 'Congratulations — you passed!' : "Keep studying — you'll get it next time."}
              </p>
            </>
          ) : (
            <p className={styles.resultNote}>Your result will be released by your teacher.</p>
          )}
          <button className={styles.doneBtn} onClick={() => router.push('/student')}>Back to dashboard</button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.examPage}>
      <div className={styles.topBar}>
        <div className={styles.progress}>
          <span className={styles.progressText}>{answeredCount}/{questions.length} answered</span>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
          </div>
        </div>
        <div className={`${styles.timer} ${isWarning ? styles.timerWarn : ''} ${isDanger ? styles.timerDanger : ''}`}>
          ⏱ {formatTime(timeLeft)}
        </div>
        <div className={styles.topRight}>
          <span className={`${styles.syncDot} ${syncStatus === 'offline' ? styles.syncOffline : syncStatus === 'saving' ? styles.syncSaving : styles.syncSaved}`} />
          <span className={styles.syncLabel}>{syncStatus === 'offline' ? 'Offline' : syncStatus === 'saving' ? 'Saving…' : 'Saved'}</span>
        </div>
      </div>

      {tabWarnings > 0 && (
        <div className={styles.cheatWarning} role="alert">
          ⚠️ Warning: Switching tabs is recorded. {tabWarnings} tab switch{tabWarnings > 1 ? 'es' : ''} detected.
        </div>
      )}

      <div className={styles.examBody}>
        <div className={styles.questionPanel}>
          <p className={styles.questionNum}>Question {currentIndex + 1} of {questions.length}</p>
          {(currentQuestion?.imageUrl ?? currentQuestion?.image_url) && (
  <img src={currentQuestion?.imageUrl ?? currentQuestion?.image_url} alt="Question" className={styles.questionImage} />
)}
          <p className={styles.questionText}>
  {currentQuestion?.questionText ?? currentQuestion?.question_text}
</p>
          
  {(() => {
    const opts = typeof currentQuestion?.options === 'string'
      ? JSON.parse(currentQuestion.options)
      : (currentQuestion?.options ?? [])
    return opts.map((opt: any) => {
      const selected = answers[currentQuestion.id] === opt.key
      return (
        <button
          key={opt.key}
          className={`${styles.option} ${selected ? styles.optionSelected : ''}`}
          onClick={() => selectAnswer(currentQuestion.id, opt.key)}
          disabled={examState === 'submitting'}
        >
          <span className={styles.optionKey}>{opt.key}</span>
          <span className={styles.optionText}>{opt.text}</span>
        </button>
      )
    })
  })()}
</div>
          <div className={styles.navButtons}>
            <button className={styles.navBtn} onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}>← Previous</button>
            {!isLast ? (
              <button className={styles.navBtnPrimary} onClick={() => setCurrentIndex(i => Math.min(questions.length - 1, i + 1))}>Next →</button>
            ) : (
              <button className={styles.submitBtn} onClick={() => handleSubmit(false)} disabled={examState === 'submitting'}>
                {examState === 'submitting' ? 'Submitting…' : 'Submit exam'}
              </button>
            )}
          </div>
        </div>

        <aside className={styles.navigator}>
          <p className={styles.navTitle}>Questions</p>
          <div className={styles.navGrid}>
            {questions.map((q: any, i: number) => (
              <button
                key={q.id}
                className={`${styles.navCell} ${i === currentIndex ? styles.navCurrent : ''} ${answers[q.id] ? styles.navAnswered : ''}`}
                onClick={() => setCurrentIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className={styles.navLegend}>
            <span><span className={`${styles.dot} ${styles.dotAnswered}`} /> Answered</span>
            <span><span className={`${styles.dot} ${styles.dotUnanswered}`} /> Not yet</span>
          </div>
          <button className={styles.submitSideBtn} onClick={() => handleSubmit(false)} disabled={examState === 'submitting'}>
            Submit exam
          </button>
        </aside>
      </div>
    
  )
}
