'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from './questions.module.css'

interface Question {
  id: string
  type: string
  subject: string
  classLevel: string
  topic: string
  questionText: string
  options: Array<{ key: string; text: string }>
  correctAnswer: string
  marks: number
  difficulty: string
}

const MOCK_QUESTIONS: Question[] = [
  { id: '1', type: 'mcq', subject: 'English Language', classLevel: 'SS2', topic: 'Grammar', questionText: 'Choose the sentence with the correct use of the apostrophe.', options: [{ key: 'A', text: "The boys' bags are heavy." }, { key: 'B', text: "The boy's bags are heavy." }, { key: 'C', text: 'The boys bags are heavy.' }, { key: 'D', text: "The boys bag's are heavy." }], correctAnswer: 'A', marks: 1, difficulty: 'medium' },
  { id: '2', type: 'mcq', subject: 'English Language', classLevel: 'SS2', topic: 'Grammar', questionText: 'Identify the verb in: "The students wrote their examinations carefully."', options: [{ key: 'A', text: 'students' }, { key: 'B', text: 'examinations' }, { key: 'C', text: 'wrote' }, { key: 'D', text: 'carefully' }], correctAnswer: 'C', marks: 1, difficulty: 'easy' },
  { id: '3', type: 'mcq', subject: 'English Language', classLevel: 'SS2', topic: 'Comprehension', questionText: 'Which of the following is a conjunction?', options: [{ key: 'A', text: 'Quickly' }, { key: 'B', text: 'Because' }, { key: 'C', text: 'Beautiful' }, { key: 'D', text: 'Underneath' }], correctAnswer: 'B', marks: 1, difficulty: 'easy' },
  { id: '4', type: 'mcq', subject: 'English Language', classLevel: 'SS3', topic: 'Literature', questionText: 'What figure of speech is used in "The wind whispered through the trees"?', options: [{ key: 'A', text: 'Simile' }, { key: 'B', text: 'Metaphor' }, { key: 'C', text: 'Personification' }, { key: 'D', text: 'Hyperbole' }], correctAnswer: 'C', marks: 2, difficulty: 'medium' },
  { id: '5', type: 'mcq', subject: 'English Language', classLevel: 'SS1', topic: 'Vocabulary', questionText: 'Which word is an antonym of "benevolent"?', options: [{ key: 'A', text: 'Kind' }, { key: 'B', text: 'Generous' }, { key: 'C', text: 'Malevolent' }, { key: 'D', text: 'Charitable' }], correctAnswer: 'C', marks: 1, difficulty: 'hard' },
]

const DIFF_COLORS: Record<string, string> = { easy: styles.diffEasy, medium: styles.diffMedium, hard: styles.diffHard }

export default function QuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState(MOCK_QUESTIONS)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [diffFilter, setDiffFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<Question | null>(null)

  const filtered = questions.filter(q => {
    if (search && !q.questionText.toLowerCase().includes(search.toLowerCase()) && !q.topic.toLowerCase().includes(search.toLowerCase())) return false
    if (classFilter && q.classLevel !== classFilter) return false
    if (diffFilter && q.difficulty !== diffFilter) return false
    return true
  })

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function deleteSelected() {
    setQuestions(qs => qs.filter(q => !selected.has(q.id)))
    setSelected(new Set())
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Question bank</h1>
          <p className={styles.subtitle}>{questions.length} questions across all subjects and classes</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.importBtn} onClick={() => router.push('/teacher/questions/import')}>
            <i className="ti ti-upload" aria-hidden="true" /> Import
          </button>
          <button className={styles.newBtn} onClick={() => router.push('/teacher/questions/new')}>
            <i className="ti ti-plus" aria-hidden="true" /> New question
          </button>
        </div>
      </div>

      <div className={styles.filterRow}>
        <input
          className={styles.search}
          placeholder="Search questions or topics…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className={styles.sel} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          <option>SS1</option><option>SS2</option><option>SS3</option>
        </select>
        <select className={styles.sel} value={diffFilter} onChange={e => setDiffFilter(e.target.value)}>
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        {selected.size > 0 && (
          <button className={styles.deleteBtn} onClick={deleteSelected}>
            <i className="ti ti-trash" aria-hidden="true" /> Delete {selected.size} selected
          </button>
        )}
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <span />
          <span>Question</span>
          <span>Class</span>
          <span>Topic</span>
          <span>Difficulty</span>
          <span>Marks</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <i className="ti ti-clipboard-list" style={{ fontSize: 32, color: 'var(--text-tertiary)' }} aria-hidden="true" />
            <p>No questions found. Try adjusting your filters.</p>
          </div>
        ) : filtered.map(q => (
          <div key={q.id} className={`${styles.tableRow} ${selected.has(q.id) ? styles.rowSelected : ''}`}>
            <span>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selected.has(q.id)}
                onChange={() => toggleSelect(q.id)}
              />
            </span>
            <span className={styles.qText} onClick={() => setPreview(q)}>{q.questionText}</span>
            <span className={styles.cell}>{q.classLevel}</span>
            <span className={styles.cell}>{q.topic}</span>
            <span>
              <span className={`${styles.diffPill} ${DIFF_COLORS[q.difficulty]}`}>{q.difficulty}</span>
            </span>
            <span className={styles.cell}>{q.marks} mk{q.marks > 1 ? 's' : ''}</span>
            <span className={styles.rowActions}>
              <button className={styles.rowBtn} onClick={() => setPreview(q)} title="Preview">
                <i className="ti ti-eye" aria-hidden="true" />
              </button>
              <button className={styles.rowBtn} onClick={() => router.push(`/teacher/questions/${q.id}/edit`)} title="Edit">
                <i className="ti ti-edit" aria-hidden="true" />
              </button>
            </span>
          </div>
        ))}
      </div>

      {/* Preview modal */}
      {preview && (
        <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && setPreview(null)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <span className={`${styles.diffPill} ${DIFF_COLORS[preview.difficulty]}`}>{preview.difficulty}</span>
                <span className={styles.modalMeta}> · {preview.classLevel} · {preview.topic} · {preview.marks} mark{preview.marks > 1 ? 's' : ''}</span>
              </div>
              <button className={styles.closeBtn} onClick={() => setPreview(null)}>
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            </div>
            <p className={styles.modalQ}>{preview.questionText}</p>
            <div className={styles.optionList}>
              {preview.options.map(opt => (
                <div key={opt.key} className={`${styles.optRow} ${opt.key === preview.correctAnswer ? styles.optCorrect : ''}`}>
                  <span className={styles.optKey}>{opt.key}</span>
                  <span className={styles.optText}>{opt.text}</span>
                  {opt.key === preview.correctAnswer && (
                    <span className={styles.correctMark}><i className="ti ti-check" aria-hidden="true" /> Correct</span>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.editBtn} onClick={() => { setPreview(null); router.push(`/teacher/questions/${preview.id}/edit`) }}>
                <i className="ti ti-edit" aria-hidden="true" /> Edit question
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
