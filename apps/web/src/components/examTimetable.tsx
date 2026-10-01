'use client'
// Shared exam timetable display: sittings grouped by day, used by staff,
// students and parents, and laid out for printing.
import type { ReactNode } from 'react'

export interface Sitting {
  id: string
  exam_date: string        // YYYY-MM-DD
  start_time: string       // HH:MM
  end_time: string
  class_level: string
  class_arm: string        // '' = all arms
  subject: string
  paper: string | null
  mode: 'paper' | 'cbt'
  exam_id?: string | null
  exam_title?: string | null
  venue: string | null
  notes: string | null
  invigilator_id?: string | null
  invigilator_name?: string | null
  out_of_sync?: boolean
}

export function fmtDay(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
export function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'pm' : 'am'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}${ap}`
}
export const classLabel = (s: Pick<Sitting, 'class_level' | 'class_arm'>) => s.class_arm ? `${s.class_level} ${s.class_arm}` : `${s.class_level} (all arms)`

/** Hides the menus and buttons when printing, so the timetable prints on its own */
export function PrintStyles() {
  return (
    <style>{`
      @media print {
        aside, nav, .no-print { display: none !important; }
        /* The portal shells reserve a column for the menu; give the page the full width */
        div:has(> aside) { display: block !important; }
        main { overflow: visible !important; width: 100% !important; max-width: none !important; margin: 0 !important; }
        @page { margin: 12mm; }
        html, body, main { background: white !important; }
        .ett-day { break-inside: avoid; }
        .ett-print-only { display: block !important; }
      }
      .ett-print-only { display: none; }
    `}</style>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '0.55rem 0.7rem', fontSize: '0.68rem', fontWeight: 700, color: '#6b6b65', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f7f7f5', borderBottom: '1px solid #e5e5e0', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '0.6rem 0.7rem', fontSize: '0.85rem', color: '#1a1a18', borderTop: '1px solid #f0f0ee', verticalAlign: 'top' }

export function ModeBadge({ mode }: { mode: 'paper' | 'cbt' }) {
  const cbt = mode === 'cbt'
  return (
    <span style={{ display: 'inline-block', fontSize: '0.66rem', fontWeight: 700, padding: '0.12rem 0.45rem', borderRadius: 10, letterSpacing: '0.03em',
      background: cbt ? '#eff6ff' : '#f5f3ff', color: cbt ? '#1e40af' : '#6d28d9' }}>
      {cbt ? 'CBT' : 'PAPER'}
    </span>
  )
}

/**
 * The timetable, one block per day.
 * staff: shows invigilators and CBT sync warnings. hideClass: for a single child's view.
 */
export function ExamTimetableView({ entries, staff = false, hideClass = false, highlightInvigilator, actions, empty }: {
  entries: Sitting[]
  staff?: boolean
  hideClass?: boolean
  highlightInvigilator?: string
  actions?: (s: Sitting) => ReactNode
  empty?: ReactNode
}) {
  if (!entries.length) {
    return <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, padding: '2.5rem', textAlign: 'center', color: '#6b6b65', fontSize: '0.9rem' }}>{empty ?? 'No sittings yet.'}</div>
  }
  const days: [string, Sitting[]][] = []
  for (const e of entries) {
    const last = days[days.length - 1]
    if (last && last[0] === e.exam_date) last[1].push(e); else days.push([e.exam_date, [e]])
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {days.map(([day, list]) => (
        <div key={day} className="ett-day" style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '0.65rem 0.9rem', fontWeight: 700, fontSize: '0.92rem', color: '#0f4a32', background: '#e8f5ee', borderBottom: '1px solid #d5ebdf' }}>{fmtDay(day)}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Time</th>
                  {!hideClass && <th style={th}>Class</th>}
                  <th style={th}>Subject</th>
                  {!hideClass && <th style={th}>Type</th>}
                  {!hideClass && <th style={th}>Venue</th>}
                  {staff && <th style={th}>Invigilator</th>}
                  {actions && <th style={{ ...th, textAlign: 'right' }} className="no-print"></th>}
                </tr>
              </thead>
              <tbody>
                {list.map(s => {
                  const mine = highlightInvigilator && s.invigilator_id === highlightInvigilator
                  return (
                    <tr key={s.id} style={mine ? { background: '#fffbeb' } : undefined}>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', width: hideClass ? '1%' : undefined }}>{fmtTime(s.start_time)} –{hideClass ? <br /> : ' '}{fmtTime(s.end_time)}</td>
                      {!hideClass && <td style={{ ...td, whiteSpace: 'nowrap' }}>{classLabel(s)}</td>}
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{s.subject}</div>
                        {s.paper && <div style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{s.paper}</div>}
                        {hideClass && (
                          <div style={{ fontSize: '0.78rem', color: '#3a3a36', marginTop: '0.25rem', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <ModeBadge mode={s.mode} />{s.venue && <span>📍 {s.venue}</span>}
                          </div>
                        )}
                        {s.notes && <div style={{ fontSize: '0.76rem', color: '#6b6b65', marginTop: '0.15rem' }}>{s.notes}</div>}
                        {staff && s.out_of_sync && (
                          <div className="no-print" style={{ fontSize: '0.74rem', color: '#b45309', marginTop: '0.2rem' }}>
                            ⚠ The CBT exam’s time has changed. Use “Copy in CBT exams” to update this sitting.
                          </div>
                        )}
                      </td>
                      {!hideClass && <td style={td}><ModeBadge mode={s.mode} /></td>}
                      {!hideClass && <td style={td}>{s.venue || <span style={{ color: '#a0a09a' }}>—</span>}</td>}
                      {staff && <td style={td}>{s.invigilator_name || <span style={{ color: '#a0a09a' }}>—</span>}{mine && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#b45309', fontWeight: 700 }}>YOU</span>}</td>}
                      {actions && <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} className="no-print">{actions(s)}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
