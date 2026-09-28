'use client'
// Finance reports shared by the Bursar portal and the Proprietor finance pages.
// Pass canWrite={false} for read-only use (Proprietor, Admin while a Bursar is active).
import { useEffect, useState, Fragment } from 'react'
import { useClassLevels } from '@/lib/classLevels'
import {
  call, errorText, money, fmtDate, fmtDateTime, today, daysAgo, downloadCsv, METHOD_LABELS,
  S, Banner, Pill, Stat, StatGrid, Field, Table, TermPicker, DateRange, useTerms,
} from './ui'

// ── Collection summary by class ──────────────────────────────────────────────
export function CollectionSummary() {
  const t = useTerms()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!t.termId) return
    setLoading(true)
    call(`/fees/summary?termId=${t.termId}`).then(r => setRows(r.data.summary ?? [])).finally(() => setLoading(false))
  }, [t.termId])

  const tot = rows.reduce((a, r) => ({
    expected: a.expected + Number(r.total_expected), collected: a.collected + Number(r.total_collected),
    waived: a.waived + Number(r.total_waived ?? 0), outstanding: a.outstanding + Number(r.total_outstanding),
  }), { expected: 0, collected: 0, waived: 0, outstanding: 0 })
  const rate = tot.expected > 0 ? Math.round((tot.collected / tot.expected) * 100) : 0

  return (
    <>
      <div style={S.card}><TermPicker t={t} /></div>
      <StatGrid>
        <Stat label="Expected" value={money(tot.expected)} />
        <Stat label="Collected" value={money(tot.collected)} hint={`${rate}% of expected`} />
        <Stat label="Waived" value={money(tot.waived)} />
        <Stat label="Outstanding" value={money(tot.outstanding)} tone={tot.outstanding > 0 ? 'warning' : 'default'} />
      </StatGrid>
      <Table colSpan={7} loading={loading} empty={rows.length === 0} head={<>
        <th style={S.th}>Class</th><th style={{ ...S.th, ...S.num }}>Students</th><th style={{ ...S.th, ...S.num }}>Fee / student</th>
        <th style={{ ...S.th, ...S.num }}>Expected</th><th style={{ ...S.th, ...S.num }}>Collected</th>
        <th style={{ ...S.th, ...S.num }}>Waived</th><th style={{ ...S.th, ...S.num }}>Outstanding</th>
      </>}>
        {rows.map(r => (
          <tr key={r.class_level}>
            <td style={{ ...S.td, fontWeight: 600 }}>{r.class_level}</td>
            <td style={{ ...S.td, ...S.num }}>{r.student_count}</td>
            <td style={{ ...S.td, ...S.num }}>{money(r.fee_per_student)}</td>
            <td style={{ ...S.td, ...S.num }}>{money(r.total_expected)}</td>
            <td style={{ ...S.td, ...S.num, color: '#0f4a32' }}>{money(r.total_collected)}</td>
            <td style={{ ...S.td, ...S.num }}>{money(r.total_waived ?? 0)}</td>
            <td style={{ ...S.td, ...S.num, color: Number(r.total_outstanding) > 0 ? '#b91c1c' : '#1a1a18' }}>{money(r.total_outstanding)}</td>
          </tr>
        ))}
      </Table>
    </>
  )
}

// ── Debtors ──────────────────────────────────────────────────────────────────
export function Debtors({ canWrite }: { canWrite: boolean }) {
  const CLASS_LEVELS = useClassLevels()
  const t = useTerms()
  const [classLevel, setClassLevel] = useState('')
  const [minBalance, setMinBalance] = useState('0')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [sending, setSending] = useState(false)

  async function load() {
    if (!t.termId) return
    setLoading(true)
    const q = new URLSearchParams({ termId: t.termId, minBalance: minBalance || '0' })
    if (classLevel) q.set('classLevel', classLevel)
    const r = await call(`/finance/debtors?${q}`)
    setRows(r.data.debtors ?? []); setTotal(r.data.totalOutstanding ?? 0)
    setLoading(false)
  }
  useEffect(() => { load() }, [t.termId, classLevel])

  async function sendReminders() {
    if (!classLevel) { setMsg({ tone: 'error', text: 'Choose a class first. Reminders are sent one class at a time.' }); return }
    if (!confirm(`Send an SMS reminder to parents of every ${classLevel} student with a balance?`)) return
    setSending(true)
    const r = await call('/fees/remind-sms', { method: 'POST', body: JSON.stringify({ termId: t.termId, classLevel }) })
    setSending(false)
    setMsg(r.ok ? { tone: 'success', text: r.data.message } : { tone: 'error', text: errorText(r.data) })
  }

  return (
    <>
      <div style={S.card}>
        <TermPicker t={t} extra={<>
          <Field label="Class">
            <select style={S.input} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
              <option value="">All classes</option>
              {CLASS_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Owing more than (₦)">
            <input style={S.input} type="number" min="0" value={minBalance} onChange={e => setMinBalance(e.target.value)} onBlur={load} />
          </Field>
        </>} />
      </div>
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ fontSize: '0.875rem', color: '#3a3a36' }}><strong>{rows.length}</strong> students owe <strong>{money(total)}</strong></p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button style={S.btnGhost} onClick={() => downloadCsv(`debtors-${today()}.csv`, [
            { key: 'student_name', label: 'Student' }, { key: 'admission_no', label: 'Admission No' },
            { key: 'class_level', label: 'Class' }, { key: 'class_arm', label: 'Arm' },
            { key: 'total_fees', label: 'Fees' }, { key: 'total_paid', label: 'Paid' }, { key: 'total_waived', label: 'Waived' },
            { key: 'balance', label: 'Balance' }, { key: 'parent_names', label: 'Parents' }, { key: 'parent_phones', label: 'Phones' },
          ], rows)}>⬇ CSV</button>
          {canWrite && <button style={{ ...S.btn, opacity: sending ? 0.6 : 1 }} disabled={sending} onClick={sendReminders}>📱 SMS reminders</button>}
        </div>
      </div>
      <Table colSpan={7} loading={loading} empty={rows.length === 0} head={<>
        <th style={S.th}>Student</th><th style={S.th}>Class</th><th style={{ ...S.th, ...S.num }}>Fees</th>
        <th style={{ ...S.th, ...S.num }}>Paid</th><th style={{ ...S.th, ...S.num }}>Waived</th>
        <th style={{ ...S.th, ...S.num }}>Balance</th><th style={S.th}>Parent contact</th>
      </>}>
        {rows.map(r => (
          <tr key={r.student_id}>
            <td style={S.td}><strong>{r.student_name}</strong><br /><span style={{ fontSize: '0.75rem', color: '#a0a09a' }}>{r.admission_no}</span></td>
            <td style={S.td}>{r.class_level} {r.class_arm}</td>
            <td style={{ ...S.td, ...S.num }}>{money(r.total_fees)}</td>
            <td style={{ ...S.td, ...S.num }}>{money(r.total_paid)}</td>
            <td style={{ ...S.td, ...S.num }}>{money(r.total_waived)}</td>
            <td style={{ ...S.td, ...S.num, color: '#b91c1c', fontWeight: 600 }}>{money(r.balance)}</td>
            <td style={{ ...S.td, fontSize: '0.78rem' }}>{r.parent_names ?? '—'}<br /><span style={{ color: '#6b6b65' }}>{r.parent_phones ?? ''}</span></td>
          </tr>
        ))}
      </Table>
    </>
  )
}

// ── Cash book ────────────────────────────────────────────────────────────────
export function CashBook() {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [rows, setRows] = useState<any[]>([])
  const [totals, setTotals] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    const r = await call(`/finance/reports/cash-book?from=${from}&to=${to}`)
    setLoading(false)
    if (!r.ok) { setError(errorText(r.data)); return }
    setRows(r.data.rows ?? []); setTotals(r.data.totals)
  }
  useEffect(() => { load() }, [from, to])

  return (
    <>
      <div style={S.card}><DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      {error && <Banner tone="error">{error}</Banner>}
      {totals && (
        <StatGrid>
          <Stat label="Receipts issued" value={money(totals.gross)} hint={`${rows.length} receipts`} />
          <Stat label="Reversed" value={money(totals.reversed)} tone={totals.reversed > 0 ? 'warning' : 'default'} />
          <Stat label="Net collected" value={money(totals.net)} />
          <Stat label="By method" value={<span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
            {Object.entries(totals.byMethod ?? {}).map(([k, v]) => <span key={k} style={{ display: 'block' }}>{METHOD_LABELS[k] ?? k}: {money(v as number)}</span>)}
            {Object.keys(totals.byMethod ?? {}).length === 0 && '—'}
          </span>} />
        </StatGrid>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem', gap: '0.5rem' }}>
        <button style={S.btnGhost} onClick={() => window.print()}>🖨️ Print</button>
        <button style={S.btnGhost} onClick={() => downloadCsv(`cash-book-${from}-to-${to}.csv`, [
          { key: 'payment_date', label: 'Date' }, { key: 'receipt_number', label: 'Receipt' },
          { key: 'student_name', label: 'Student' }, { key: 'admission_no', label: 'Admission No' },
          { key: 'class_level', label: 'Class' }, { key: 'fee_name', label: 'Fee' },
          { key: 'payment_method', label: 'Method' }, { key: 'transfer_reference', label: 'Reference' },
          { key: 'amount_paid', label: 'Amount' }, { key: 'recorded_by_name', label: 'Recorded by' },
          { key: 'is_reversed', label: 'Reversed' },
        ], rows)}>⬇ CSV</button>
      </div>
      <Table colSpan={7} loading={loading} empty={rows.length === 0} head={<>
        <th style={S.th}>Date</th><th style={S.th}>Receipt</th><th style={S.th}>Student</th><th style={S.th}>Fee</th>
        <th style={S.th}>Method / Ref</th><th style={S.th}>Recorded by</th><th style={{ ...S.th, ...S.num }}>Amount</th>
      </>}>
        {rows.map(r => (
          <tr key={r.id} style={{ opacity: r.is_reversed ? 0.55 : 1 }}>
            <td style={S.td}>{fmtDate(r.payment_date)}</td>
            <td style={S.td}>{r.receipt_number} {r.is_reversed && <Pill tone="error">Reversed</Pill>}</td>
            <td style={S.td}>{r.student_name}<br /><span style={{ fontSize: '0.75rem', color: '#a0a09a' }}>{r.class_level} {r.class_arm}</span></td>
            <td style={S.td}>{r.fee_name}</td>
            <td style={S.td}>{METHOD_LABELS[r.payment_method] ?? r.payment_method}<br /><span style={{ fontSize: '0.75rem', color: '#a0a09a' }}>{r.transfer_reference ?? r.paystack_reference ?? ''}</span></td>
            <td style={S.td}>{r.recorded_by_name ?? (r.payment_method === 'paystack' ? 'Paystack' : '—')}</td>
            <td style={{ ...S.td, ...S.num, textDecoration: r.is_reversed ? 'line-through' : 'none' }}>{money(r.amount_paid)}</td>
          </tr>
        ))}
      </Table>
    </>
  )
}

// ── Expected vs collected per fee item ──────────────────────────────────────
export function ByItem() {
  const t = useTerms()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!t.termId) return
    setLoading(true)
    call(`/finance/reports/by-item?termId=${t.termId}`).then(r => setRows(r.data.items ?? [])).finally(() => setLoading(false))
  }, [t.termId])

  return (
    <>
      <div style={S.card}><TermPicker t={t} /></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button style={S.btnGhost} onClick={() => downloadCsv(`fee-items-${today()}.csv`, [
          { key: 'class_level', label: 'Class' }, { key: 'name', label: 'Fee item' }, { key: 'amount', label: 'Amount' },
          { key: 'student_count', label: 'Students' }, { key: 'expected', label: 'Expected' },
          { key: 'collected', label: 'Collected' }, { key: 'payers', label: 'Students paid' },
        ], rows)}>⬇ CSV</button>
      </div>
      <Table colSpan={7} loading={loading} empty={rows.length === 0} head={<>
        <th style={S.th}>Class</th><th style={S.th}>Fee item</th><th style={{ ...S.th, ...S.num }}>Amount</th>
        <th style={{ ...S.th, ...S.num }}>Expected</th><th style={{ ...S.th, ...S.num }}>Collected</th>
        <th style={{ ...S.th, ...S.num }}>Students paid</th><th style={{ ...S.th, ...S.num }}>Rate</th>
      </>}>
        {rows.map(r => {
          const rate = Number(r.expected) > 0 ? Math.round(Number(r.collected) / Number(r.expected) * 100) : 0
          return (
            <tr key={r.id}>
              <td style={S.td}>{r.class_level}</td>
              <td style={S.td}>{r.name} {!r.is_mandatory && <Pill>Optional</Pill>}</td>
              <td style={{ ...S.td, ...S.num }}>{money(r.amount)}</td>
              <td style={{ ...S.td, ...S.num }}>{money(r.expected)}</td>
              <td style={{ ...S.td, ...S.num }}>{money(r.collected)}</td>
              <td style={{ ...S.td, ...S.num }}>{r.payers} / {r.student_count}</td>
              <td style={{ ...S.td, ...S.num }}>{rate}%</td>
            </tr>
          )
        })}
      </Table>
    </>
  )
}

// ── Audit log ────────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, string> = {
  'payment.recorded': 'Recorded payment',
  'payment.paystack_confirmed': 'Paystack payment confirmed',
  'payment.paystack_amount_mismatch': 'Paystack amount differed from bill',
  'structure.created': 'Created fee item',
  'structure.deleted': 'Deleted fee item',
  'waiver.requested': 'Requested waiver',
  'waiver.auto_approved': 'Waiver (within threshold)',
  'waiver.approved': 'Approved waiver',
  'waiver.rejected': 'Rejected waiver',
  'waiver.cancelled': 'Cancelled waiver',
  'reversal.requested': 'Requested reversal',
  'reversal.approved': 'Approved reversal',
  'reversal.rejected': 'Rejected reversal',
  'reminders.sms_sent': 'Sent SMS reminders',
  'bursar.created': 'Created Bursar account',
  'bursar.activated': 'Activated Bursar',
  'bursar.deactivated': 'Deactivated Bursar',
  'bursar.deleted': 'Deleted Bursar',
  'bursar.password_reset': 'Reset Bursar password',
  'grant.created': 'Granted emergency access',
  'grant.revoked': 'Revoked emergency access',
  'settings.threshold_changed': 'Changed approval threshold',
}

function summarise(e: any): string {
  const a = e.after_data ?? {}
  const b = e.before_data ?? {}
  const parts: string[] = []
  if (a.receiptNo) parts.push(a.receiptNo)
  if (a.receipt) parts.push(a.receipt)
  if (a.amountPaid) parts.push(money(a.amountPaid))
  else if (a.amount !== undefined && e.action !== 'settings.threshold_changed') parts.push(money(a.amount))
  if (a.name) parts.push(a.name)
  if (a.classLevel) parts.push(a.classLevel)
  if (a.kind) parts.push(a.kind)
  if (a.hours) parts.push(`${a.hours}h`)
  if (a.threshold !== undefined && e.action === 'settings.threshold_changed') parts.push(`${money(b.threshold)} → ${money(a.threshold)}`)
  if (a.sent !== undefined) parts.push(`${a.sent} sent, ${a.skipped} skipped`)
  if (a.fullName) parts.push(a.fullName)
  if (b.name && e.action === 'structure.deleted') parts.push(`${b.name} (${b.class_level}) ${money(b.amount)}`)
  if (b.fullName && e.action === 'bursar.deleted') parts.push(b.fullName)
  return parts.join(' · ')
}

export function AuditLog({ showActorFilter }: { showActorFilter: boolean }) {
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const q = new URLSearchParams({ from, to })
    if (action) q.set('action', action)
    const r = await call(`/finance/audit-log?${q}`)
    setRows(r.data.entries ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [from, to, action])

  const actors = Array.from(new Map(rows.filter(r => r.actor_id).map(r => [r.actor_id, `${r.actor_name} (${r.actor_role})`])).entries())
  const shown = actor ? rows.filter(r => r.actor_id === actor) : rows

  return (
    <>
      <div style={S.card}>
        <DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} extra={<>
          <Field label="Type">
            <select style={S.input} value={action} onChange={e => setAction(e.target.value)}>
              <option value="">Everything</option>
              <option value="payment">Payments</option>
              <option value="waiver">Waivers</option>
              <option value="reversal">Reversals</option>
              <option value="structure">Fee items</option>
              <option value="grant">Emergency access</option>
              <option value="bursar">Bursar accounts</option>
              <option value="settings">Settings</option>
            </select>
          </Field>
          {showActorFilter && (
            <Field label="Person">
              <select style={S.input} value={actor} onChange={e => setActor(e.target.value)}>
                <option value="">Everyone</option>
                {actors.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </Field>
          )}
        </>} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <button style={S.btnGhost} onClick={() => downloadCsv(`finance-audit-${from}-to-${to}.csv`, [
          { key: 'created_at', label: 'When' }, { key: 'actor_name', label: 'Who' }, { key: 'actor_role', label: 'Role' },
          { key: 'action', label: 'Action' }, { key: 'summary', label: 'Details' }, { key: 'reason', label: 'Reason' },
          { key: 'via_grant', label: 'Emergency access' }, { key: 'ip_address', label: 'IP' },
        ], shown.map(r => ({ ...r, summary: summarise(r) })))}>⬇ CSV</button>
      </div>
      <Table colSpan={5} loading={loading} empty={shown.length === 0} head={<>
        <th style={S.th}>When</th><th style={S.th}>Who</th><th style={S.th}>What</th><th style={S.th}>Details</th><th style={S.th}>Reason</th>
      </>}>
        {shown.map(e => (
          <Fragment key={e.id}>
            <tr onClick={() => setOpen(open === e.id ? null : e.id)} style={{ cursor: 'pointer', background: e.via_grant ? '#fffbeb' : undefined }}>
              <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{fmtDateTime(e.created_at)}</td>
              <td style={S.td}>{e.actor_name ?? (e.actor_role === 'system' ? 'Paystack (system)' : e.actor_role)}<br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{e.actor_role}</span></td>
              <td style={S.td}>{ACTION_LABELS[e.action] ?? e.action} {e.via_grant && <Pill tone="warning">Emergency access</Pill>}</td>
              <td style={{ ...S.td, fontSize: '0.8rem' }}>{summarise(e)}</td>
              <td style={{ ...S.td, fontSize: '0.8rem', color: '#6b6b65' }}>{e.reason ?? ''}</td>
            </tr>
            {open === e.id && (
              <tr><td colSpan={5} style={{ ...S.td, background: '#f7f7f5' }}>
                <pre style={{ fontSize: '0.72rem', whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify({ before: e.before_data, after: e.after_data, ip: e.ip_address }, null, 2)}</pre>
              </td></tr>
            )}
          </Fragment>
        ))}
      </Table>
    </>
  )
}
