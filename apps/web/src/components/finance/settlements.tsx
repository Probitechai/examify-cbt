'use client'
// A school's view of its online fee payments: what came in, fees, and what Probitechai owes it
import { useEffect, useState } from 'react'
import { call, money, fmtDate, daysAgo, today, S, Banner, Table, PageHeader, DateRange, Stat, StatGrid } from './ui'

export function SchoolSettlements() {
  const [from, setFrom] = useState(daysAgo(90))
  const [to, setTo] = useState(today())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    call(`/settlements/mine?from=${from}&to=${to}`).then(r => {
      setLoading(false)
      if (!r.ok) { setError(r.data?.message ?? 'Could not load settlements.'); return }
      setError(''); setData(r.data)
    })
  }, [from, to])

  const s = data?.summary
  const direct = s?.paymentPreference === 'direct'
  return (
    <div style={S.page}>
      <PageHeader title="Online Fee Settlements" subtitle="Fees parents paid online through Paystack, the charges on them, and what Probitechai has paid to the school." />
      {error && <Banner tone="error">{error}</Banner>}
      {s && (
        <Banner tone="info">
          {direct
            ? <>Online payments currently go <strong>straight to your school’s bank account</strong>. Paystack deducts its charge and Examify’s {s.platformFeePercent}% and pays you the rest.</>
            : <>Online payments currently go <strong>through Probitechai</strong>. Probitechai pays the school what’s due (after Paystack’s charge and Examify’s {s.platformFeePercent}%) and records each transfer here.</>}
          {data.mode === 'test' && <> <strong>Paystack is still in test mode, so these are test payments.</strong></>}
        </Banner>
      )}
      <div style={S.card}><DateRange from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      {s && (
        <StatGrid>
          <Stat label="Paid online" value={money(s.collected)} hint={`${s.payments} payment${s.payments === 1 ? '' : 's'}${s.reversedAmount > 0 ? ` · ${money(s.reversedAmount)} reversed` : ''}`} />
          <Stat label="Paystack charges" value={money(s.paystackFees)} hint={s.hasEstimates ? 'Some estimated' : undefined} />
          <Stat label="Examify fee" value={money(s.platformFees)} hint={`Current rate ${s.platformFeePercent}%`} />
          <Stat label="Paid to you directly" value={money(s.paidDirectly)} hint="By Paystack, in this period" />
          <Stat label="Due from Probitechai" value={money(s.balanceDue)} hint={`All time: ${money(s.owedAllTime)} due, ${money(s.paidOut)} paid`} tone={s.balanceDue > 0 ? 'warning' : 'default'} />
        </StatGrid>
      )}

      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.5rem 0 0.75rem' }}>Payments</h2>
      <Table colSpan={7} loading={loading} empty={!data?.collections?.length} head={<>
        <th style={S.th}>Date</th><th style={S.th}>Paid for</th><th style={S.th}>Receipt</th><th style={S.th}>Went to</th>
        <th style={{ ...S.th, ...S.num }}>Amount</th><th style={{ ...S.th, ...S.num }}>Charges</th><th style={{ ...S.th, ...S.num }}>School gets</th>
      </>}>
        {(data?.collections ?? []).map((c: any) => (
          <tr key={c.id} style={{ opacity: c.reversed ? 0.55 : 1 }}>
            <td style={S.td}>{fmtDate(c.collected_at)}</td>
            <td style={S.td}>{c.source === 'admission_fee' ? `${c.applicant_name ?? 'Applicant'} · acceptance fee` : `${c.student_name ?? ''}${c.fee_name ? ' · ' + c.fee_name : ''}`}{c.reversed && <span style={{ color: '#b91c1c' }}> · reversed</span>}</td>
            <td style={S.td}>{c.receipt_number ?? '—'}</td>
            <td style={S.td}>{c.routed_via === 'direct' ? 'Your bank' : 'Probitechai'}</td>
            <td style={{ ...S.td, ...S.num }}>{money(c.amount)}</td>
            <td style={{ ...S.td, ...S.num }}>{money(Number(c.paystack_fee) + Number(c.platform_fee))}{c.fee_estimated ? ' *' : ''}</td>
            <td style={{ ...S.td, ...S.num }}>{money(c.school_share)}</td>
          </tr>
        ))}
      </Table>

      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.5rem 0 0.75rem' }}>Transfers from Probitechai</h2>
      <Table colSpan={4} loading={loading} empty={!data?.payouts?.length} head={<>
        <th style={S.th}>Date paid</th><th style={S.th}>Bank reference</th><th style={S.th}>Note</th><th style={{ ...S.th, ...S.num }}>Amount</th>
      </>}>
        {(data?.payouts ?? []).map((p: any) => (
          <tr key={p.id} style={{ opacity: p.voided_at ? 0.55 : 1 }}>
            <td style={S.td}>{fmtDate(p.paid_on)}</td>
            <td style={S.td}>{p.bank_reference}</td>
            <td style={S.td}>{p.note}{p.voided_at && <span style={{ color: '#b91c1c' }}> · cancelled: {p.void_reason}</span>}</td>
            <td style={{ ...S.td, ...S.num, textDecoration: p.voided_at ? 'line-through' : 'none' }}>{money(p.amount)}</td>
          </tr>
        ))}
      </Table>
      <p style={{ fontSize: '0.75rem', color: '#a0a09a' }}>Charges = Paystack’s processing fee plus Examify’s fee. * Paystack didn’t report its fee for this payment, so it’s estimated. Questions about a transfer? Contact Examify support with the bank reference.</p>
    </div>
  )
}
