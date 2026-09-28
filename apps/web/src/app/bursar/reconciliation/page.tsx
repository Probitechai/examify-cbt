'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { call, errorText, money, fmtDateTime, today, daysAgo, S, Banner, Table, PageHeader, DateRange, Stat, StatGrid } from '@/components/finance/ui'

export default function ReconciliationPage() {
  const router = useRouter()
  const [from, setFrom] = useState(daysAgo(30))
  const [to, setTo] = useState(today())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)

  useEffect(() => { checkAuth(router, 'bursar') }, [])

  async function load() {
    setLoading(true)
    const r = await call(`/finance/reconciliation?from=${from}&to=${to}`)
    setLoading(false)
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    setData(r.data)
  }
  useEffect(() => { load() }, [from, to])

  async function reverify(reference: string) {
    setVerifying(reference)
    const r = await call(`/paystack/fees/verify?reference=${encodeURIComponent(reference)}`)
    setVerifying(null)
    if (r.ok && r.data.success) {
      setMsg({ tone: 'success', text: `Settled — receipt ${r.data.receiptNo} issued.` })
      load()
    } else {
      setMsg({ tone: 'error', text: r.data.message ?? errorText(r.data, 'Paystack has not confirmed this payment.') })
    }
  }

  const missed = data?.missedWebhooks ?? []
  const mismatch = data?.amountMismatch ?? []
  const stale = data?.stalePending ?? []

  return (
    <div style={S.page}>
      <PageHeader title="Paystack Reconciliation" subtitle="Compares what Paystack received with what Examify has on receipt." />
      <div style={S.card}><DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      {data?.paystackError && <Banner tone="error">Couldn't reach Paystack: {data.paystackError}</Banner>}
      {loading && <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1rem' }}>Checking with Paystack…</p>}
      {data && (
        <StatGrid>
          <Stat label="Paystack fee payments" value={data.paystackCount} />
          <Stat label="Missing receipts" value={missed.length} tone={missed.length ? 'danger' : 'default'} hint="Paid on Paystack, not settled here" />
          <Stat label="Amount differences" value={mismatch.length} tone={mismatch.length ? 'warning' : 'default'} />
          <Stat label="Abandoned checkouts" value={stale.length} hint="Never counted as paid" />
        </StatGrid>
      )}

      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0.5rem 0 0.75rem' }}>Paid on Paystack, no receipt in Examify</h3>
      <Table colSpan={6} loading={loading} empty={missed.length === 0} head={<>
        <th style={S.th}>Paid at</th><th style={S.th}>Reference</th><th style={S.th}>Student</th><th style={S.th}>Fee</th><th style={{ ...S.th, ...S.num }}>Amount</th><th style={S.th}></th>
      </>}>
        {missed.map((m: any) => (
          <tr key={m.reference}>
            <td style={S.td}>{fmtDateTime(m.paidAt)}</td>
            <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.78rem' }}>{m.reference}</td>
            <td style={S.td}>{m.student ?? '—'}</td>
            <td style={S.td}>{m.fee ?? '—'}</td>
            <td style={{ ...S.td, ...S.num }}>{money(m.amount)}</td>
            <td style={{ ...S.td, textAlign: 'right' }}>
              {m.localStatus === 'missing'
                ? <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>No record here — contact support</span>
                : <button style={S.btnSmall} disabled={verifying === m.reference} onClick={() => reverify(m.reference)}>{verifying === m.reference ? 'Checking…' : 'Re-verify'}</button>}
            </td>
          </tr>
        ))}
      </Table>

      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0.5rem 0 0.75rem' }}>Amount on receipt differs from Paystack</h3>
      <Table colSpan={4} loading={loading} empty={mismatch.length === 0} head={<>
        <th style={S.th}>Receipt</th><th style={S.th}>Reference</th><th style={{ ...S.th, ...S.num }}>Paystack</th><th style={{ ...S.th, ...S.num }}>Examify</th>
      </>}>
        {mismatch.map((m: any) => (
          <tr key={m.reference}>
            <td style={S.td}>{m.receipt}</td>
            <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.78rem' }}>{m.reference}</td>
            <td style={{ ...S.td, ...S.num }}>{money(m.paystack)}</td>
            <td style={{ ...S.td, ...S.num }}>{money(m.examify)}</td>
          </tr>
        ))}
      </Table>

      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0.5rem 0 0.75rem' }}>Abandoned checkouts (older than 1 hour)</h3>
      <Table colSpan={4} loading={loading} empty={stale.length === 0} head={<>
        <th style={S.th}>Started</th><th style={S.th}>Reference</th><th style={S.th}>Student</th><th style={{ ...S.th, ...S.num }}>Amount</th>
      </>}>
        {stale.map((s: any) => (
          <tr key={s.paystack_reference}>
            <td style={S.td}>{fmtDateTime(s.created_at)}</td>
            <td style={{ ...S.td, fontFamily: 'monospace', fontSize: '0.78rem' }}>{s.paystack_reference}</td>
            <td style={S.td}>{s.student_name}</td>
            <td style={{ ...S.td, ...S.num }}>{money(s.amount_paid)}</td>
          </tr>
        ))}
      </Table>
    </div>
  )
}
