'use client'
import SubjectSelector from '../../../components/SubjectSelector'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '../../../lib/api'
import styles from './questions.module.css'


interface Question {
  id: string
  type: string
  subject: string
  class_level: string
  topic: string | null
  question_text: string
  correct_answer: string
  marks: number
  difficulty: string | null
  created_by_name: string
  created_at: string
}

export default function AdminQuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [diffFilter, setDiffFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => { loadQuestions() }, [])

  async function loadQuestions() {
    try {
      setLoading(true)
      const data = await api.getQuestions() as any
      setQuestions(data.questions ?? [])
    } catch (err) {
      console.error('Failed to load questions:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = questions.filter(q => {
    if (search && !q.question_text.toLowerCase().includes(search.toLowerCase()) &&
        !(q.topic ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (subjectFilter && q.subject !== subjectFilter) return false
    if (classFilter && q.class_level !== classFilter) return false
    if (diffFilter && q.difficulty !== diffFilter) return false
    return true
  })

  const subjects = [...new Set(questions.map(q => q.subject))].sort()
  const classes = [...new Set(questions.map(q => q.class_level))].sort()

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(q => q.id)))
  }

  async function deleteSelected() {
    if (!window.confirm(`Delete ${selected.size} question${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await Promise.all([...selected].map(id => (api as any).deleteQuestion(id)))
      setQuestions(qs => qs.filter(q => !selected.has(q.id)))
      setSelected(new Set())
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setDeleting(false)
    }
  }

  function getDiffStyle(diff: string | null) {
    if (diff === 'easy') return styles.diffEasy
    if (diff === 'hard') return styles.diffHard
    return styles.diffMedium
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Question Bank</h1>
          <p className={styles.subtitle}>
            {loading ? 'Loading...' : `${questions.length} questions across all subjects`}
          </p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAddForm(true)}>
          + New question
        </button>
      </div>

      <div className={styles.filterRow}>
        <input className={styles.search} placeholder="Search questions or topics…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className={styles.sel} value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className={styles.sel} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className={styles.sel} value={diffFilter} onChange={e => setDiffFilter(e.target.value)}>
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        {selected.size > 0 && (
          <button className={styles.deleteBtn} onClick={deleteSelected} disabled={deleting}>
            {deleting ? 'Deleting...' : `Delete ${selected.size}`}
          </button>
        )}
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <span><input type="checkbox"
            checked={selected.size === filtered.length && filtered.length > 0}
            onChange={toggleSelectAll} /></span>
          <span>Question</span>
          <span>Subject</span>
          <span>Class</span>
          <span>Topic</span>
          <span>Difficulty</span>
          <span>Marks</span>
          <span>Added</span>
          <span></span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            {[1,2,3,4,5].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>❓</div>
            <p>No questions found.</p>
            {questions.length === 0 && (
              <button className={styles.addBtn} style={{ marginTop: '1rem' }}
                onClick={() => setShowAddForm(true)}>
                Add your first question
              </button>
            )}
          </div>
        ) : filtered.map(q => (
          <div key={q.id} className={`${styles.tableRow} ${selected.has(q.id) ? styles.rowSelected : ''}`}>
            <span><input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} /></span>
            <span className={styles.qText}>{q.question_text}</span>
            <span className={styles.cell}>{q.subject}</span>
            <span className={styles.cell}>{q.class_level}</span>
            <span className={styles.cell}>{q.topic ?? '—'}</span>
            <span>
              {q.difficulty
                ? <span className={`${styles.diffPill} ${getDiffStyle(q.difficulty)}`}>{q.difficulty}</span>
                : '—'}
            </span>
            <span className={styles.cell}>{q.marks} mk</span>
            <span className={styles.cell}>{formatDate(q.created_at)}</span>
            <span>
              <button className={styles.editBtn} onClick={() => setShowAddForm(true)}>Edit</button>
            </span>
          </div>
        ))}
      </div>

      {showAddForm && (
        <AddQuestionModal
          onClose={() => setShowAddForm(false)}
          onSaved={() => { setShowAddForm(false); loadQuestions() }}
        />
      )}
    </div>
  )
}

function AddQuestionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    subject: 'English Language',
    classLevel: 'SS2',
    topic: '',
    questionText: '',
    optionA: '',
    optionB: '',
    optionC: '',
    optionD: '',
    correctAnswer: 'A',
    marks: 1,
    difficulty: 'medium',
  })

  function set(key: string, val: any) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    if (!form.questionText.trim()) { setError('Question text is required'); return }
    if (!form.optionA.trim() || !form.optionB.trim()) { setError('At least options A and B are required'); return }
    setSaving(true)
    setError('')
    try {
      await api.createQuestion({
        type: 'mcq',
        subject: form.subject,
        classLevel: form.classLevel,
        topic: form.topic || undefined,
        questionText: form.questionText,
        options: [
          { key: 'A', text: form.optionA },
          { key: 'B', text: form.optionB },
          ...(form.optionC ? [{ key: 'C', text: form.optionC }] : []),
          ...(form.optionD ? [{ key: 'D', text: form.optionD }] : []),
        ],
        correctAnswer: form.correctAnswer,
        marks: form.marks,
        difficulty: form.difficulty,
      })
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>New Question</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formRow}>
            <div className={styles.formField}>
              <label>Subject</label>
              <SubjectSelector
                value={form.subject}
                onChange={val => set('subject', val)}
                style={inputStyle}
              />
            </div>
            <div className={styles.formField}>
              <label>Class</label>
              <select value={form.classLevel} onChange={e => set('classLevel', e.target.value)}>
                <option>SS1</option><option>SS2</option><option>SS3</option>
              </select>
            </div>
            <div className={styles.formField}>
              <label>Difficulty</label>
              <select value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className={styles.formField}>
              <label>Marks</label>
              <input type="number" min={1} max={10} value={form.marks}
                onChange={e => set('marks', Number(e.target.value))} />
            </div>
          </div>

          <div className={styles.formField}>
            <label>Topic (optional)</label>
            <input value={form.topic} onChange={e => set('topic', e.target.value)}
              placeholder="e.g. Grammar, Algebra, Ecology" />
          </div>

          <div className={styles.formField}>
            <label>Question text</label>
            <textarea rows={3} value={form.questionText}
              onChange={e => set('questionText', e.target.value)}
              placeholder="Type the question here…" />
          </div>

          <p className={styles.hint}>Click the letter button to mark the correct answer</p>

          <div className={styles.optionsGrid}>
            {[
              { key: 'A', field: 'optionA' },
              { key: 'B', field: 'optionB' },
              { key: 'C', field: 'optionC' },
              { key: 'D', field: 'optionD' },
            ].map(opt => (
              <div key={opt.key}
                className={`${styles.optionField} ${form.correctAnswer === opt.key ? styles.optionCorrect : ''}`}>
                <button
                  className={`${styles.optKey} ${form.correctAnswer === opt.key ? styles.optKeySelected : ''}`}
                  onClick={() => set('correctAnswer', opt.key)}
                  title="Mark as correct answer"
                >
                  {opt.key}
                </button>
                <input
                  value={(form as any)[opt.field]}
                  onChange={e => set(opt.field, e.target.value)}
                  placeholder={`Option ${opt.key}${opt.key === 'C' || opt.key === 'D' ? ' (optional)' : ''}`}
                />
              </div>
            ))}
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save question'}
          </button>
        </div>
      </div>
    </div>
  )
}
