'use client'
// Proprietor's read-only view of the term's exam timetable
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { useClassLevels } from '@/lib/classLevels'
import { call, errorText, S, PageHeader, Banner, TermPicker, useTerms } from '@/components/finance/ui'
import { ExamTimetableView, PrintStyles, Sitting } from '@/components/examTimetable'

export default function ProprietorExamTimetablePage() {
  const router = useRouter()
  const t = useTerms()
  const levels = useClassLevels()
  const [header, setHeader] = useState<{ title: string; instructions: string | null; published_at: string | null } | null>(null)
  const [entries, setEntries] = useState<Sitting[]>([])
  const [error, setError] = useState('')
  const [classFilter, setClassFilter] = useState('')
  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => {
    if (!t.termId) return
    call(`/exam-timetable?termId=${t.termId}`).then(r => {
      if (!r.ok) { setError(errorText(r.data)); return }
      setHeader(r.data.timetable); setEntries(r.data.entries ?? [])
    })
  }, [t.termId])
  const shown = useMemo(() => entries.filter(e => !classFilter || e.class_level === classFilter), [entries, classFilter])
  return (
    <div style={S.page}>
      <PrintStyles />
      <div className="no-print">
        <PageHeader title="Exam Timetable" subtitle="Read-only. The School Admin builds and publishes the timetable."
          actions={<button style={S.btnGhost} onClick={() => window.print()} disabled={!entries.length}>🖨 Print</button>} />
        <div style={{ ...S.card, display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TermPicker t={t} />
          <div style={{ minWidth: 160 }}>
            <label style={S.label}>Class</label>
            <select style={S.input} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {levels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, padding: '0.25rem 0.6rem', borderRadius: 12, background: header?.published_at ? '#e8f5ee' : '#fffbeb', color: header?.published_at ? '#0f4a32' : '#92400e' }}>
            {header?.published_at ? 'PUBLISHED' : 'DRAFT'}
          </span>
        </div>
        {error && <Banner tone="error">{error}</Banner>}
      </div>
      <div style={S.card}>
        <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>{header?.title ?? 'Examination Timetable'}{classFilter && <span style={{ fontWeight: 500, color: '#6b6b65' }}> · {classFilter}</span>}</div>
        {header?.instructions && <p style={{ fontSize: '0.86rem', color: '#3a3a36', marginTop: '0.4rem', whiteSpace: 'pre-wrap' }}>{header.instructions}</p>}
      </div>
      <ExamTimetableView entries={shown} staff empty="No exam timetable for this term yet." />
    </div>
  )
}
