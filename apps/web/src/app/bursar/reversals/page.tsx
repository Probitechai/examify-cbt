'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { call, money, fmtDate, METHOD_LABELS, S, Banner, Field, Table, PageHeader } from '@/components/finance/ui'
import { StatusPill } from '@/components/finance/payments'

export default function ReversalsPage() {
  const router = useRouter()
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { checkAuth(router, 'bursar') }, [])
  useEffect(() => {
    setLoading(true)
    call(`/finance/reversals${status ? `?status=${status}` : ''}`).then(r => setRows(r.data.reversals ?? [])).finally(() => setLoading(false))
  }, [status])

  return (
    <div style={S.page}>
      <PageHeader title="Reversals" subtitle="Receipts that were cancelled, or are waiting for the Proprietor to approve cancelling them." />
      <Banner tone="info">To request a reversal, open the student in <strong>Fee Ledger</strong> or <strong>Record Payment</strong> and choose “Request reversal” on the receipt. Every reversal needs the Proprietor's approval.</Banner>
      <div style={{ ...S.card, maxWidth: 260 }}>
        <Field label="Status">
          <select style={S.input} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        </Field>
      </div>
      <Table colSpan={7} loading={loading} empty={rows.length === 0} head={<>
        <th style={S.th}>Requested</th><th style={S.th}>Receipt</th><th style={S.th}>Student</th><th style={{ ...S.th, ...S.num }}>Amount</th>
        <th style={S.th}>Reason</th><th style={S.th}>Status</th><th style={S.th}>Decided</th>
      </>}>
        {rows.map(r => (
          <tr key={r.id}>
            <td style={S.td}>{fmtDate(r.created_at)}<br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>by {r.requested_by_name}</span></td>
            <td style={S.td}>{r.receipt_number}<br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{METHOD_LABELS[r.payment_method] ?? r.payment_method} · {fmtDate(r.payment_date)}</span></td>
            <td style={S.td}>{r.student_name}<br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{r.class_level} {r.class_arm}</span></td>
            <td style={{ ...S.td, ...S.num }}>{money(r.amount_paid)}</td>
            <td style={{ ...S.td, fontSize: '0.8rem' }}>{r.reason}{r.decision_note ? <><br /><span style={{ color: '#6b6b65' }}>Note: {r.decision_note}</span></> : null}</td>
            <td style={S.td}><StatusPill status={r.status} /></td>
            <td style={{ ...S.td, fontSize: '0.8rem' }}>{r.decided_by_name ? <>{r.decided_by_name}<br /><span style={{ color: '#a0a09a' }}>{fmtDate(r.decided_at)}</span></> : '—'}</td>
          </tr>
        ))}
      </Table>
    </div>
  )
}
