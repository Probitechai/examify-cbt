'use client'
// SS3 JAMB progress for staff. Proprietor & Admin see every SS3 student;
// teachers see the SS3 arms they are assigned to.
import { useEffect, useMemo, useState } from 'react'
import { call, fmtDate, fmtDateTime, downloadCsv, today, S, Banner, Pill, Field, Table, PageHeader, Modal } from '@/components/finance/ui'

function masteryTone(v: number | null): 'success' | 'warning' | 'error' | 'info' {
  if (v === null) return 'info'
  if (v >= 70) return 'success'
  if (v >= 50) return 'warning'
  return 'error'
}

function daysSince(d: string | null): number | null {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export function JambCohort() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [arm, setArm] = useState('')
  const [sort, setSort] = useState<'name' | 'mock' | 'xp' | 'inactive'>('name')
  const [open, setOpen] = useState<any | null>(null)

  useEffect(() => {
    call('/jamb/cohort').then(r => {
      if (!r.ok) { setError(r.data?.message ?? 'You don’t have access to JAMB progress.'); return }
      setData(r.data)
    })
  }, [])

  const students: any[] = data?.students ?? []
  const arms = useMemo(() => Array.from(new Set(students.map(s => s.classArm ?? '—'))).sort(), [students])
  const shown = useMemo(() => {
    const list = students.filter(s => !arm || (s.classArm ?? '—') === arm)
    const bestMock = (s: any) => s.latestMock ?? -1
    const sorted = [...list]
    if (sort === 'mock') sorted.sort((a, b) => bestMock(b) - bestMock(a))
    if (sort === 'xp') sorted.sort((a, b) => b.xp - a.xp)
    if (sort === 'inactive') sorted.sort((a, b) => (daysSince(b.lastStudied) ?? 9999) - (daysSince(a.lastStudied) ?? 9999))
    return sorted
  }, [students, arm, sort])

  const startedCount = shown.filter(s => s.started).length
  const active7 = shown.filter(s => { const d = daysSince(s.lastStudied); return d !== null && d <= 7 }).length
  const fullMocks = shown.filter(s => s.latestMock !== null && s.latestMockMode === 'full')
  const avgMock = fullMocks.length ? Math.round(fullMocks.reduce((a, s) => a + s.latestMock, 0) / fullMocks.length) : null

  return (
    <div style={S.page}>
      <PageHeader title="JAMB Progress (SS3)" subtitle={data?.scope === 'assigned' ? `SS3 students in the arm(s) you teach: ${(data?.arms ?? []).join(', ')}` : 'Every SS3 student’s JAMB Prep activity, mastery and mock scores.'} />
      {error && <Banner tone="error">{error}</Banner>}
      {data && students.length === 0 && (
        <Banner tone="info">{data.scope === 'assigned' ? 'You aren’t assigned to any SS3 class, so there are no students to show.' : 'No active SS3 students yet.'}</Banner>
      )}
      {students.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {[
              ['SS3 students', String(shown.length)],
              ['Set up JAMB Prep', `${startedCount} of ${shown.length}`],
              ['Studied in last 7 days', `${active7} of ${shown.length}`],
              ['Average latest full mock', avgMock === null ? '—' : `${avgMock} / 400`],
            ].map(([k, v]) => (
              <div key={k} style={{ ...S.card, marginBottom: 0 }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{k}</p>
                <p style={{ fontSize: '1.3rem', fontWeight: 700 }}>{v}</p>
              </div>
            ))}
          </div>
          <div style={{ ...S.card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 220px))', gap: '1rem', alignItems: 'flex-end' }}>
            <Field label="Arm">
              <select style={S.input} value={arm} onChange={e => setArm(e.target.value)}>
                <option value="">All arms</option>
                {arms.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Sort by">
              <select style={S.input} value={sort} onChange={e => setSort(e.target.value as any)}>
                <option value="name">Name</option><option value="mock">Latest mock score</option>
                <option value="xp">XP</option><option value="inactive">Longest without studying</option>
              </select>
            </Field>
            <button style={S.btnGhost} onClick={() => downloadCsv(`jamb-progress-${today()}.csv`, [
              { key: 'fullName', label: 'Student' }, { key: 'admissionNo', label: 'Admission No' }, { key: 'classArm', label: 'Arm' },
              { key: 'subjectsText', label: 'Subjects (mastery %)' }, { key: 'xp', label: 'XP' }, { key: 'streak', label: 'Streak' },
              { key: 'lastStudied', label: 'Last studied' }, { key: 'questions', label: 'Questions' }, { key: 'accuracy', label: 'Accuracy %' },
              { key: 'mocksTaken', label: 'Mocks taken' }, { key: 'bestFullMock', label: 'Best full mock /400' }, { key: 'latestMock', label: 'Latest mock /400' },
            ], shown.map(s => ({ ...s, subjectsText: s.subjects.map((x: any) => `${x.name} ${x.mastery ?? '-'}`).join('; ') })))}>⬇ CSV</button>
          </div>

          <Table colSpan={8} empty={shown.length === 0} head={<>
            <th style={S.th}>Student</th><th style={S.th}>Subjects · mastery</th><th style={{ ...S.th, ...S.num }}>XP</th>
            <th style={S.th}>Last studied</th><th style={{ ...S.th, ...S.num }}>Questions</th><th style={{ ...S.th, ...S.num }}>Accuracy</th>
            <th style={{ ...S.th, ...S.num }}>Latest mock</th><th style={S.th}></th>
          </>}>
            {shown.map(s => {
              const d = daysSince(s.lastStudied)
              return (
                <tr key={s.id}>
                  <td style={S.td}><strong>{s.fullName}</strong><br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{s.classArm} · {s.admissionNo ?? '—'}</span></td>
                  <td style={S.td}>
                    {!s.started ? <span style={{ fontSize: '0.78rem', color: '#a0a09a' }}>Not set up</span> : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {s.subjects.map((x: any) => <Pill key={x.id} tone={masteryTone(x.mastery)}>{x.name} {x.mastery === null ? '–' : `${x.mastery}%`}</Pill>)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...S.td, ...S.num }}>{s.xp}{s.streak > 1 ? <span style={{ fontSize: '0.72rem', color: '#d97706' }}> 🔥{s.streak}</span> : null}</td>
                  <td style={{ ...S.td, fontSize: '0.8rem', color: d !== null && d > 7 ? '#b91c1c' : '#1a1a18' }}>{s.lastStudied ? (d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`) : 'Never'}</td>
                  <td style={{ ...S.td, ...S.num }}>{s.questions}</td>
                  <td style={{ ...S.td, ...S.num }}>{s.accuracy === null ? '—' : `${s.accuracy}%`}</td>
                  <td style={{ ...S.td, ...S.num }}>{s.latestMock === null ? '—' : <>{s.latestMock}<span style={{ color: '#a0a09a' }}>/400</span>{s.latestMockMode === 'short' ? <span style={{ fontSize: '0.7rem', color: '#a0a09a' }}> quick</span> : null}</>}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}><button style={S.btnSmall} onClick={() => setOpen(s)}>Details</button></td>
                </tr>
              )
            })}
          </Table>
          <p style={{ fontSize: '0.75rem', color: '#a0a09a' }}>Mastery: green 70%+, amber 50–69%, red below 50%. Mock scores are out of 400, like the UTME; “quick” mocks are shorter practice papers.</p>
        </>
      )}
      {open && <StudentDetail student={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function StudentDetail({ student, onClose }: { student: any; onClose: () => void }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { call(`/jamb/cohort/${student.id}`).then(r => setD(r.ok ? r.data : { error: r.data?.error })) }, [student.id])
  const weakest = (d?.topics ?? []).slice().sort((a: any, b: any) => a.mastery_pct - b.mastery_pct).slice(0, 8)
  return (
    <Modal title={`${student.fullName} · SS3 ${student.classArm ?? ''}`} onClose={onClose} width={720}>
      {!d ? <p style={{ color: '#6b6b65' }}>Loading…</p> : d.error ? <Banner tone="error">Couldn’t load this student.</Banner> : (
        <>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Mock exams</h3>
          {d.mocks.length === 0 ? <p style={{ fontSize: '0.84rem', color: '#6b6b65', marginBottom: '1rem' }}>No mock exams yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
              <thead><tr><th style={S.th}>Date</th><th style={S.th}>Type</th><th style={S.th}>By subject</th><th style={{ ...S.th, ...S.num }}>Score</th></tr></thead>
              <tbody>{d.mocks.map((m: any) => (
                <tr key={m.id}>
                  <td style={S.td}>{fmtDate(m.submitted_at)}</td>
                  <td style={S.td}>{m.mode === 'full' ? 'Full' : 'Quick'}</td>
                  <td style={{ ...S.td, fontSize: '0.78rem' }}>{(m.score_by_subject ?? []).map((x: any) => `${x.name} ${x.score}`).join(' · ')}</td>
                  <td style={{ ...S.td, ...S.num, fontWeight: 600 }}>{m.utme_score}/400</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Weakest topics practised</h3>
          {weakest.length === 0 ? <p style={{ fontSize: '0.84rem', color: '#6b6b65', marginBottom: '1rem' }}>No topic practice yet.</p> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
              {weakest.map((t: any) => <Pill key={t.subject + t.topic} tone={masteryTone(Number(t.mastery_pct))}>{t.subject}: {t.topic} {t.mastery_pct}% ({t.questions_correct}/{t.questions_attempted})</Pill>)}
            </div>
          )}
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Recent practice</h3>
          {d.recent.length === 0 ? <p style={{ fontSize: '0.84rem', color: '#6b6b65' }}>No practice yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>{d.recent.map((q: any, i: number) => (
                <tr key={i}>
                  <td style={{ ...S.td, fontSize: '0.8rem' }}>{fmtDateTime(q.completed_at)}</td>
                  <td style={{ ...S.td, fontSize: '0.8rem' }}>{q.subject}{q.topic ? ` · ${q.topic}` : ''}</td>
                  <td style={{ ...S.td, fontSize: '0.8rem' }}>{q.session_type === 'ai_generated' ? 'AI practice' : q.session_type === 'past_questions' ? 'Past questions' : q.session_type}</td>
                  <td style={{ ...S.td, ...S.num, fontSize: '0.8rem' }}>{q.score}/{q.total_questions}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </Modal>
  )
}
