'use client'
// School analytics (Premium), shared by the School Admin and Proprietor portals.
// All figures are worked out on the server (GET /analytics/school) so the page
// is one request, however many exams or students the school has.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/auth'
import { useClassLevels } from '@/lib/classLevels'

type Num = number | null
type Data = {
  term: { id: string; label: string } | null
  previousTerm: { id: string; label: string } | null
  terms: { id: string; label: string; isActive: boolean }[]
  headline: { students: number; studentsWithResults: number; averageScore: Num; passRate: Num; attendanceRate: Num;
    expected: number; collected: number; waived: number; outstanding: number; collectionRate: Num }
  previous: { averageScore: Num; passRate: Num; attendanceRate: Num; collectionRate: Num } | null
  classes: { classLevel: string; students: number; averageScore: Num; passRate: Num; attendanceRate: Num;
    expected: number; collected: number; outstanding: number; collectionRate: Num }[]
  subjects: { subject: string; results: number; averageScore: Num; passRate: Num; highest: Num; lowest: Num }[]
  trend: { termId: string; label: string; short: string; averageScore: Num; passRate: Num; attendanceRate: Num; collectionRate: Num }[]
  students: Record<'top' | 'improved' | 'declined' | 'attention', {
    id: string; name: string; classLevel: string; classArm: string | null; average: Num; previous: Num;
    change: Num; attendanceRate: Num; failed: number }[]>
  empty?: boolean
}

const API = process.env.NEXT_PUBLIC_API_URL
const INK = '#1a1a18', INK2 = '#6b6b65', MUTED = '#a0a09a', LINE = '#e5e5e0', SURFACE = 'white'
const BRAND = '#1a6b4a', BRAND_SOFT = '#d6ece0'
const GOOD = '#166534', BAD = '#b91c1c'
const naira = (n: number) => '₦' + Math.round(n).toLocaleString('en-NG')
const show = (v: Num, unit = '') => (v == null ? '—' : `${v}${unit}`)

const card = { background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 14, padding: '1.25rem' }
const h2 = { fontSize: '1rem', fontWeight: 600, color: INK, margin: '0 0 0.25rem' }
const sub = { fontSize: '0.8rem', color: INK2, margin: '0 0 1rem' }
const th = { textAlign: 'left' as const, fontSize: '0.7rem', fontWeight: 600, color: MUTED, textTransform: 'uppercase' as const, letterSpacing: '0.05em', padding: '0.5rem 0.75rem', borderBottom: `1px solid ${LINE}` }
const td = { fontSize: '0.85rem', color: INK, padding: '0.6rem 0.75rem', borderBottom: `1px solid #f0f0ec`, fontVariantNumeric: 'tabular-nums' as const }

function Change({ now, before, unit, label }: { now: Num; before: Num | undefined; unit: string; label: string }) {
  if (now == null || before == null) return <span style={{ fontSize: '0.75rem', color: MUTED }}>no {label} to compare</span>
  const d = Math.round((now - before) * 10) / 10
  if (d === 0) return <span style={{ fontSize: '0.75rem', color: INK2 }}>same as {label}</span>
  const up = d > 0
  return <span style={{ fontSize: '0.75rem', color: up ? GOOD : BAD, fontWeight: 600 }}>
    {up ? '▲' : '▼'} {Math.abs(d)}{unit === '%' ? ' points' : ''} <span style={{ color: INK2, fontWeight: 400 }}>vs {label}</span></span>
}

function Tile({ label, value, note }: { label: string; value: string; note?: React.ReactNode }) {
  return (
    <div style={{ ...card, padding: '1rem 1.1rem' }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 600, color: INK2, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '1.75rem', fontWeight: 700, color: INK, margin: '0.35rem 0 0.25rem', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <div style={{ minHeight: '1rem' }}>{note}</div>
    </div>
  )
}

/** One measure over the last terms: a 2px line with markers and a hover tooltip */
function TrendChart({ title, points, unit }: { title: string; points: { label: string; short: string; v: Num }[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 320, H = 150, L = 34, R = 12, T = 12, B = 26
  const vals = points.map(p => p.v).filter((v): v is number => v != null)
  const max = 100, min = 0
  const x = (i: number) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1))
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B)
  const seg: string[] = []
  points.forEach((p, i) => { if (p.v != null) seg.push(`${seg.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`) })
  const last = [...points].reverse().find(p => p.v != null)
  return (
    <div style={{ ...card, padding: '1rem' }}>
      <p style={{ ...h2, fontSize: '0.875rem' }}>{title}</p>
      <p style={{ fontSize: '1.25rem', fontWeight: 700, color: INK, margin: '0 0 0.25rem', fontVariantNumeric: 'tabular-nums' }}>{last ? `${last.v}${unit}` : '—'}</p>
      {vals.length === 0 ? <p style={{ fontSize: '0.8rem', color: MUTED, height: H, display: 'flex', alignItems: 'center' }}>No figures yet.</p> : (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title} by term`} onMouseLeave={() => setHover(null)}>
            {[0, 50, 100].map(g => (
              <g key={g}>
                <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke={LINE} strokeWidth={1} />
                <text x={L - 6} y={y(g) + 3} fontSize={10} textAnchor="end" fill={MUTED}>{g}</text>
              </g>
            ))}
            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" />}
            <path d={seg.join(' ')} fill="none" stroke={BRAND} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => p.v == null ? null : (
              <circle key={i} cx={x(i)} cy={y(p.v)} r={hover === i ? 5 : 4} fill={BRAND} stroke={SURFACE} strokeWidth={2} />
            ))}
            {points.map((p, i) => (
              <text key={'l' + i} x={x(i)} y={H - 8} fontSize={10} fill={MUTED}
                textAnchor={points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}>{p.short}</text>
            ))}
            {points.map((_, i) => (
              <rect key={'h' + i} x={x(i) - (W - L - R) / Math.max(2, points.length) / 2} y={T} width={(W - L - R) / Math.max(2, points.length)} height={H - T - B}
                fill="transparent" onMouseEnter={() => setHover(i)} />
            ))}
          </svg>
          {hover != null && (
            <div style={{ position: 'absolute', top: 0, left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})`,
              background: INK, color: 'white', borderRadius: 6, padding: '0.35rem 0.55rem', fontSize: '0.75rem', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {points[hover].label}: <b>{show(points[hover].v, unit)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** A value 0–100 as a thin bar with the number beside it */
function Bar({ v, unit = '%' }: { v: Num; unit?: string }) {
  if (v == null) return <span style={{ color: MUTED }}>—</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: 120 }} title={`${v}${unit}`}>
      <span style={{ flex: 1, height: 8, background: '#f0f0ec', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.max(0, Math.min(100, v))}%`, background: BRAND, borderRadius: 4 }} />
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 42, textAlign: 'right' }}>{v}{unit}</span>
    </span>
  )
}

const LISTS = [
  { key: 'attention', label: 'Needs attention', note: 'Average below 40, or attending under 75% of school days.' },
  { key: 'top', label: 'Top students', note: 'Highest average across their subjects this term.' },
  { key: 'improved', label: 'Most improved', note: 'Biggest rise in average since last term.' },
  { key: 'declined', label: 'Dropped', note: 'Biggest fall in average since last term.' },
] as const

export default function SchoolAnalytics({ resultsHref }: { resultsHref?: string }) {
  const levels = useClassLevels()
  const [termId, setTermId] = useState('')
  const [classLevel, setClassLevel] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [list, setList] = useState<typeof LISTS[number]['key']>('attention')

  useEffect(() => {
    let on = true
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (termId) p.set('termId', termId)
    if (classLevel) p.set('classLevel', classLevel)
    apiFetch(`${API}/analytics/school?${p}`)
      .then(async r => { const d = await r.json(); if (!on) return; if (!r.ok) { setError(d.message ?? 'Could not load analytics'); return } setData(d); if (!termId && d.term) setTermId(d.term.id) })
      .catch(() => on && setError('Could not load analytics'))
      .finally(() => on && setLoading(false))
    return () => { on = false }
  }, [termId, classLevel])

  const sel = { padding: '0.5rem 0.75rem', border: `1.5px solid ${LINE}`, borderRadius: 8, fontSize: '0.875rem', background: SURFACE, color: INK, fontFamily: 'inherit' }
  const prevLabel = data?.previousTerm ? 'last term' : ''
  const h = data?.headline

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1150 }}>
      <style>{`@media print { .no-print { display: none !important } }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: INK, margin: 0 }}>School Analytics</h1>
          <p style={{ color: INK2, fontSize: '0.875rem', margin: '0.25rem 0 0' }}>Results, attendance and fees for a term, by class and subject, and how they compare with earlier terms.</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select aria-label="Term" style={sel} value={termId} onChange={e => setTermId(e.target.value)}>
            {(data?.terms ?? []).map(t => <option key={t.id} value={t.id}>{t.label}{t.isActive ? ' (current)' : ''}</option>)}
          </select>
          <select aria-label="Class" style={sel} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
            <option value="">All classes</option>
            {levels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <button onClick={() => window.print()} style={{ ...sel, cursor: 'pointer', fontWeight: 600 }}>🖨️ Print</button>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, marginBottom: '1rem', fontSize: '0.875rem', color: BAD }}>{error}</div>}
      {loading && !data && <p style={{ color: INK2 }}>Loading…</p>}
      {data?.empty && <div style={card}><p style={{ margin: 0, color: INK2 }}>Add an academic session and term to see analytics.</p></div>}

      {data && h && !data.empty && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: INK2 }}><b style={{ color: INK }}>{data.term?.label}</b>{classLevel ? ` · ${classLevel}` : ''}
            {' · '}{h.students} student{h.students === 1 ? '' : 's'} enrolled, {h.studentsWithResults} with results</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.875rem' }}>
            <Tile label="Average score" value={show(h.averageScore)} note={<Change now={h.averageScore} before={data.previous?.averageScore ?? undefined} unit="" label={prevLabel || 'last term'} />} />
            <Tile label="Pass rate" value={show(h.passRate, '%')} note={<Change now={h.passRate} before={data.previous?.passRate ?? undefined} unit="%" label={prevLabel || 'last term'} />} />
            <Tile label="Attendance" value={show(h.attendanceRate, '%')} note={<Change now={h.attendanceRate} before={data.previous?.attendanceRate ?? undefined} unit="%" label={prevLabel || 'last term'} />} />
            <Tile label="Fees collected" value={show(h.collectionRate, '%')} note={<span style={{ fontSize: '0.75rem', color: INK2 }}>{naira(h.collected)} of {naira(h.expected - h.waived)} · {naira(h.outstanding)} owed</span>} />
          </div>

          <section>
            <h2 style={h2}>Term by term</h2>
            <p style={sub}>The last {data.trend.length} term{data.trend.length === 1 ? '' : 's'}, oldest first. Hover a point for its figure.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.875rem' }}>
              <TrendChart title="Average score" unit="" points={data.trend.map(t => ({ label: t.label, short: t.short, v: t.averageScore }))} />
              <TrendChart title="Pass rate" unit="%" points={data.trend.map(t => ({ label: t.label, short: t.short, v: t.passRate }))} />
              <TrendChart title="Attendance" unit="%" points={data.trend.map(t => ({ label: t.label, short: t.short, v: t.attendanceRate }))} />
              <TrendChart title="Fees collected" unit="%" points={data.trend.map(t => ({ label: t.label, short: t.short, v: t.collectionRate }))} />
            </div>
          </section>

          <section style={card}>
            <h2 style={h2}>By class</h2>
            <p style={sub}>Pass rate is the share of subject results not graded F.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Class</th><th style={th}>Students</th><th style={th}>Average</th><th style={th}>Pass rate</th>
                  <th style={th}>Attendance</th><th style={th}>Fees collected</th><th style={{ ...th, textAlign: 'right' }}>Owed</th>
                </tr></thead>
                <tbody>
                  {data.classes.length === 0 && <tr><td style={{ ...td, color: INK2 }} colSpan={7}>No classes with students yet.</td></tr>}
                  {data.classes.map(c => (
                    <tr key={c.classLevel}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <button onClick={() => setClassLevel(c.classLevel)} className="no-print" title={`Show ${c.classLevel} only`}
                          style={{ all: 'unset', cursor: 'pointer', color: BRAND, fontWeight: 600 }}>{c.classLevel}</button>
                      </td>
                      <td style={td}>{c.students}</td>
                      <td style={td}>{show(c.averageScore)}</td>
                      <td style={td}><Bar v={c.passRate} /></td>
                      <td style={td}><Bar v={c.attendanceRate} /></td>
                      <td style={td}><Bar v={c.collectionRate} /></td>
                      <td style={{ ...td, textAlign: 'right' }}>{c.outstanding ? naira(c.outstanding) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={card}>
            <h2 style={h2}>By subject</h2>
            <p style={sub}>Highest average first{classLevel ? ` · ${classLevel}` : ', all classes'}.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Subject</th><th style={th}>Results</th><th style={th}>Average</th><th style={th}>Pass rate</th>
                  <th style={th}>Highest</th><th style={th}>Lowest</th>
                </tr></thead>
                <tbody>
                  {data.subjects.length === 0 && <tr><td style={{ ...td, color: INK2 }} colSpan={6}>No results entered for this term yet.</td></tr>}
                  {data.subjects.map(s => (
                    <tr key={s.subject}>
                      <td style={{ ...td, fontWeight: 500 }}>{s.subject}</td>
                      <td style={td}>{s.results}</td>
                      <td style={td}><Bar v={s.averageScore} unit="" /></td>
                      <td style={td}>{show(s.passRate, '%')}</td>
                      <td style={td}>{show(s.highest)}</td>
                      <td style={td}>{show(s.lowest)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={card}>
            <div className="no-print" style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {LISTS.map(l => (
                <button key={l.key} onClick={() => setList(l.key)}
                  style={{ padding: '0.4rem 0.85rem', borderRadius: 20, border: `1.5px solid ${list === l.key ? BRAND : LINE}`, background: list === l.key ? BRAND_SOFT : SURFACE,
                    color: list === l.key ? '#0f4a32' : INK2, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  {l.label} ({data.students[l.key].length})
                </button>
              ))}
            </div>
            <h2 style={h2}>{LISTS.find(l => l.key === list)!.label}</h2>
            <p style={sub}>{LISTS.find(l => l.key === list)!.note}</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={th}>Student</th><th style={th}>Class</th><th style={th}>Average</th><th style={th}>Last term</th>
                  <th style={th}>Change</th><th style={th}>Attendance</th><th style={th}>Subjects failed</th>
                </tr></thead>
                <tbody>
                  {data.students[list].length === 0 && <tr><td style={{ ...td, color: INK2 }} colSpan={7}>
                    {list === 'attention' ? 'No one needs following up. 🎉' : list === 'top' ? 'No results yet.' : data.previousTerm ? 'No one in this list.' : 'There is no earlier term to compare with yet.'}</td></tr>}
                  {data.students[list].map(s => (
                    <tr key={s.id}>
                      <td style={{ ...td, fontWeight: 500 }}>{s.name}</td>
                      <td style={td}>{s.classLevel} {s.classArm ?? ''}</td>
                      <td style={td}>{show(s.average)}</td>
                      <td style={td}>{show(s.previous)}</td>
                      <td style={{ ...td, color: s.change == null ? MUTED : s.change > 0 ? GOOD : s.change < 0 ? BAD : INK2, fontWeight: 600 }}>
                        {s.change == null ? '—' : `${s.change > 0 ? '▲ +' : s.change < 0 ? '▼ ' : ''}${s.change}`}</td>
                      <td style={{ ...td, color: s.attendanceRate != null && s.attendanceRate < 75 ? BAD : INK }}>{show(s.attendanceRate, '%')}</td>
                      <td style={td}>{s.failed || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p style={{ fontSize: '0.75rem', color: MUTED, margin: 0 }}>
            Average score is the mean of subject totals (CA + exam, out of 100). Attendance counts present and late days, and leaves out excused days.
            Fees use the same figures as Fee Management: payments not reversed, less approved waivers.
            {resultsHref && <> CBT exam scores are on <Link href={resultsHref} style={{ color: BRAND }}>Exam Results</Link>.</>}
          </p>
        </div>
      )}
    </div>
  )
}
