// Shared by the question forms and lists. Keep in step with api/src/lib/grading.ts

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ', true_false: 'True/False', short_answer: 'Short Answer', fill_blank: 'Fill in Blank', essay: 'Essay',
}

/** Accepted answers typed one per line (or separated by |) → stored form "a|b" */
export function acceptedFromText(text: string): string {
  return text.split(/\n|\|/).map(s => s.trim()).filter(Boolean).join('|')
}

/** Stored "a|b" → shown "a / b" */
export const showAccepted = (stored: string | null | undefined) => String(stored ?? '').split('|').filter(Boolean).join(' / ')

export const hasBlank = (text: string) => /_{3,}/.test(text)

export const ACCEPTED_HELP = 'One accepted answer per line. Marking ignores capital letters, extra spaces and a final full stop.'

/** Same rule as the server: ignore case, extra spaces and a final full stop */
export const normaliseTyped = (s: unknown) =>
  String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim().toLowerCase()
export const typedIsCorrect = (answer: unknown, stored: string | null | undefined) =>
  !!String(answer ?? '').trim() && String(stored ?? '').split('|').map(normaliseTyped).filter(Boolean).includes(normaliseTyped(answer))
