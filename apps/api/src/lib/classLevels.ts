// Class levels by section, in school order. Keep in step with web/src/lib/classLevels.ts
export const SECTION_LEVELS = {
  nursery: ['Creche', 'Pre-Nursery', 'Nursery 1', 'Nursery 2'],
  primary: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'],
  secondary: ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'],
} as const
export type Section = keyof typeof SECTION_LEVELS
export const SECTIONS: Section[] = ['nursery', 'primary', 'secondary']
export const ALL_CLASS_LEVELS: string[] = SECTIONS.flatMap(s => [...SECTION_LEVELS[s]])

export function levelsFor(sections: string[] | null | undefined): string[] {
  const set = new Set(sections && sections.length ? sections : ['secondary'])
  return SECTIONS.filter(s => set.has(s)).flatMap(s => [...SECTION_LEVELS[s]])
}
export function sectionOf(level: string): Section | null {
  for (const s of SECTIONS) if ((SECTION_LEVELS[s] as readonly string[]).includes(level)) return s
  return null
}
/** uuid[]/text[] columns can come back as '{a,b}' text */
export function asSections(v: any): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return v.replace(/^\{|\}$/g, '').split(',').map(x => x.trim()).filter(Boolean)
  return ['secondary']
}
