'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './new-exam.module.css'

const QUESTIONS_POOL = [
  { id: '1', questionText: 'Choose the sentence with the correct use of the apostrophe.', topic: 'Grammar', difficulty: 'medium', marks: 1 },
  { id: '2', questionText: 'Identify the verb in: "The students wrote their examinations carefully."', topic: 'Grammar', difficulty: 'easy', marks: 1 },
  { id: '3', questionText: 'Which of the following is a conjunction?', topic: 'Grammar', difficulty: 'easy', marks: 1 },
  { id: '4', questionText: 'What figure of speech is used in "The wind whispered through the trees"?', topic: 'Literature', difficulty: 'medium', marks: 2 },
  { id: '5', questionText: 'Which word is an antonym of "benevolent"?', topic: 'Vocabulary', difficulty: 'hard', marks: 1 },
  { id: '6', questionText: 'Choose the correctly punctuated sentence: "However, I disagree."', topic: 'Grammar', difficulty: 'medium', marks: 1 },
  { id: '7', questionText: 'What is the superlative form of "good"?', topic: 'Grammar', difficulty: 'easy', marks: 1 },
  { id: '8', questionText: 'Identify the adjective in: "The tall student scored the highest marks."', topic: 'Grammar', difficulty: 'easy', marks: 1 },
]

type Step = 'details' | 'questions' | 'settings' | 'review'
const STEPS: { key: Step; label: string }[] = [
  { key: 'details', label: 'Exam details' },
  { key: 'questions', label: 'Questions' },
  { key: 'settings', label: 'Settings' },
  { key: 'review', label: 'Review & publish' },
]

export default function NewExamPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('details')
  const [publishing, setPublishing] = useState(false)

  const [details, setDetails] = useState({
    title: '',
    subject: 'English Language',
    classLevel: 'SS2',
    classArms: [] as string[],
    durationMinutes: 60,
    scheduledAt: '',
    endsAt: '',
    instructions: '',
    passMark: 50,
  })

  const [selectedQIds, setSelectedQIds] = useState<Set<string>>(new Set())
  const [topicFilter, setTopicFilter] = useState('')

  const [settings, setSettings] = useState({
    randomiseQuestions: true,
    randomiseOptions: true,
    showResultAfter: true,
  })

  function toggleArm(arm: string) {
    setDetails(d => ({
      ...d,
      classArms: d.classArms.includes(arm) ? d.classArms.filter(a => a !== arm) : [...d.classArms, arm],
    }))
  }

  function toggleQ(id: string) {
    setSelectedQIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectedQs = QUESTIONS_POOL.filter(q => selectedQIds.has(q.id))
  const totalMarks = selectedQs.reduce((s, q) => s + q.marks, 0)
  const filteredPool = topicFilter ? QUESTIONS_POOL.filter(q => q.topic === topicFilter) : QUESTIONS_POOL

  const stepIndex = STEPS.findIndex(s => s.key === step)
  const canNext = step === 'details'
    ? details.title && details.scheduledAt && details.endsAt && details.classArms.length > 0
    : step === 'questions'
    ? selectedQIds.size >= 1
    : true

  async function handlePublish() {
    setPublishing(true)
    await new Promise(r => setTimeout(r, 800))
    router.push('/teacher/exams')
  }

  return (
    <div className={styles.page}>
      {/* Step header */}
      <div className={styles.stepBar}>
        <button className={styles.backBtn} onClick={() => router.push('/teacher/exams')}>
          <i className="ti ti-arrow-left" aria-hidden="true" />
        </button>
        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={s.key} className={`${styles.stepItem} ${s.key === step ? styles.stepActive : ''} ${i < stepIndex ? styles.stepDone : ''}`}>
              <div className={styles.stepDot}>
                {i < stepIndex ? <i className="ti ti-check" aria-hidden="true" style={{ fontSize: 13 }} /> : i + 1}
              </div>
              <span className={styles.stepLabel}>{s.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.stepActions}>
          {stepIndex > 0 && (
            <button className={styles.prevBtn} onClick={() => setStep(STEPS[stepIndex - 1].key)}>← Back</button>
          )}
          {step !== 'review' ? (
            <button className={styles.nextBtn} disabled={!canNext} onClick={() => setStep(STEPS[stepIndex + 1].key)}>
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
          <div className={styles.formCard}>
            <h2 className={styles.stepTitle}>Exam details</h2>
            <div className={styles.formGrid}>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Exam title</label>
                <input className={styles.input} value={details.title} onChange={e => setDetails(d => ({ ...d, title: e.target.value }))} placeholder="e.g. Third Term English Language Examination" />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Subject</label>
                <select className={styles.sel} value={details.subject} onChange={e => setDetails(d => ({ ...d, subject: e.target.value }))}>
                  <option>English Language</option><option>Mathematics</option><option>Biology</option><option>Chemistry</option><option>Physics</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Class level</label>
                <select className={styles.sel} value={details.classLevel} onChange={e => setDetails(d => ({ ...d, classLevel: e.target.value }))}>
                  <option>SS1</option><option>SS2</option><option>SS3</option>
                </select>
              </div>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Class arms</label>
                <div className={styles.armGrid}>
                  {['A', 'B', 'C', 'Science', 'Arts', 'Commercial'].map(arm => (
                    <button key={arm} type="button"
                      className={`${styles.armBtn} ${details.classArms.includes(arm) ? styles.armActive : ''}`}
                      onClick={() => toggleArm(arm)}>
                      {arm}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Start date & time</label>
                <input className={styles.input} type="datetime-local" value={details.scheduledAt} onChange={e => setDetails(d => ({ ...d, scheduledAt: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>End date & time</label>
                <input className={styles.input} type="datetime-local" value={details.endsAt} onChange={e => setDetails(d => ({ ...d, endsAt: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Duration (minutes)</label>
                <input className={styles.input} type="number" min={10} max={360} value={details.durationMinutes} onChange={e => setDetails(d => ({ ...d, durationMinutes: Number(e.target.value) }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Pass mark (%)</label>
                <input className={styles.input} type="number" min={1} max={100} value={details.passMark} onChange={e => setDetails(d => ({ ...d, passMark: Number(e.target.value) }))} />
              </div>
              <div className={styles.fieldFull}>
                <label className={styles.label}>Instructions <span className={styles.optional}>(optional)</span></label>
                <textarea className={styles.textarea} rows={3} value={details.instructions} onChange={e => setDetails(d => ({ ...d, instructions: e.target.value }))} placeholder="Instructions shown to students before the exam starts…" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Questions */}
        {step === 'questions' && (
          <div className={styles.twoPane}>
            <div className={styles.leftPane}>
              <div className={styles.paneHeader}>
                <h2 className={styles.stepTitle}>Select questions</h2>
                <select className={styles.sel} value={topicFilter} onChange={e => setTopicFilter(e.target.value)}>
                  <option value="">All topics</option>
                  <option>Grammar</option><option>Literature</option><option>Vocabulary</option><option>Comprehension</option>
                </select>
              </div>
              <div className={styles.qPool}>
                {filteredPool.map(q => (
                  <div key={q.id} className={`${styles.qItem} ${selectedQIds.has(q.id) ? styles.qSelected : ''}`} onClick={() => toggleQ(q.id)}>
                    <input type="checkbox" className={styles.qCheck} checked={selectedQIds.has(q.id)} readOnly />
                    <div className={styles.qInfo}>
                      <p className={styles.qText}>{q.questionText}</p>
                      <div className={styles.qMeta}>
                        <span>{q.topic}</span>
                        <span className={`${styles.diff} ${q.difficulty === 'easy' ? styles.dEasy : q.difficulty === 'medium' ? styles.dMed : styles.dHard}`}>{q.difficulty}</span>
                        <span>{q.marks} mk</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.rightPane}>
              <h3 className={styles.paneTitle}>Selected ({selectedQIds.size})</h3>
              <div className={styles.summaryBox}>
                <div className={styles.summaryRow}><span>Questions</span><strong>{selectedQIds.size}</strong></div>
                <div className={styles.summaryRow}><span>Total marks</span><strong>{totalMarks}</strong></div>
                <div className={styles.summaryRow}><span>Est. time</span><strong>{selectedQIds.size * 1.2 | 0} min</strong></div>
              </div>
              {selectedQs.length > 0 && (
                <div className={styles.selectedList}>
                  {selectedQs.map((q, i) => (
                    <div key={q.id} className={styles.selectedItem}>
                      <span className={styles.selNum}>{i + 1}</span>
                      <span className={styles.selText}>{q.questionText.slice(0, 55)}…</span>
                      <button className={styles.deselBtn} onClick={() => toggleQ(q.id)}><i className="ti ti-x" aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Settings */}
        {step === 'settings' && (
          <div className={styles.formCard}>
            <h2 className={styles.stepTitle}>Exam settings</h2>
            <div className={styles.settingsList}>
              {([
                { key: 'randomiseQuestions', label: 'Randomise question order', desc: 'Each student gets questions in a different order — reduces copying.' },
                { key: 'randomiseOptions', label: 'Randomise answer options', desc: 'Shuffle MCQ options per student — further reduces guessing by position.' },
                { key: 'showResultAfter', label: 'Show result immediately after submission', desc: 'Students see their score and pass/fail status as soon as they submit. Disable to release results manually.' },
              ] as const).map(s => (
                <div key={s.key} className={styles.settingRow}>
                  <div>
                    <p className={styles.settingLabel}>{s.label}</p>
                    <p className={styles.settingDesc}>{s.desc}</p>
                  </div>
                  <button
                    type="button"
                    className={`${styles.toggle} ${settings[s.key] ? styles.toggleOn : ''}`}
                    onClick={() => setSettings(st => ({ ...st, [s.key]: !st[s.key] }))}
                    role="switch"
                    aria-checked={settings[s.key]}
                  >
                    <span className={styles.toggleThumb} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: Review */}
        {step === 'review' && (
          <div className={styles.formCard}>
            <h2 className={styles.stepTitle}>Review & publish</h2>
            <div className={styles.reviewGrid}>
              <div className={styles.reviewSection}>
                <p className={styles.reviewLabel}>Exam details</p>
                <div className={styles.reviewRow}><span>Title</span><strong>{details.title || '—'}</strong></div>
                <div className={styles.reviewRow}><span>Subject</span><strong>{details.subject}</strong></div>
                <div className={styles.reviewRow}><span>Class</span><strong>{details.classLevel} {details.classArms.join(', ')}</strong></div>
                <div className={styles.reviewRow}><span>Duration</span><strong>{details.durationMinutes} minutes</strong></div>
                <div className={styles.reviewRow}><span>Pass mark</span><strong>{details.passMark}%</strong></div>
              </div>
              <div className={styles.reviewSection}>
                <p className={styles.reviewLabel}>Questions</p>
                <div className={styles.reviewRow}><span>Selected</span><strong>{selectedQIds.size} questions</strong></div>
                <div className={styles.reviewRow}><span>Total marks</span><strong>{totalMarks}</strong></div>
              </div>
              <div className={styles.reviewSection}>
                <p className={styles.reviewLabel}>Settings</p>
                <div className={styles.reviewRow}><span>Randomise questions</span><strong>{settings.randomiseQuestions ? 'Yes' : 'No'}</strong></div>
                <div className={styles.reviewRow}><span>Randomise options</span><strong>{settings.randomiseOptions ? 'Yes' : 'No'}</strong></div>
                <div className={styles.reviewRow}><span>Show result after</span><strong>{settings.showResultAfter ? 'Yes' : 'No'}</strong></div>
              </div>
            </div>
            <div className={styles.publishNote}>
              <i className="ti ti-info-circle" aria-hidden="true" />
              Publishing will make this exam visible to students when the scheduled time arrives. You can edit or cancel it before then.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
