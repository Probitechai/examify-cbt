'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './new-question.module.css'

interface Option { key: string; text: string }

const OPTION_KEYS = ['A', 'B', 'C', 'D', 'E']

export default function NewQuestionPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    type: 'mcq' as 'mcq' | 'true_false' | 'short_answer',
    subject: 'English Language',
    classLevel: 'SS2',
    topic: '',
    questionText: '',
    options: [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ] as Option[],
    correctAnswer: 'A',
    explanation: '',
    marks: 1,
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
  })

  function set<K extends keyof typeof form>(key: K, val: typeof form[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function setOption(index: number, text: string) {
    const opts = [...form.options]
    opts[index] = { ...opts[index], text }
    set('options', opts)
  }

  function addOption() {
    if (form.options.length >= 5) return
    const key = OPTION_KEYS[form.options.length]
    set('options', [...form.options, { key, text: '' }])
  }

  function removeOption(index: number) {
    if (form.options.length <= 2) return
    const opts = form.options.filter((_, i) => i !== index)
    // Re-key remaining options
    const rekeyed = opts.map((o, i) => ({ ...o, key: OPTION_KEYS[i] }))
    // Reset correct answer if it was the removed option or needs re-keying
    const newCorrect = rekeyed.find(o => o.key === form.correctAnswer) ? form.correctAnswer : rekeyed[0].key
    setForm(f => ({ ...f, options: rekeyed, correctAnswer: newCorrect }))
  }

  const isValid = form.questionText.trim().length > 0 &&
    (form.type !== 'mcq' || form.options.every(o => o.text.trim().length > 0))

  async function handleSave(andNew = false) {
    if (!isValid) return
    setSaving(true)
    try {
      // In production: await api.createQuestion(...)
      await new Promise(r => setTimeout(r, 600)) // simulate API
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      if (andNew) {
        setForm(f => ({
          ...f,
          questionText: '',
          options: [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }],
          correctAnswer: 'A',
          explanation: '',
        }))
      } else {
        router.push('/teacher/questions')
      }
    } finally {
      setSaving(false)
    }
  }

  const trueFalseOptions: Option[] = [{ key: 'A', text: 'True' }, { key: 'B', text: 'False' }]
  const displayOptions = form.type === 'true_false' ? trueFalseOptions : form.options

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => router.push('/teacher/questions')}>
          <i className="ti ti-arrow-left" aria-hidden="true" /> Back
        </button>
        <h1 className={styles.pageTitle}>New question</h1>
        <div className={styles.topActions}>
          <button className={styles.saveNewBtn} onClick={() => handleSave(true)} disabled={!isValid || saving}>
            Save & add another
          </button>
          <button className={styles.saveBtn} onClick={() => handleSave(false)} disabled={!isValid || saving}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save question'}
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {/* Left: Form */}
        <div className={styles.formPanel}>

          {/* Metadata row */}
          <div className={styles.metaRow}>
            <div className={styles.field}>
              <label className={styles.label}>Question type</label>
              <select className={styles.sel} value={form.type} onChange={e => set('type', e.target.value as typeof form.type)}>
                <option value="mcq">Multiple choice (MCQ)</option>
                <option value="true_false">True / False</option>
                <option value="short_answer">Short answer</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Subject</label>
              <select className={styles.sel} value={form.subject} onChange={e => set('subject', e.target.value)}>
                <option>English Language</option>
                <option>Mathematics</option>
                <option>Biology</option>
                <option>Chemistry</option>
                <option>Physics</option>
                <option>Economics</option>
                <option>Government</option>
                <option>Literature</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Class</label>
              <select className={styles.sel} value={form.classLevel} onChange={e => set('classLevel', e.target.value)}>
                <option>SS1</option><option>SS2</option><option>SS3</option>
              </select>
            </div>
          </div>

          <div className={styles.metaRow}>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>Topic <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} value={form.topic} onChange={e => set('topic', e.target.value)} placeholder="e.g. Grammar, Comprehension, Literature" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Marks</label>
              <input className={styles.input} type="number" min={1} max={10} value={form.marks} onChange={e => set('marks', Number(e.target.value))} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Difficulty</label>
              <select className={styles.sel} value={form.difficulty} onChange={e => set('difficulty', e.target.value as typeof form.difficulty)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Question text */}
          <div className={styles.field}>
            <label className={styles.label}>Question text</label>
            <textarea
              className={styles.textarea}
              value={form.questionText}
              onChange={e => set('questionText', e.target.value)}
              placeholder="Type the question here…"
              rows={3}
            />
          </div>

          {/* Options */}
          {form.type === 'mcq' && (
            <div className={styles.optionsSection}>
              <div className={styles.optionsHeader}>
                <label className={styles.label}>Answer options</label>
                <p className={styles.optHint}>Click the radio button to mark the correct answer</p>
              </div>
              <div className={styles.optionsList}>
                {form.options.map((opt, i) => (
                  <div key={opt.key} className={`${styles.optionRow} ${form.correctAnswer === opt.key ? styles.optionCorrect : ''}`}>
                    <button
                      type="button"
                      className={`${styles.radio} ${form.correctAnswer === opt.key ? styles.radioChecked : ''}`}
                      onClick={() => set('correctAnswer', opt.key)}
                      title="Mark as correct answer"
                      aria-label={`Mark option ${opt.key} as correct`}
                    >
                      {form.correctAnswer === opt.key && <span className={styles.radioDot} />}
                    </button>
                    <span className={styles.optLabel}>{opt.key}</span>
                    <input
                      className={styles.optInput}
                      value={opt.text}
                      onChange={e => setOption(i, e.target.value)}
                      placeholder={`Option ${opt.key}`}
                    />
                    {form.options.length > 2 && (
                      <button className={styles.removeOpt} onClick={() => removeOption(i)} aria-label="Remove option">
                        <i className="ti ti-x" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {form.options.length < 5 && (
                <button className={styles.addOptBtn} onClick={addOption}>
                  <i className="ti ti-plus" aria-hidden="true" /> Add option
                </button>
              )}
            </div>
          )}

          {form.type === 'true_false' && (
            <div className={styles.optionsSection}>
              <label className={styles.label}>Correct answer</label>
              <div className={styles.tfRow}>
                {['True', 'False'].map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    className={`${styles.tfBtn} ${form.correctAnswer === OPTION_KEYS[i] ? styles.tfActive : ''}`}
                    onClick={() => set('correctAnswer', OPTION_KEYS[i])}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Explanation */}
          <div className={styles.field}>
            <label className={styles.label}>Explanation <span className={styles.optional}>(shown to students after exam)</span></label>
            <textarea
              className={styles.textarea}
              value={form.explanation}
              onChange={e => set('explanation', e.target.value)}
              placeholder="Explain why the correct answer is right…"
              rows={2}
            />
          </div>
        </div>

        {/* Right: Live preview */}
        <div className={styles.previewPanel}>
          <p className={styles.previewLabel}>Live preview</p>
          <div className={styles.previewCard}>
            <div className={styles.previewMeta}>
              <span className={styles.previewSubject}>{form.subject}</span>
              <span className={styles.previewClass}>{form.classLevel}</span>
              {form.topic && <span className={styles.previewTopic}>{form.topic}</span>}
            </div>
            <p className={styles.previewQ}>
              {form.questionText || <span style={{ color: 'var(--text-tertiary)' }}>Your question will appear here…</span>}
            </p>
            <div className={styles.previewOptions}>
              {displayOptions.map(opt => (
                <div key={opt.key} className={`${styles.previewOpt} ${opt.key === form.correctAnswer ? styles.previewOptCorrect : ''}`}>
                  <span className={styles.previewOptKey}>{opt.key}</span>
                  <span className={styles.previewOptText}>
                    {form.type === 'true_false' ? opt.text : (opt.text || <span style={{ color: 'var(--text-tertiary)' }}>Option {opt.key}</span>)}
                  </span>
                </div>
              ))}
            </div>
            {form.explanation && (
              <div className={styles.previewExplanation}>
                <span className={styles.previewExplLabel}>Explanation: </span>
                {form.explanation}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
