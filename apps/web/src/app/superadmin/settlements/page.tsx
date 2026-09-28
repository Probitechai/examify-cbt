'use client'
// Super admin: settlement ledger and platform revenue
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getToken, parseJWT } from '@/lib/auth'

const API = process.env.NEXT_PUBLIC_API_URL
async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' } })
  let data: any = {}
  try { data = await res.json() } catch {}
  return { ok: res.ok, status: res.status, data }
}
const money = (n: any) => '₦' + Number(n ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function csv(name: string, header: string[], rows: any[][]) {
  const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const blob = new Blob(['﻿' + [header, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click()
}

const card = { background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }
const btn = { padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }
const small = { padding: '0.3rem 0.65rem', background: 'white', color: '#1a1a18', border: '1px solid #e5e5e0', borderRadius: 7, fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }
const input = { padding: '0.5rem 0.7rem', border: '1px solid #e5e5e0', borderRadius: 8, fontSize: '0.85rem', width: '100%' }
const th = { textAlign: 'left' as const, padding: '0.55rem 0.7rem', fontSize: '0.66rem', fontWeight: 700, color: '#a0a09a', textTransform: 'uppercase' as const, background: '#f7f7f5', whiteSpace: 'nowrap' as const }
const td = { padding: '0.55rem 0.7rem', fontSize: '0.82rem', borderTop: '1px solid #f0f0ee', verticalAlign: 'top' as const }
const num = { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const, whiteSpace: 'nowrap' as const }

type Period = 'month' | 'last' | 'year' | 'all' | 'custom'
function range(p: Period, from: string, to: string): { from?: string; to?: string } {
  const now = new Date()
  if (p === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }
  if (p === 'last') return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
  if (p === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }
  if (p === 'custom') return { from: from || undefined, to: to || undefined }
  return {}
}

function Modal({ title, onClose, children, width = 560 }: any) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 1rem', zIndex: 50, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, padding: '1.5rem', width: '100%', maxWidth: width }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a18' }}>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#6b6b65' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function SettlementsPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'live' | 'test' | ''>('')
  const [per, setPer] = useState<Period>('month')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [editRate, setEditRate] = useState<{ id: string; value: string; error?: string } | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [payout, setPayout] = useState<any>(null)

  useEffect(() => {
    const p = parseJWT(getToken())
    if (!p || p.role !== 'super_admin') { router.replace('/superadmin/login'); return }
  }, [])

  const q = useMemo(() => {
    const r = range(per, from, to); const s = new URLSearchParams()
    if (mode) s.set('mode', mode); if (r.from) s.set('from', r.from); if (r.to) s.set('to', r.to)
    return s.toString()
  }, [mode, per, from, to])

  async function load() {
    setLoading(true)
    const r = await call(`/superadmin/settlements?${q}`)
    setLoading(false)
    if (r.status === 401 || r.status === 403) { router.replace('/superadmin/login'); return }
    setData(r.data)
    if (!mode) setMode(r.data.mode)
  }
  useEffect(() => { load() }, [q])

  async function openDetail(id: string) {
    const r = await call(`/superadmin/settlements/${id}?${q}`)
    if (r.ok) setDetail(r.data)
  }

  async function saveRate() {
    if (!editRate) return
    const percent = Number(editRate.value)
    const r = await call(`/superadmin/schools/${editRate.id}/platform-fee`, { method: 'PATCH', body: JSON.stringify({ percent }) })
    if (!r.ok) { setEditRate({ ...editRate, error: r.data.message ?? 'Could not save.' }); return }
    setEditRate(null); load()
  }

  const t = data?.totals
  const liveView = data?.mode === 'live'
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '1.5rem' }}>
        <button onClick={() => router.push('/superadmin')} style={{ ...small, marginBottom: '1rem' }}>← Super Admin</button>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a18' }}>Settlements & Revenue</h1>
        <p style={{ fontSize: '0.86rem', color: '#6b6b65', marginBottom: '1.25rem', maxWidth: 820 }}>
          Every online payment parents make, Examify’s share, and what Probitechai owes schools whose fees come through its Paystack account. Schools on direct payment are paid by Paystack automatically.
        </p>

        <div style={{ ...card, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b6b65' }}>PERIOD<br />
            <select style={{ ...input, width: 170 }} value={per} onChange={e => setPer(e.target.value as Period)}>
              <option value="month">This month</option><option value="last">Last month</option>
              <option value="year">This year</option><option value="all">All time</option><option value="custom">Custom…</option>
            </select>
          </label>
          {per === 'custom' && <>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b6b65' }}>FROM<br /><input type="date" style={input} value={from} onChange={e => setFrom(e.target.value)} /></label>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b6b65' }}>TO<br /><input type="date" style={input} value={to} onChange={e => setTo(e.target.value)} /></label>
          </>}
          <div style={{ display: 'flex', border: '1px solid #e5e5e0', borderRadius: 8, overflow: 'hidden' }}>
            {(['live', 'test'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ padding: '0.5rem 1rem', border: 'none', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', background: mode === m ? '#0f4a32' : 'white', color: mode === m ? 'white' : '#6b6b65' }}>
                {m === 'live' ? 'Live payments' : 'Test payments'}
              </button>
            ))}
          </div>
          {data && <span style={{ fontSize: '0.78rem', color: data.currentMode === 'live' ? '#0f4a32' : '#b45309', fontWeight: 600 }}>
            Paystack is in {data.currentMode === 'live' ? 'LIVE' : 'TEST'} mode
          </span>}
          {loading && <span style={{ fontSize: '0.78rem', color: '#a0a09a' }}>Loading…</span>}
        </div>

        {!liveView && data && (
          <p style={{ fontSize: '0.82rem', color: '#92400e', background: '#fffbeb', border: '1px solid #b45309', borderRadius: 10, padding: '0.7rem 0.9rem', marginBottom: '1.25rem' }}>
            You’re looking at test payments. No real money moved; payouts only count against live payments.
          </p>
        )}

        {t && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            {[
              ['Examify revenue', money(t.platformRevenue), `Fee share ${money(t.platformFees)} + subscriptions ${money(t.subscriptions)}`, '#0f4a32'],
              ['Collected online', money(t.collected), `Paystack fees ${money(t.paystackFees)}`, '#1a1a18'],
              ['Owed to schools', money(t.balanceDue), 'All time, after payouts', t.balanceDue > 0 ? '#b45309' : '#1a1a18'],
              ['Paid directly by Paystack', money(t.paidDirectly), 'Schools on direct payment', '#1a1a18'],
            ].map(([label, value, sub, color]) => (
              <div key={label} style={{ ...card, marginBottom: 0 }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#a0a09a', textTransform: 'uppercase' }}>{label}</p>
                <p style={{ fontSize: '1.4rem', fontWeight: 700, color, margin: '0.3rem 0' }}>{value}</p>
                <p style={{ fontSize: '0.74rem', color: '#6b6b65' }}>{sub}</p>
              </div>
            ))}
          </div>
        )}

        {data && (
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700 }}>By school</h2>
              <button style={small} onClick={() => csv(`settlements-${data.mode}.csv`,
                ['School', 'Routing', 'Rate %', 'Payments', 'Collected', 'Paystack fees', 'Examify share', 'Paid directly', 'Owed in period', 'Paid out (all time)', 'Balance due'],
                data.schools.map((s: any) => [s.name, s.paymentPreference, s.platformFeePercent, s.payments, s.collected, s.paystackFees, s.platformFees, s.paidDirectly, s.owedInPeriod, s.paidOut, s.balanceDue]))}>⬇ CSV</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={th}>School</th><th style={th}>Fees go</th><th style={{ ...th, ...num }}>Rate</th><th style={{ ...th, ...num }}>Payments</th>
                <th style={{ ...th, ...num }}>Collected</th><th style={{ ...th, ...num }}>Paystack fees</th><th style={{ ...th, ...num }}>Examify share</th>
                <th style={{ ...th, ...num }}>Paid directly</th><th style={{ ...th, ...num }}>Balance due</th><th style={th}></th>
              </tr></thead>
              <tbody>
                {data.schools.map((s: any) => (
                  <tr key={s.id}>
                    <td style={td}><strong>{s.name}</strong><br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{s.subdomain}</span></td>
                    <td style={td}>{s.paymentPreference === 'direct' ? 'Direct to school' : 'Through Probitechai'}</td>
                    <td style={{ ...td, ...num }}>
                      {editRate?.id === s.id ? (
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <input style={{ ...input, width: 64, padding: '0.25rem 0.4rem' }} type="number" step="0.05" min="0" max="10" value={editRate.value} onChange={e => setEditRate({ ...editRate, value: e.target.value, error: undefined })} />%
                          <button style={small} onClick={saveRate}>Save</button>
                          <button style={small} onClick={() => setEditRate(null)}>✕</button>
                          {editRate.error && <span style={{ color: '#b91c1c', fontSize: '0.7rem' }}>{editRate.error}</span>}
                        </span>
                      ) : (
                        <button style={{ ...small, border: 'none', textDecoration: 'underline' }} title="Change this school’s rate" onClick={() => setEditRate({ id: s.id, value: String(s.platformFeePercent) })}>{s.platformFeePercent}%</button>
                      )}
                    </td>
                    <td style={{ ...td, ...num }}>{s.payments}</td>
                    <td style={{ ...td, ...num }}>{money(s.collected)}{s.reversedAmount > 0 && <><br /><span style={{ fontSize: '0.7rem', color: '#b91c1c' }}>{money(s.reversedAmount)} reversed</span></>}</td>
                    <td style={{ ...td, ...num }}>{money(s.paystackFees)}{s.hasEstimates && <span title="Some Paystack fees were estimated"> *</span>}</td>
                    <td style={{ ...td, ...num, color: '#0f4a32', fontWeight: 600 }}>{money(s.platformFees)}</td>
                    <td style={{ ...td, ...num }}>{money(s.paidDirectly)}</td>
                    <td style={{ ...td, ...num, fontWeight: 700, color: s.balanceDue > 0 ? '#b45309' : s.balanceDue < 0 ? '#b91c1c' : '#1a1a18' }}>{money(s.balanceDue)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button style={small} onClick={() => openDetail(s.id)}>Details</button>{' '}
                      {liveView && s.balanceDue > 0 && <button style={{ ...small, background: '#1a6b4a', color: 'white', border: 'none' }} onClick={() => setPayout({ school: s, amount: String(s.balanceDue), paidOn: iso(new Date()), bankReference: '', note: '' })}>Record payout</button>}
                    </td>
                  </tr>
                ))}
                {data.schools.length === 0 && <tr><td style={td} colSpan={10}>No schools.</td></tr>}
              </tbody>
            </table>
            <p style={{ fontSize: '0.74rem', color: '#a0a09a', padding: '0.75rem 1.25rem' }}>
              Balance due = everything collected for the school through Probitechai (after Paystack’s fee and Examify’s share), minus payouts, for all time. * Paystack didn’t report its fee on some payments, so it was estimated. Click a rate to change it; new rates apply to payments started after the change.
            </p>
          </div>
        )}
      </div>

      {detail && <Detail detail={detail} onClose={() => setDetail(null)} onChanged={async () => { await openDetail(detail.summary.id); load() }} />}

      {payout && (
        <Modal title={`Record payout: ${payout.school.name}`} onClose={() => setPayout(null)} width={460}>
          <p style={{ fontSize: '0.84rem', color: '#3a3a36', marginBottom: '1rem' }}>Balance due: <strong>{money(payout.school.balanceDue)}</strong>. Record the transfer after you’ve made it from the bank.</p>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b6b65' }}>AMOUNT (₦)<input style={input} type="number" min="0" step="0.01" value={payout.amount} onChange={e => setPayout({ ...payout, amount: e.target.value, error: '' })} /></label>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b6b65' }}>DATE PAID<input style={input} type="date" value={payout.paidOn} max={iso(new Date())} onChange={e => setPayout({ ...payout, paidOn: e.target.value, error: '' })} /></label>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b6b65' }}>BANK TRANSFER REFERENCE<input style={input} value={payout.bankReference} onChange={e => setPayout({ ...payout, bankReference: e.target.value, error: '' })} placeholder="e.g. session ID or transfer reference" /></label>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b6b65' }}>NOTE (OPTIONAL)<input style={input} value={payout.note} onChange={e => setPayout({ ...payout, note: e.target.value })} placeholder="e.g. September settlement" /></label>
            {payout.error && <p style={{ fontSize: '0.82rem', color: '#b91c1c', background: '#fef2f2', padding: '0.5rem 0.7rem', borderRadius: 8 }}>{payout.error}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button style={small} onClick={() => setPayout(null)}>Cancel</button>
              <button style={btn} disabled={payout.saving} onClick={async () => {
                setPayout({ ...payout, saving: true })
                const r = await call(`/superadmin/settlements/${payout.school.id}/payouts`, { method: 'POST', body: JSON.stringify({ amount: Number(payout.amount), paidOn: payout.paidOn, bankReference: payout.bankReference, note: payout.note || undefined }) })
                if (!r.ok) { setPayout({ ...payout, saving: false, error: r.data.message ?? 'Could not record the payout.' }); return }
                setPayout(null); load()
              }}>{payout.saving ? 'Saving…' : 'Record payout'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Detail({ detail, onClose, onChanged }: any) {
  const s = detail.summary
  const [voiding, setVoiding] = useState<{ id: string; reason: string; error?: string } | null>(null)
  async function doVoid() {
    if (!voiding) return
    const r = await call(`/superadmin/payouts/${voiding.id}/void`, { method: 'POST', body: JSON.stringify({ reason: voiding.reason }) })
    if (!r.ok) { setVoiding({ ...voiding, error: r.data.message ?? 'Could not void.' }); return }
    setVoiding(null); onChanged()
  }
  const who = (c: any) => c.source === 'admission_fee' ? `${c.applicant_name ?? 'Applicant'} (acceptance fee)` : `${c.student_name ?? ''}${c.fee_name ? ' · ' + c.fee_name : ''}`
  return (
    <Modal title={s.name} onClose={onClose} width={1100}>
      <p style={{ fontSize: '0.84rem', color: '#3a3a36', marginBottom: '1rem' }}>
        Rate {s.platformFeePercent}% · fees currently go {s.paymentPreference === 'direct' ? 'direct to the school' : 'through Probitechai'} ·
        balance due <strong style={{ color: s.balanceDue > 0 ? '#b45309' : '#1a1a18' }}>{money(s.balanceDue)}</strong>
        {detail.mode === 'test' && <span style={{ color: '#b45309' }}> · test payments</span>}
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>Payments ({detail.collections.length})</h3>
        <button style={small} onClick={() => csv(`${s.subdomain}-payments.csv`, ['Date', 'Reference', 'Receipt', 'Paid for', 'Routing', 'Amount', 'Paystack fee', 'Fee estimated', 'Examify share', 'School share', 'Reversed'],
          detail.collections.map((c: any) => [fmtDate(c.collected_at), c.reference, c.receipt_number ?? '', who(c), c.routed_via, c.amount, c.paystack_fee, c.fee_estimated ? 'yes' : '', c.platform_fee, c.school_share, c.reversed ? 'yes' : '']))}>⬇ CSV</button>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #f0f0ee', borderRadius: 10, marginBottom: '1.25rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{['Date', 'Paid for', 'Receipt / ref', 'Went', 'Amount', 'Paystack', 'Examify', 'School'].map((h, i) => <th key={h} style={{ ...th, ...(i >= 4 ? num : {}), position: 'sticky', top: 0 }}>{h}</th>)}</tr></thead>
          <tbody>
            {detail.collections.map((c: any) => (
              <tr key={c.id} style={{ opacity: c.reversed ? 0.55 : 1 }}>
                <td style={td}>{fmtDate(c.collected_at)}</td>
                <td style={td}>{who(c)}{c.reversed && <span style={{ color: '#b91c1c', fontWeight: 600 }}> · reversed</span>}</td>
                <td style={{ ...td, fontSize: '0.74rem' }}>{c.receipt_number ?? ''}<br /><span style={{ color: '#a0a09a' }}>{c.reference}</span></td>
                <td style={td}>{c.routed_via === 'direct' ? 'Direct' : 'Probitechai'}</td>
                <td style={{ ...td, ...num }}>{money(c.amount)}</td>
                <td style={{ ...td, ...num }}>{money(c.paystack_fee)}{c.fee_estimated && ' *'}</td>
                <td style={{ ...td, ...num }}>{money(c.platform_fee)}</td>
                <td style={{ ...td, ...num }}>{money(c.school_share)}</td>
              </tr>
            ))}
            {detail.collections.length === 0 && <tr><td style={td} colSpan={8}>No payments in this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Payouts (all time)</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #f0f0ee' }}>
        <thead><tr>{['Date paid', 'Bank reference', 'Note', 'Amount', ''].map((h, i) => <th key={i} style={{ ...th, ...(i === 3 ? num : {}) }}>{h}</th>)}</tr></thead>
        <tbody>
          {detail.payouts.map((p: any) => (
            <tr key={p.id} style={{ opacity: p.voided_at ? 0.55 : 1 }}>
              <td style={td}>{fmtDate(p.paid_on)}</td>
              <td style={td}>{p.bank_reference}</td>
              <td style={td}>{p.note}{p.voided_at && <span style={{ color: '#b91c1c' }}> · voided: {p.void_reason}</span>}</td>
              <td style={{ ...td, ...num, textDecoration: p.voided_at ? 'line-through' : 'none' }}>{money(p.amount)}</td>
              <td style={td}>
                {!p.voided_at && (voiding?.id === p.id ? (
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input style={{ ...input, width: 200, padding: '0.25rem 0.4rem' }} placeholder="Reason" value={voiding.reason} onChange={e => setVoiding({ ...voiding, reason: e.target.value, error: undefined })} />
                    <button style={small} onClick={doVoid}>Void</button><button style={small} onClick={() => setVoiding(null)}>✕</button>
                    {voiding.error && <span style={{ color: '#b91c1c', fontSize: '0.7rem' }}>{voiding.error}</span>}
                  </span>
                ) : <button style={small} onClick={() => setVoiding({ id: p.id, reason: '' })}>Void</button>)}
              </td>
            </tr>
          ))}
          {detail.payouts.length === 0 && <tr><td style={td} colSpan={5}>No payouts yet.</td></tr>}
        </tbody>
      </table>
    </Modal>
  )
}
