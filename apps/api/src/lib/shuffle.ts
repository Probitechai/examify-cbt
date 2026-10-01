// Per-student answer-option order for MCQs ("Randomise answer options").
// The order comes from the session and question ids, so a student sees the same
// order every time they open the exam (and in their review), while different
// students see different orders. Answers are still stored by the option's own
// key, so marking is unchanged; only the display letters (label) follow the order.
import { createHash } from 'crypto'

function seededRandom(seed: string) {
  let s = createHash('sha256').update(seed).digest().readUInt32LE(0) || 1
  return () => { // mulberry32
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// "All of the above", "None of the above", "Both A and B" make no sense moved, so they stay last
const STAYS_LAST = /^\s*(all|none|both|neither)\b.*\b(above|these|options?|a and b)\b/i

export type Option = { key: string; text: string; label?: string }

export function shuffleOptions(options: Option[], seed: string): Option[] {
  const fixed = options.filter(o => STAYS_LAST.test(o.text ?? ''))
  const free = options.filter(o => !STAYS_LAST.test(o.text ?? ''))
  const rand = seededRandom(seed)
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[free[i], free[j]] = [free[j], free[i]]
  }
  return withLabels([...free, ...fixed])
}

/** Display letters by position: A, B, C, … */
export function withLabels(options: Option[]): Option[] {
  return options.map((o, i) => ({ ...o, label: String.fromCharCode(65 + i) }))
}
