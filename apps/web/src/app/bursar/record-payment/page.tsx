'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { call, money, S, Banner, Field, PageHeader, TermPicker, useTerms, useFinanceAccess, AccessBanner } from '@/components/finance/ui'
import { PaymentForm, ReceiptCard, PaymentHistory, type ReceiptData, type StudentRef } from '@/components/finance/payments'
import { StudentPicker } from '@/components/finance/students'

export default function RecordPaymentPage() {
  const router = useRouter()
  const t = useTerms()
  const { access, readOnly } = useFinanceAccess()
  const [student, setStudent] = useState<StudentRef | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [balance, setBalance] = useState<any>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => { checkAuth(router, 'bursar') }, [])

  async function loadStudent() {
    if (!student?.class_level || !t.termId) { setItems([]); setBalance(null); return }
    const q = `termId=${t.termId}&classLevel=${encodeURIComponent(student.class_level)}`
    const [s, l] = await Promise.all([
      call(`/fees/structures?${q}`),
      call(`/fees/ledger?${q}${student.class_arm ? `&classArm=${encodeURIComponent(student.class_arm)}` : ''}`),
    ])
    setItems(s.data.structures ?? [])
    setBalance((l.data.ledger ?? []).find((r: any) => r.studentId === student.id) ?? null)
  }
  useEffect(() => { loadStudent() }, [student?.id, t.termId])

  return (
    <div style={S.page}>
      <PageHeader title="Record Payment" subtitle="Cash, bank transfer, POS or cheque received at the school. Paystack payments are recorded automatically." />
      <AccessBanner access={access} />
      {receipt && <ReceiptCard receipt={receipt} onClose={() => setReceipt(null)} />}

      <div style={S.card}>
        <TermPicker t={t} />
        <div style={{ marginTop: '1rem' }}>
          <Field label="Student"><StudentPicker value={student} onChange={s => { setStudent(s); setReceipt(null) }} /></Field>
        </div>
      </div>

      {student && balance && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            ['Term bill', money(balance.totalFees)], ['Paid', money(balance.totalPaid)],
            ['Waived', money(balance.totalWaived ?? 0)], ['Balance', money(balance.balance)],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 10, padding: '0.75rem 1rem' }}>
              <p style={{ fontSize: '0.7rem', color: '#6b6b65', textTransform: 'uppercase', fontWeight: 600 }}>{k}</p>
              <p style={{ fontSize: '1.05rem', fontWeight: 700, color: k === 'Balance' && balance.balance > 0 ? '#b91c1c' : '#1a1a18' }}>{v}</p>
            </div>
          ))}
        </div>
      )}

      {student && !readOnly && (
        <div style={S.card}>
          <PaymentForm key={`${student.id}-${historyKey}`} student={student} termId={t.termId} feeItems={items}
            balances={balance ? Object.fromEntries(balance.feeDetails.map((f: any) => [f.feeId, f.balance])) : undefined}
            onDone={r => { setReceipt(r); setHistoryKey(k => k + 1); loadStudent(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        </div>
      )}
      {student && readOnly && access && <Banner tone="info">You can view this student's payments but can't record new ones.</Banner>}

      {student && (
        <div style={S.card}>
          <p style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Payments this term</p>
          <PaymentHistory key={historyKey} student={student} termId={t.termId} canWrite={!readOnly} onChanged={loadStudent} />
        </div>
      )}
    </div>
  )
}
