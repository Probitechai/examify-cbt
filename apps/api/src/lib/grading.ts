// Marking CBT answers.
//   mcq, true_false       the chosen option must match
//   short_answer          typed answer must match one of the accepted answers
//   fill_blank            the word or phrase for the blank, same rule
//   essay                 marked by a teacher
// Accepted answers are stored separated by "|", e.g. "Abuja|FCT Abuja".
// Typed answers are compared ignoring case, extra spaces and a final full stop.

export const QUESTION_TYPES = ['mcq', 'true_false', 'short_answer', 'fill_blank', 'essay'] as const
export type QuestionType = typeof QUESTION_TYPES[number]

export type MarkableQuestion = { id: string; type: string; correct_answer: string | null; marks: number | string }
export type ManualMark = { marks: number; comment?: string | null; by?: string; at?: string }

export function normaliseTyped(s: unknown): string {
  return String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim().toLowerCase()
}

export function acceptedAnswers(correct: string | null): string[] {
  return String(correct ?? '').split('|').map(normaliseTyped).filter(Boolean)
}

/** Marks for one answer; null when a teacher has to mark it (essays) */
export function autoMark(q: MarkableQuestion, answer: unknown): number | null {
  const marks = Number(q.marks) || 0
  if (q.type === 'essay') return null
  const given = String(answer ?? '').trim()
  if (!given) return 0
  if (q.type === 'short_answer' || q.type === 'fill_blank') {
    return acceptedAnswers(q.correct_answer).includes(normaliseTyped(given)) ? marks : 0
  }
  return given.toUpperCase() === String(q.correct_answer ?? '').trim().toUpperCase() ? marks : 0
}

/**
 * Marks a whole paper. score is null while essays are still waiting for a teacher.
 * Essays left blank get 0 automatically and don't wait for marking.
 */
export function markPaper(questions: MarkableQuestion[], answers: Record<string, string>, manual: Record<string, ManualMark> = {}) {
  let auto = 0, manualTotal = 0
  const waiting: string[] = []
  for (const q of questions) {
    const m = autoMark(q, answers[q.id])
    if (m !== null) { auto += m; continue }
    if (!String(answers[q.id] ?? '').trim()) continue                 // blank essay: 0
    const given = manual[q.id]
    if (given && Number.isFinite(Number(given.marks))) manualTotal += Number(given.marks)
    else waiting.push(q.id)
  }
  return { auto, manualTotal, waiting, score: waiting.length ? null : auto + manualTotal }
}
