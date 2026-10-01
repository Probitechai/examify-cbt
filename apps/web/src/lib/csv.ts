// Small CSV reader for spreadsheets saved as CSV (Excel, Google Sheets).
// Handles quoted cells with commas, quotes ("") and line breaks, a byte-order
// mark, Windows line endings, and ; or tab separators (some Excel settings).

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>
  let quoted = false
  for (const ch of firstLine) { if (ch === '"') quoted = !quoted; else if (!quoted && ch in counts) counts[ch]++ }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', inQ = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQ) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') inQ = false
      else cell += ch
    } else if (ch === '"') inQ = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/** Rows as objects keyed by the header row */
export function csvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text).filter((r, i) => i === 0 || r.some(c => c.trim()))
  const headers = (all[0] ?? []).map(h => h.trim())
  const rows = all.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { headers, rows }
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(c => {
    const s = String(c ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\r\n')
}
