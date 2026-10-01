'use client'
// Import questions from a spreadsheet saved as CSV. The file is checked first;
// problems are listed by spreadsheet row and nothing is imported until they're fixed.
import { apiFetch, checkAuth } from '@/lib/auth'
import { csvObjects, toCsv } from '@/lib/csv'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL
const HEADERS = ['type', 'subject', 'class', 'topic', 'question', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'answer', 'marks', 'difficulty', 'explanation']
const EXAMPLES = [
  ['mcq', 'Mathematics', 'JSS2', 'Fractions', 'What is 1/2 + 1/4?', '3/4', '1/6', '2/6', '1/8', '', 'A', '1', 'easy', 'Use a common denominator of 4.'],
  ['true_false', 'Basic Science', 'JSS1', 'Living things', 'Plants make their own food.', '', '', '', '', '', 'True', '1', 'easy', ''],
  ['short_answer', 'Chemistry', 'SS1', 'Formulae', 'What is the chemical formula of water?', '', '', '', '', '', 'H2O|H₂O', '1', 'easy', ''],
  ['fill_blank', 'Social Studies', 'JSS1', 'Nigeria', 'The capital of Nigeria is ___.', '', '', '', '', '', 'Abuja|FCT Abuja', '1', 'easy', ''],
  ['essay', 'Literature in English', 'SS3', 'Drama', 'Discuss the theme of betrayal in the play.', '', '', '', '', '', '', '10', 'hard', '4 marks for points, 4 for evidence from the text, 2 for organisation'],
]

const btn = (primary = false) => ({ padding: '0.6rem 1.1rem', borderRadius: 8, border: primary ? 'none' : '1.5px solid #e5e5e0', background: primary ? '#1a6b4a' : 'white', color: primary ? 'white' : '#3a3a36', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' })
const card = { background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, padding: '1.25rem 1.4rem', marginBottom: '1rem' }

type Check = { rows: number; toImport: number; duplicates: number[]; errors: { row: number; message: string }[]; imported: number }

export default function ImportQuestionsPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState<'' | 'checking' | 'importing'>('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => { checkAuth(router, ['school_admin', 'teacher']) }, [])

  function downloadTemplate() {
    const blob = new Blob(['﻿' + toCsv([HEADERS, ...EXAMPLES])], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'examify-questions-template.csv'; a.click()
    URL.revokeObjectURL(a.href)
  }

  async function onFile(f: File | undefined) {
    setError(''); setCheck(null); setDone(null); setRows([])
    if (!f) return
    if (!/\.csv$/i.test(f.name)) { setError('Choose a .csv file. In Excel or Google Sheets, use File → Save as / Download → CSV.'); return }
    setFileName(f.name)
    const { headers, rows } = csvObjects(await f.text())
    const lower = headers.map(h => h.toLowerCase())
    if (!lower.includes('question') || !lower.includes('subject')) { setError('The first row must be the column names from the template (at least “question”, “subject” and “class”).'); return }
    if (!rows.length) { setError('The file has no questions under the column names.'); return }
    setRows(rows)
    setBusy('checking')
    const res = await apiFetch(`${API}/questions/import`, { method: 'POST', body: JSON.stringify({ rows, dryRun: true }) })
    const data = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) { setError(data.message ?? 'Could not check the file.'); return }
    setCheck(data)
  }

  async function doImport() {
    setBusy('importing'); setError('')
    const res = await apiFetch(`${API}/questions/import`, { method: 'POST', body: JSON.stringify({ rows }) })
    const data = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) { setError(data.message ?? 'Import failed.'); if (data.errors) setCheck(data); return }
    setDone(data.imported)
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, fontFamily: 'system-ui' }}>
      <button onClick={() => router.push('/admin/qbank')} style={{ ...btn(), padding: '0.45rem 0.9rem', fontSize: '0.8rem', marginBottom: '1rem' }}>← Question Bank</button>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18' }}>Import questions</h1>
      <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.25rem' }}>Add many questions at once from a spreadsheet. The questions are added as yours.</p>

      {done !== null ? (
        <div style={{ ...card, textAlign: 'center', padding: '2rem' }}>
          <div style={{ fontSize: '2rem' }}>✅</div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0.5rem 0' }}>{done} question{done === 1 ? '' : 's'} imported</h2>
          {!!check?.duplicates.length && <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>{check.duplicates.length} already in the bank {check.duplicates.length === 1 ? 'was' : 'were'} skipped.</p>}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem' }}>
            <button style={btn()} onClick={() => { setDone(null); setCheck(null); setRows([]); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}>Import another file</button>
            <button style={btn(true)} onClick={() => router.push('/admin/qbank')}>Go to the Question Bank</button>
          </div>
        </div>
      ) : (
        <>
          <div style={card}>
            <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>1. Fill in the template</p>
            <p style={{ fontSize: '0.85rem', color: '#3a3a36', lineHeight: 1.6, marginBottom: '0.75rem' }}>
              One question per row. It has an example of each type: replace them with your questions, keeping the first row of column names.
            </p>
            <ul style={{ fontSize: '0.82rem', color: '#3a3a36', lineHeight: 1.7, paddingLeft: '1.1rem', marginBottom: '0.9rem' }}>
              <li><strong>type</strong>: mcq, true_false, short_answer, fill_blank or essay</li>
              <li><strong>class</strong>: one of your school’s classes, e.g. JSS2 or Primary 4</li>
              <li><strong>answer</strong>: for mcq, the letter (A–E) or the option’s text. For true_false, True or False. For short_answer and fill_blank, every accepted answer separated by a vertical bar, e.g. <code>Abuja|FCT Abuja</code>. Leave it empty for essays.</li>
              <li><strong>fill_blank</strong> questions need ___ (three underscores) where the blank goes</li>
              <li><strong>explanation</strong>: shown to students after the exam; for essays, it’s the marking guide</li>
              <li><strong>marks</strong> (default 1), <strong>difficulty</strong> (easy, medium, hard) and <strong>topic</strong> are optional</li>
            </ul>
            <button style={btn()} onClick={downloadTemplate}>⇩ Download template</button>
          </div>

          <div style={card}>
            <p style={{ fontWeight: 700, marginBottom: '0.5rem' }}>2. Save it as CSV and choose it here</p>
            <p style={{ fontSize: '0.82rem', color: '#6b6b65', marginBottom: '0.75rem' }}>Excel: File → Save As → “CSV UTF-8”. Google Sheets: File → Download → CSV.</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} />
            {busy === 'checking' && <p style={{ fontSize: '0.85rem', color: '#6b6b65', marginTop: '0.75rem' }}>Checking {fileName}…</p>}
            {error && <p style={{ fontSize: '0.85rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.65rem 0.85rem', marginTop: '0.75rem' }}>{error}</p>}
          </div>

          {check && (
            <div style={card}>
              <p style={{ fontWeight: 700, marginBottom: '0.75rem' }}>3. Check and import</p>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.9rem', fontSize: '0.9rem' }}>
                <span><strong style={{ color: '#0f4a32', fontSize: '1.2rem' }}>{check.toImport}</strong> ready to import</span>
                {!!check.duplicates.length && <span><strong style={{ fontSize: '1.2rem' }}>{check.duplicates.length}</strong> already in the bank (skipped)</span>}
                {!!check.errors.length && <span><strong style={{ color: '#b91c1c', fontSize: '1.2rem' }}>{check.errors.length}</strong> with problems</span>}
              </div>
              {!!check.errors.length && (
                <>
                  <p style={{ fontSize: '0.85rem', color: '#78350f', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.6rem 0.8rem', marginBottom: '0.75rem' }}>
                    Fix these rows in your spreadsheet, save it as CSV again and choose it above. Nothing is imported until every row is fine.
                  </p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                    <thead><tr><th style={{ textAlign: 'left', padding: '0.4rem', borderBottom: '1px solid #e5e5e0', width: 70 }}>Row</th><th style={{ textAlign: 'left', padding: '0.4rem', borderBottom: '1px solid #e5e5e0' }}>Problem</th></tr></thead>
                    <tbody>{check.errors.map(e => (
                      <tr key={e.row}><td style={{ padding: '0.4rem', borderBottom: '1px solid #f0f0ee', fontWeight: 600 }}>{e.row}</td><td style={{ padding: '0.4rem', borderBottom: '1px solid #f0f0ee' }}>{e.message}</td></tr>
                    ))}</tbody>
                  </table>
                </>
              )}
              {!!check.duplicates.length && <p style={{ fontSize: '0.8rem', color: '#6b6b65', marginBottom: '0.75rem' }}>Already in the bank: row{check.duplicates.length === 1 ? '' : 's'} {check.duplicates.join(', ')}.</p>}
              <button style={{ ...btn(true), opacity: check.errors.length || !check.toImport || busy ? 0.5 : 1 }} disabled={!!check.errors.length || !check.toImport || !!busy} onClick={doImport}>
                {busy === 'importing' ? 'Importing…' : `Import ${check.toImport} question${check.toImport === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
