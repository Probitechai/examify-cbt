'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../../lib/api'
import styles from './new-exam.module.css'

type Step = 'details' | 'questions' | 'review'

export default function AdminNewExamPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('details')
  const [questions, setQuestions] = useState<any[]>([])
  const [loadingQ, setLoadingQ] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')

  const [details, setDetails] = useState({
    title: '',
    subject: 'English Language',
    classLevel: 'SS2',
    classArms: [] as string[],
    durationMinutes: 60,
    totalMarks: 0,
    passMark: 50,
    scheduledAt: '',
    endsAt: '',
    instructions: '',
    randomiseQuestions: true,
    randomiseOptions: true,
    showResultAfter: true,
  })

  const [selectedQIds, setSelectedQIds] = useState<Set<string>>(new Set())
  const [subjectFilter, setSubjectFilter] = useState('')

  useEffect(() => {
    api.getQuestions().then((data: any) => {
      setQuestions(data.questions ?? [])
    }).catch(console.error).finally(() => setLoadingQ(false))
  }, [])

  function setDetail(key: string, val: any) {
    setDetails(d => ({ ...d, [key]: val }))
  }

  function toggleArm(arm: string) {
    setDetails(d => ({
      ...d,
      classArms: d.classArms.includes(arm)
        ? d.classArms.filter(a => a !== arm)
        : [...d.classArms, arm]
    }))
  }

  function toggleQ(id: string) {
    setSelectedQIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectedQs = questions.filter(q => selectedQIds.has(q.id))
  const totalMarks = selectedQs.reduce((s, q) => s + Number(q.marks), 0)
  const filteredQ = subjectFilter ? questions.filter(q => q.subject === subjectFilter) : questions
  const subjects = [...new Set(questions.map((q: any) => q.subject))].sort()

  const canNext = step === 'details'
    ? details.title && details.scheduledAt && details.endsAt && details.classArms.length > 0
    : step === 'questions'
    ? selectedQIds.size >= 1
    : true

  async function handlePublish() {
    setPublishing(true)
    setError('')
    try {
      await api.createExam({
        title: details.title,
        subject: details.subject,
        classLevel: details.classLevel,
        classArms: details.classArms,
        durationMinutes: details.durationMinutes,
        totalMarks: totalMarks || details.totalMarks,
        passMark: details.passMark,
        questionIds: [...selectedQIds],
        scheduledAt: details.scheduledAt,
        endsAt: details.endsAt,
        randomiseQuestions: details.randomiseQuestions,
        randomiseOptions: details.randomiseOptions,
        showResultAfter: details.showResultAfter,
      })
      router.push('/admin/exams')
    } catch (err: any) {
      setError(err.message ?? 'Failed to create exam')
      setPublishing(false)
    }
  }

  const STEPS = [
    { key: 'details', label: 'Exam details', num: 1 },
    { key: 'questions', label: 'Questions', num: 2 },
    { key: 'review', label: 'Review & publish', num: 3 },
  ]

  const stepIndex = STEPS.findIndex(s => s.key === step)

  return (
    <div className={styles.page}>
      {/* Step bar */}
      <div className={styles.stepBar}>
        <button className={styles.backBtn} onClick={() => router.push('/admin/exams')}>
          ← Back
        </button>
        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={s.key} className={`${styles.stepItem} ${s.key === step ? styles.stepActive : ''} ${i < stepIndex ? styles.stepDone : ''}`}>
              <div className={styles.stepDot}>
                {i < stepIndex ? '✓' : s.num}
              </div>
              <span className={styles.stepLabel}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.stepActions}>
          {stepIndex > 0 && (
            <button className={styles.prevBtn} onClick={() => setStep(STEPS[stepIndex - 1].key as Step)}>
              ← Back
            </button>
          )}
          {step !== 'review' ? (
            <button className={styles.nextBtn} disabled={!canNext}
              onClick={() => setStep(STEPS[stepIndex + 1].key as Step)}>
              Next →
            </button>
          ) : (
            <button className={styles.publishBtn} onClick={handlePublish} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish exam'}
            </button>
          )}
        </div>
      </div>

      <div className={styles.body}>

        {/* STEP 1: Details */}
        {step === 'details' && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Exam details</h2>
            <div className={styles.formGrid}>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Exam title</label>
                <input className={styles.input} value={details.title}
                  onChange={e => setDetail('title', e.target.value)}
                  placeholder="e.g. Third Term English Language Examination" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Subject</label>
                <select className={styles.sel} value={details.subject}
                  onChange={e => setDetail('subject', e.target.value)}>
                  <option>English Language</option>
                  <option>Mathematics</option>
                  <option>Biology</option>
                  <option>Chemistry</option>
                  <option>Physics</option>
                  <option>Economics</option>
                  <option>Government</option>
                  <option>Literature</option>
                  <option>Geography</option>
                  <option>Agricultural Science</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Class level</label>
                <select className={styles.sel} value={details.classLevel}
                  onChange={e => setDetail('classLevel', e.target.value)}>
                  <option>SS1</option><option>SS2</option><option>SS3</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Duration (minutes)</label>
                <input className={styles.input} type="number" min={10} max={360}
                  value={details.durationMinutes}
                  onChange={e => setDetail('durationMinutes', Number(e.target.value))} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Pass mark (%)</label>
                <input className={styles.input} type="number" min={1} max={100}
                  value={details.passMark}
                  onChange={e => setDetail('passMark', Number(e.target.value))} />
              </div>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Class arms</label>
                <div className={styles.armGrid}>
                  {['A', 'B', 'C', 'D', 'Science', 'Arts', 'Commercial'].map(arm => (
                    <button key={arm} type="button"
                      className={`${styles.armBtn} ${details.classArms.includes(arm) ? styles.armActive : ''}`}
                      onClick={() => toggleArm(arm)}>
                      {arm}
                    </button>
                  ))}
                  <button type="button"
                    className={`${styles.armBtn} ${details.classArms.length === 0 || details.classArms.includes('all') ? styles.armActive : ''}`}
                    onClick={() => setDetail('classArms', ['all'])}>
                    All arms
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Start date & time</label>
                <input className={styles.input} type="datetime-local"
                  value={details.scheduledAt}
                  onChange={e => setDetail('scheduledAt', e.target.value)} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>End date & time</label>
                <input className={styles.input} type="datetime-local"
                  value={details.endsAt}
                  onChange={e => setDetail('endsAt', e.target.value)} />
              </div>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Instructions <span className={styles.optional}>(optional)</span></label>
                <textarea className={styles.textarea} rows={3} value={details.instructions}
                  onChange={e => setDetail('instructions', e.target.value)}
                  placeholder="Instructions shown to students before the exam starts…" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Questions */}
        {step === 'questions' && (
          <div className={styles.twoPane}>
            <div className={styles.leftPane}>
              <div className={styles.paneHeader}>
                <h2 className={styles.cardTitle}>Select questions</h2>
                <select className={styles.sel} value={subjectFilter}
                  onChange={e => setSubjectFilter(e.target.value)}>
                  <option value="">All subjects</option>
                  {subjects.map((s: any) => <option key={s}>{s}</option>)}
                </select>
              </div>
              {loadingQ ? (
                <div className={styles.loadingQ}>Loading questions…</div>
              ) : filteredQ.length === 0 ? (
                <div className={styles.emptyQ}>
                  <p>No questions found.</p>
                  <p>Add questions in the Question Bank first.</p>
                </div>
              ) : filteredQ.map((q: any) => (
                <div key={q.id}
                  className={`${styles.qItem} ${selectedQIds.has(q.id) ? styles.qSelected : ''}`}
                  onClick={() => toggleQ(q.id)}>
                  <input type="checkbox" className={styles.qCheck}
                    checked={selectedQIds.has(q.id)} readOnly />
                  <div className={styles.qInfo}>
                    <p className={styles.qText}>{q.question_text}</p>
                    <div className={styles.qMeta}>
                      <span>{q.subject}</span>
                      <span>{q.class_level}</span>
                      <span>{q.topic ?? '—'}</span>
                      <span>{q.marks} mk</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.rightPane}>
              <h3 className={styles.paneTitle}>Selected ({selectedQIds.size})</h3>
              <div className={styles.summaryBox}>
                <div className={styles.summaryRow}><span>Questions</span><strong>{selectedQIds.size}</strong></div>
                <div className={styles.summaryRow}><span>Total marks</span><strong>{totalMarks}</strong></div>
                <div className={styles.summaryRow}><span>Est. duration</span><strong>{Math.ceil(selectedQIds.size * 1.2)} min</strong></div>
              </div>
              {selectedQs.length > 0 && (
                <div className={styles.selectedList}>
                  {selectedQs.map((q, i) => (
                    <div key={q.id} className={styles.selectedItem}>
                      <span className={styles.selNum}>{i + 1}</span>
                      <span className={styles.selText}>{q.question_text.slice(0, 60)}…</span>
                      <button className={styles.deselBtn} onClick={() => toggleQ(q.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 'review' && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Review & publish</h2>
            <div className={styles.reviewGrid}>
              <div className={styles.reviewSection}>
                <p className={styles.reviewLabel}>Exam details</p>
                <div className={styles.reviewRow}><span>Title</span><strong>{details.title}</strong></div>
                <div className={styles.reviewRow}><span>Subject</span><strong>{details.subject}</strong></div>
                <div className={styles.reviewRow}><span>Class</span><strong>{details.classLevel} · {details.classArms.join(', ')}</strong></div>
                <div className={styles.reviewRow}><span>Duration</span><strong>{details.durationMinutes} minutes</strong></div>
                <div className={styles.reviewRow}><span>Pass mark</span><strong>{details.passMark}%</strong></div>
                <div className={styles.reviewRow}><span>Starts</span><strong>{details.scheduledAt ? new Date(details.scheduledAt).toLocaleString('en-NG') : '—'}</strong></div>
                <div className={styles.reviewRow}><span>Ends</span><strong>{details.endsAt ? new Date(details.endsAt).toLocaleString('en-NG') : '—'}</strong></div>
              </div>
              <div className={styles.reviewSection}>
                <p className={styles.reviewLabel}>Questions</p>
                <div className={styles.reviewRow}><span>Selected</span><strong>{selectedQIds.size} questions</strong></div>
                <div className={styles.reviewRow}><span>Total marks</span><strong>{totalMarks}</strong></div>
              </div>
              <div className={styles.reviewSection}>
                <p className={styles.reviewLabel}>Settings</p>
                <div className={styles.reviewRow}><span>Randomise questions</span><strong>{details.randomiseQuestions ? 'Yes' : 'No'}</strong></div>
                <div className={styles.reviewRow}><span>Randomise options</span><strong>{details.randomiseOptions ? 'Yes' : 'No'}</strong></div>
                <div className={styles.reviewRow}><span>Show result after</span><strong>{details.showResultAfter ? 'Yes' : 'No'}</strong></div>
              </div>
            </div>

            <div className={styles.settingsList}>
              <h3 className={styles.settingsTitle}>Exam settings</h3>
              {([
                { key: 'randomiseQuestions', label: 'Randomise question order', desc: 'Each student gets questions in a different order.' },
                { key: 'randomiseOptions', label: 'Randomise answer options', desc: 'Shuffle MCQ options per student.' },
                { key: 'showResultAfter', label: 'Show result immediately after submission', desc: 'Students see their score as soon as they submit.' },
              ] as const).map(s => (
                <div key={s.key} className={styles.settingRow}>
                  <div>
                    <p className={styles.settingLabel}>{s.label}</p>
                    <p className={styles.settingDesc}>{s.desc}</p>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${details[s.key] ? styles.toggleOn : ''}`}
                    onClick={() => setDetail(s.key, !details[s.key])}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                </div>
              ))}
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.publishNote}>
              ℹ️ Publishing will make this exam visible to students when the scheduled time arrives.
              The exam status will be set to <strong>active</strong> immediately.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
