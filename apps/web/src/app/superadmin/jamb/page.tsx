'use client'
// Super admin: JAMB past-question bank (shared by every school)
import { useEffect, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, parseJWT } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL
const COLUMNS = ['subject', 'topic', 'year', 'question', 'optionA', 'optionB', 'optionC', 'optionD', 'correctOption', 'explanation', 'difficulty']

// Minimal RFC-4180 CSV parser (quoted fields, commas and new lines inside quotes)
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQuotes = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(v => v.trim() !== '')) rows.push(row)
  return rows
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
  })
  let data: any = {}
  try { data = await res.json() } catch {}
  return { ok: res.ok, status: res.status, data }
}

const card = { background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }
const btn = { padding: '0.55rem 1.1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }
const ghost = { ...btn, background: 'white', color: '#3a3a36', border: '1px solid #e5e5e0' }
const th = { textAlign: 'left' as const, padding: '0.5rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, color: '#a0a09a', textTransform: 'uppercase' as const, background: '#f7f7f5' }
const td = { padding: '0.5rem 0.75rem', fontSize: '0.82rem', borderTop: '1px solid #f0f0ee', verticalAlign: 'top' as const }

export default function JambBankPage() {
  const router = useRouter()
  const [subjects, setSubjects] = useState<any[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [rows, setRows] = useState<any[]>([])
  const [fileName, setFileName] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string; errors?: any[] } | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const p = parseJWT(getToken())
    if (!p || p.role !== 'super_admin') { router.replace('/superadmin/login'); return }
    load()
  }, [])

  async function load() {
    const r = await call('/superadmin/jamb/subjects')
    if (r.status === 401 || r.status === 403) { router.replace('/superadmin/login'); return }
    setSubjects(r.data.subjects ?? [])
  }

  function downloadTemplate() {
    const sample = [
      COLUMNS.join(','),
      'Mathematics,Quadratic Equations,2019,"Find the roots of x² - 5x + 6 = 0",2 and 3,-2 and -3,1 and 6,-1 and -6,a,"(x-2)(x-3)=0",easy',
      'Use of English,,2021,"Choose the word opposite in meaning to BENEVOLENT",kind,malevolent,generous,happy,b,,medium',
    ].join('\n')
    const blob = new Blob(['﻿' + sample], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'jamb-questions-template.csv'; a.click()
  }

  async function onFile(f: File | undefined) {
    setMsg(null); setRows([])
    if (!f) return
    setFileName(f.name)
    const grid = parseCsv(await f.text())
    if (grid.length < 2) { setMsg({ tone: 'err', text: 'The file has no question rows.' }); return }
    const header = grid[0].map(h => h.trim())
    const missing = COLUMNS.filter(c => !['topic', 'explanation', 'difficulty'].includes(c) && !header.includes(c))
    if (missing.length) { setMsg({ tone: 'err', text: `Missing column(s): ${missing.join(', ')}. Download the template to see the layout.` }); return }
    setRows(grid.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()]))))
  }

  async function upload() {
    setUploading(true); setMsg(null)
    const r = await call('/superadmin/jamb/questions/bulk', { method: 'POST', body: JSON.stringify({ questions: rows }) })
    setUploading(false)
    if (!r.ok) {
      setMsg({ tone: 'err', text: r.data.error === 'ROWS_INVALID' ? `${r.data.errorCount} row(s) have problems. Nothing was added — fix them and upload again.` : (r.data.message ?? 'Upload failed.'), errors: r.data.errors })
      return
    }
    setMsg({ tone: 'ok', text: `Added ${r.data.inserted} question(s).${r.data.duplicates ? ` Skipped ${r.data.duplicates} already in the bank.` : ''}` })
    setRows([]); setFileName('')
    load()
  }

  const total = subjects.reduce((s, x) => s + Number(x.question_count), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 2rem' }}>
        <button onClick={() => router.push('/superadmin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b65', fontSize: '0.84rem', marginBottom: '1rem' }}>← Back to platform admin</button>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>JAMB Question Bank</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Past questions here are shared by every school's SS3 students. {total.toLocaleString()} question(s) across {subjects.length} subject(s).
        </p>

        <div style={card}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.4rem' }}>Upload questions from a spreadsheet</h3>
          <p style={{ fontSize: '0.84rem', color: '#6b6b65', marginBottom: '1rem' }}>
            Save your sheet as CSV with the columns in the template. Subject and topic must match the names below exactly (capital letters don't matter). Leave <strong>topic</strong> blank if unsure; <strong>correctOption</strong> is a, b, c or d.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button style={ghost} onClick={downloadTemplate}>⬇ Download template</button>
            <label style={{ ...btn, display: 'inline-block' }}>
              Choose CSV file
              <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0])} />
            </label>
            {fileName && <span style={{ fontSize: '0.84rem', color: '#3a3a36' }}>{fileName} · {rows.length} row(s)</span>}
            {rows.length > 0 && <button style={{ ...btn, opacity: uploading ? 0.6 : 1 }} disabled={uploading} onClick={upload}>{uploading ? 'Uploading…' : `Add ${rows.length} question(s)`}</button>}
          </div>
          {msg && (
            <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: 10, fontSize: '0.86rem', background: msg.tone === 'ok' ? '#e8f5ee' : '#fef2f2', color: msg.tone === 'ok' ? '#0f4a32' : '#b91c1c', border: `1px solid ${msg.tone === 'ok' ? '#a7d7bf' : '#fecaca'}` }}>
              {msg.text}
              {msg.errors && msg.errors.length > 0 && (
                <ul style={{ margin: '0.5rem 0 0 1.1rem' }}>
                  {msg.errors.slice(0, 20).map((e: any) => <li key={e.row}>Row {e.row + 1} of the file: {e.message}</li>)}
                </ul>
              )}
            </div>
          )}
          {rows.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['subject', 'topic', 'year', 'question', 'correctOption'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((r, i) => (
                  <tr key={i}><td style={td}>{r.subject}</td><td style={td}>{r.topic}</td><td style={td}>{r.year}</td><td style={td}>{r.question}</td><td style={td}>{r.correctOption}</td></tr>
                ))}</tbody>
              </table>
              {rows.length > 5 && <p style={{ fontSize: '0.75rem', color: '#a0a09a', marginTop: '0.4rem' }}>…and {rows.length - 5} more</p>}
            </div>
          )}
        </div>

        <div style={card}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Subjects and topics</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Subject</th><th style={th}>Topics</th><th style={{ ...th, textAlign: 'right' }}>Past questions</th></tr></thead>
            <tbody>
              {subjects.map(s => (
                <Fragment key={s.id}>
                  <tr onClick={() => setOpen(open === s.id ? null : s.id)} style={{ cursor: 'pointer' }}>
                    <td style={td}><strong>{s.name}</strong>{s.is_compulsory ? ' (compulsory)' : ''}</td>
                    <td style={td}>{s.topics.length}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{Number(s.question_count).toLocaleString()}</td>
                  </tr>
                  {open === s.id && s.topics.map((t: any) => (
                    <tr key={t.id}><td style={{ ...td, paddingLeft: '2rem', color: '#3a3a36' }}>{t.name}</td><td style={td}></td><td style={{ ...td, textAlign: 'right', color: Number(t.question_count) === 0 ? '#b91c1c' : '#3a3a36' }}>{t.question_count}</td></tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.75rem', color: '#a0a09a', marginTop: '0.5rem' }}>Click a subject to see its topics. Topics in red have no past questions yet; students can still use Study Notes and AI Practice on them.</p>
        </div>
      </div>
    </div>
  )
}
