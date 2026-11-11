import { useState, useEffect } from 'react'
import { hdrs } from './auth'

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
  'Business Studies',
  'Catering Craft',
  'Digital Technology',
  'Intermediate Science',
  'Livestock Farming',
  'Marketing',
  'Nigerian History',
  'Physical and Health Education',
  'Social and Citizenship Studies',
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

// The school's own subjects (added under Curriculum, or already given to teachers)
// together with the defaults, so a subject added once shows up on every computer.
// Falls back to the defaults if the school's list can't be loaded.
export function useSchoolSubjects(): string[] {
  const [list, setList] = useState<string[]>(DEFAULT_SUBJECTS)
  useEffect(() => {
    let alive = true
    setList(getSubjects())
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/subjects/names`, { headers: hdrs() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !Array.isArray(d?.subjects)) return
        setList([...new Set([...getSubjects(), ...d.subjects])].sort((a, b) => a.localeCompare(b)))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return list
}
