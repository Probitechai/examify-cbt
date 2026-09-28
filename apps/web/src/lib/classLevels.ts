'use client'
// Class levels by section, in school order. Keep in step with api/src/lib/classLevels.ts
import { useEffect, useState } from 'react'
import { apiFetch, getToken } from '@/lib/auth'

export const SECTION_LEVELS = {
  nursery: ['Creche', 'Pre-Nursery', 'Nursery 1', 'Nursery 2'],
  primary: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
  secondary: ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'],
} as const
export type Section = keyof typeof SECTION_LEVELS
export const SECTIONS: Section[] = ['nursery', 'primary', 'secondary']
export const SECTION_NAMES: Record<Section, string> = { nursery: 'Nursery', primary: 'Primary', secondary: 'Secondary' }
export const ALL_CLASS_LEVELS: string[] = SECTIONS.flatMap(s => [...SECTION_LEVELS[s]])

/** @deprecated Secondary only. Use useClassLevels() so each school sees its own classes. */
export const CLASS_LEVELS = [...SECTION_LEVELS.secondary]

export function levelsFor(sections: string[]): string[] {
  return SECTIONS.filter(s => sections.includes(s)).flatMap(s => [...SECTION_LEVELS[s]])
}
export function sectionOf(level: string): Section | null {
  for (const s of SECTIONS) if ((SECTION_LEVELS[s] as readonly string[]).includes(level)) return s
  return null
}
/** Sorts class names Creche → SS3; unknown names go last, alphabetically */
export function sortClassLevels<T>(items: T[], key: (x: T) => string = (x: any) => x): T[] {
  const rank = (l: string) => { const i = ALL_CLASS_LEVELS.indexOf(l); return i < 0 ? 999 : i }
  return [...items].sort((a, b) => rank(key(a)) - rank(key(b)) || key(a).localeCompare(key(b)))
}

// One request per signed-in session; every screen shares it
let cache: { token: string; promise: Promise<{ sections: Section[]; levels: string[] }> } | null = null
function loadSchoolLevels() {
  const token = getToken() ?? ''
  if (!cache || cache.token !== token) {
    const API = process.env.NEXT_PUBLIC_API_URL
    cache = {
      token,
      promise: apiFetch(`${API}/schools/class-levels`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => (d?.levels?.length ? { sections: d.sections, levels: d.levels } : { sections: ['secondary'] as Section[], levels: [...SECTION_LEVELS.secondary] }))
        .catch(() => { cache = null; return { sections: ['secondary'] as Section[], levels: [...SECTION_LEVELS.secondary] } }),
    }
  }
  return cache.promise
}
/** Call after changing a school's sections so every screen picks it up */
export function refreshClassLevels() { cache = null }

/** This school's classes, in order. Empty until loaded. */
export function useClassLevels(): string[] {
  return useSchoolSections().levels
}
export function useSchoolSections(): { sections: Section[]; levels: string[]; loaded: boolean } {
  const [state, setState] = useState<{ sections: Section[]; levels: string[]; loaded: boolean }>({ sections: [], levels: [], loaded: false })
  useEffect(() => {
    let live = true
    loadSchoolLevels().then(d => { if (live) setState({ ...d, loaded: true }) })
    return () => { live = false }
  }, [])
  return state
}

/**
 * Keeps a selected class valid for this school: whenever the value isn't one
 * of the school's classes (e.g. an 'SS2' default in a primary-only school),
 * switch to the first class. A blank value ("All classes") is left alone.
 */
export function useDefaultClass(levels: string[], value: string | undefined, set: (v: string) => void) {
  useEffect(() => {
    if (!levels.length || !value) return
    if (!levels.includes(value)) set(levels[0])
  }, [levels.join('|'), value])
}
