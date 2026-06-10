// Default subjects for Nigerian secondary schools
export const DEFAULT_SUBJECTS = [
  'Agricultural Science',
  'Biology',
  'Chemistry',
  'Christian Religious Studies',
  'Civic Education',
  'Commerce',
  'Computer Science',
  'Economics',
  'English Language',
  'Financial Accounting',
  'French',
  'Further Mathematics',
  'Geography',
  'Government',
  'History',
  'Home Economics',
  'Islamic Religious Studies',
  'Literature in English',
  'Mathematics',
  'Music',
  'Physical Education',
  'Physics',
  'Technical Drawing',
  'Yoruba',
  'Igbo',
  'Hausa',
]

export function getSubjects(): string[] {
  try {
    if (typeof window === 'undefined') return DEFAULT_SUBJECTS
    const stored = localStorage.getItem('examify_custom_subjects')
    const custom = stored ? JSON.parse(stored) : []
    const all = [...DEFAULT_SUBJECTS, ...custom]
    return [...new Set(all)].sort()
  } catch {
    return DEFAULT_SUBJECTS
  }
}

export function addCustomSubject(subject: string): void {
  try {
    if (typeof window === 'undefined') return
    const stored = localStorage.getItem('examify_custom_subjects')
    const custom = stored ? JSON.parse(stored) : []
    if (!custom.includes(subject) && !DEFAULT_SUBJECTS.includes(subject)) {
      custom.push(subject)
      localStorage.setItem('examify_custom_subjects', JSON.stringify(custom))
    }
  } catch {}
}
