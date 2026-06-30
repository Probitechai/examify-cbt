'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuthStore } from '../../../../hooks/useAuth'
import { api } from '../../../../lib/api'
import styles from './exam.module.css'

type ExamState = 'loading' | 'instructions' | 'taking' | 'submitting' | 'submitted' | 'error'

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
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'offline'>('saved')
  const [tabWarnings, setTabWarnings] = useState(0)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [examInfo, setExamInfo] = useState<any>(null)

  const saveTimerRef = useRef<any>()
  const countdownRef = useRef<any>()
  const sessionIdRef = useRef<string>()

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!examId) return
    async function loadExam() {
      try {
        const { sessionId } = await api.startExam(examId)
        sessionIdRef.current = sessionId
        const data = await api.getExamSession(examId) as any
        setSession(data.session)
        setExamInfo(data.examInfo)

        const parsedQuestions = (data.questions ?? []).map((q: any) => ({
          ...q,
          options: typeof q.options === 'string' ? JSON.parse(q.options) : (q.options ?? [])
        }))
        setQuestions(parsedQuestions)
        setAnswers(data.session.answers ?? {})

        const deadlineStr = data.session?.serverDeadline ?? data.session?.server_deadline
        const deadline = deadlineStr ? new Date(deadlineStr).getTime() : Date.now() + 3600000
        const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000))
        setTimeLeft(isNaN(remaining) ? 3600 : remaining)

        // Show instructions screen first
        setExamState('instructions')
      } catch (err: any) {
        console.error('Exam load failed:', err)
        if (err.code === 'ALREADY_SUBMITTED') {
          router.replace('/student')
        } else if (err.code === 'TIME_EXPIRED') {
          setError('The exam window has closed. Please contact your teacher.')
          setExamState('error')
        } else {
          setError(`${err.message ?? 'Could not load exam.'} (code: ${err.code ?? 'none'})`)
          setExamState('error')
        }
      }
    }
    loadExam()
  }, [examId, router])

  // Countdown timer
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

  // Auto-save every 30 seconds
  useEffect(() => {
    if (examState !== 'taking' || !sessionIdRef.current) return
    saveTimerRef.current = setInterval(() => {
      if (sessionIdRef.current) autoSave(answers, sessionIdRef.current)
    }, 30000)
    return () => clearInterval(saveTimerRef.current)
  }, [examState, answers])

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setSyncStatus('saved')
    const handleOffline = () => setSyncStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Tab switch detection
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

    // Show confirmation dialog for manual submission
    if (!autoSubmit) {
      setShowConfirm(true)
      return
    }

    await doSubmit()
  }

  async function doSubmit() {
    if (!sessionIdRef.current) return
    setShowConfirm(false)
    setExamState('submitting')
    clearInterval(saveTimerRef.current)
    clearInterval(countdownRef.current)
    try {
      const data = await api.submitExam(sessionIdRef.current) as any
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
  const unanswered = questions.length - answeredCount

  // ── LOADING ────────────────────────────────────────────────────────────────
  if (examState === 'loading') {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading your exam…</p>
      </div>
    )
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (examState === 'error') {
    return (
      <div className={styles.errorScreen}>
        <div className={styles.errorIcon}>⚠️</div>
        <h2>Unable to load exam</h2>
        <p>{error}</p>
        <button className={styles.retryBtn} onClick={() => router.push('/student')}>
          Back to dashboard
        </button>
      </div>
    )
  }

  // ── INSTRUCTIONS ──────────────────────────────────────────────────────────
  if (examState === 'instructions') {
    const durationHours = Math.floor(timeLeft / 3600)
    const durationMins = Math.floor((timeLeft % 3600) / 60)
    return (
      <div className={styles.instructionsScreen}>
        <div className={styles.instructionsCard}>
          <div className={styles.instructionsHeader}>
            <div className={styles.instructionsIcon}>📋</div>
            <h1 className={styles.instructionsTitle}>Exam Instructions</h1>
            <p className={styles.instructionsSubtitle}>
              Please read carefully before starting
            </p>
          </div>

          <div className={styles.examInfoGrid}>
            <div className={styles.examInfoItem}>
              <span className={styles.examInfoLabel}>Subject</span>
              <span className={styles.examInfoValue}>{examInfo?.subject ?? 'English Language'}</span>
            </div>
            <div className={styles.examInfoItem}>
              <span className={styles.examInfoLabel}>Questions</span>
              <span className={styles.examInfoValue}>{questions.length}</span>
            </div>
            <div className={styles.examInfoItem}>
              <span className={styles.examInfoLabel}>Duration</span>
              <span className={styles.examInfoValue}>
                {durationHours > 0 ? `${durationHours}h ` : ''}{durationMins}min
              </span>
            </div>
            <div className={styles.examInfoItem}>
              <span className={styles.examInfoLabel}>Student</span>
              <span className={styles.examInfoValue}>{user?.fullName}</span>
            </div>
          </div>

          <div className={styles.instructionsList}>
            <h2 className={styles.instructionsListTitle}>Before you begin</h2>
            <ul>
              <li>
                <span className={styles.instructionBullet}>⏱</span>
                <span>The timer starts as soon as you click <strong>Start Exam</strong>. It will not stop until you submit or time runs out.</span>
              </li>
              <li>
                <span className={styles.instructionBullet}>💾</span>
                <span>Your answers are saved automatically every 30 seconds. You can also navigate freely between questions.</span>
              </li>
              <li>
                <span className={styles.instructionBullet}>📶</span>
                <span>If you lose internet connection, your answers are saved locally and will sync when you reconnect.</span>
              </li>
              <li>
                <span className={styles.instructionBullet}>🚫</span>
                <span>Do not switch browser tabs or windows during the exam. Tab switches are recorded and reported to your teacher.</span>
              </li>
              <li>
                <span className={styles.instructionBullet}>✅</span>
                <span>Use the question navigator on the right to jump between questions. Green means answered.</span>
              </li>
              <li>
                <span className={styles.instructionBullet}>⚠️</span>
                <span>Once submitted, you cannot re-enter the exam. Make sure you have answered all questions before submitting.</span>
              </li>
            </ul>

            {examInfo?.instructions && (
              <div className={styles.customInstructions}>
                <h3>Additional instructions from your teacher:</h3>
                <p>{examInfo.instructions}</p>
              </div>
            )}
          </div>

          <div className={styles.instructionsFooter}>
            <button className={styles.backBtn} onClick={() => router.push('/student')}>
              ← Go back
            </button>
            <button className={styles.startBtn} onClick={() => setExamState('taking')}>
              Start Exam →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── RESULT ────────────────────────────────────────────────────────────────
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

              {/* Show answer review */}
              {questions.length > 0 && (
                <div className={styles.reviewSection}>
                  <h2 className={styles.reviewTitle}>Answer Review</h2>
                  <div className={styles.reviewList}>
                    {questions.map((q: any, i: number) => {
                      const studentAnswer = answers[q.id]
                      const options = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options ?? [])
                      const isShortAnswer = q.type === 'short_answer' || options.length === 0

                      let isCorrect = false
                      let yourAnswerDisplay = 'Not answered'
                      let correctAnswerDisplay = ''

                      if (isShortAnswer) {
                        const studentTrimmed = (studentAnswer ?? '').toString().trim().toUpperCase()
                        const correctTrimmed = (q.correct_answer ?? '').toString().trim().toUpperCase()
                        isCorrect = studentTrimmed.length > 0 && studentTrimmed === correctTrimmed
                        yourAnswerDisplay = studentAnswer ? studentAnswer.toString() : 'Not answered'
                        correctAnswerDisplay = q.correct_answer ?? ''
                      } else {
                        const correctOption = options.find((o: any) => o.key === q.correct_answer)
                        const studentOption = options.find((o: any) => o.key === studentAnswer)
                        isCorrect = studentAnswer === q.correct_answer
                        yourAnswerDisplay = studentAnswer ? `${studentAnswer}. ${studentOption?.text ?? ''}` : 'Not answered'
                        correctAnswerDisplay = `${q.correct_answer}. ${correctOption?.text ?? ''}`
                      }

                      return (
                        <div key={q.id} className={`${styles.reviewItem} ${isCorrect ? styles.reviewCorrect : styles.reviewWrong}`}>
                          <div className={styles.reviewNum}>
                            {isCorrect ? '✓' : '✗'}
                          </div>
                          <div className={styles.reviewContent}>
                            <p className={styles.reviewQ}>{i + 1}. {q.question_text}</p>
                            <p className={styles.reviewAnswer}>
                              Your answer: <strong>{yourAnswerDisplay}</strong>
                            </p>
                            {!isCorrect && (
                              <p className={styles.reviewCorrectAnswer}>
                                Correct answer: <strong>{correctAnswerDisplay}</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className={styles.resultNote}>Your result will be released by your teacher.</p>
          )}

          <button className={styles.doneBtn} onClick={() => router.push('/student')}>
            Back to dashboard
          </button>
        </div>
      </div>
    )
  }

  // ── EXAM ENGINE ───────────────────────────────────────────────────────────
  return (
    <div className={styles.examPage}>
      {/* Confirm submit dialog */}
      {showConfirm && (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmIcon}>⚠️</div>
            <h2 className={styles.confirmTitle}>Submit Exam?</h2>
            {unanswered > 0 ? (
              <p className={styles.confirmMsg}>
                You have <strong>{unanswered} unanswered question{unanswered > 1 ? 's' : ''}</strong>. Are you sure you want to submit? You cannot change your answers after submission.
              </p>
            ) : (
              <p className={styles.confirmMsg}>
                You have answered all {questions.length} questions. Ready to submit?
              </p>
            )}
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={() => setShowConfirm(false)}>
                Continue exam
              </button>
              <button className={styles.confirmSubmit} onClick={doSubmit}>
                Yes, submit now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
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
        {/* Question panel */}
        <div className={styles.questionPanel}>
          <p className={styles.questionNum}>Question {currentIndex + 1} of {questions.length}</p>
          {currentQuestion?.imageUrl && (
            <img src={currentQuestion.imageUrl} alt="Question" className={styles.questionImage} />
          )}
          <p className={styles.questionText}>
            {currentQuestion?.questionText ?? currentQuestion?.question_text}
          </p>
    <div className={styles.options}>
            {(currentQuestion?.options ?? []).map((opt: any) => {
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
            })}
            {currentQuestion?.type === 'short_answer' && (
              <div className={styles.shortAnswerWrap}>
                <p className={styles.shortAnswerHint}>Type your answer below:</p>
                <input
                  className={styles.shortAnswerInput}
                  type="text"
                  value={answers[currentQuestion.id] ?? ''}
                  onChange={e => selectAnswer(currentQuestion.id, e.target.value)}
                  disabled={examState === 'submitting'}
                  placeholder="Type your answer here…"
                  autoComplete="off"
                />
              </div>
            )}
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

        {/* Navigator */}
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
          {unanswered > 0 && (
            <p className={styles.unansweredWarning}>
              {unanswered} question{unanswered > 1 ? 's' : ''} unanswered
            </p>
          )}
          <button className={styles.submitSideBtn} onClick={() => handleSubmit(false)} disabled={examState === 'submitting'}>
            Submit exam
          </button>
        </aside>
      </div>
    </div>
  )
}
