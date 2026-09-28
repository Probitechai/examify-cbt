'use client'
import { useEffect, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { useClassLevels, useDefaultClass } from '@/lib/classLevels'
import { CLASS_ARMS } from '@/lib/classArms'
import {
  call, money, today, downloadCsv, S, Pill, Field, Table, PageHeader, TermPicker, Modal,
  useTerms, useFinanceAccess, AccessBanner,
} from '@/components/finance/ui'
import { PaymentForm, ReceiptCard, PaymentHistory, type ReceiptData } from '@/components/finance/payments'

export default function LedgerPage() {
  const CLASS_LEVELS = useClassLevels()
  const router = useRouter()
  const t = useTerms()
  const { access, readOnly } = useFinanceAccess()
  const [classLevel, setClassLevel] = useState('JSS1')
  useDefaultClass(CLASS_LEVELS, classLevel, setClassLevel)
  const [classArm, setClassArm] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [structures, setStructures] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [paying, setPaying] = useState<any | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [filter, setFilter] = useState<'all' | 'owing' | 'paid'>('all')

  useEffect(() => { checkAuth(router, 'bursar') }, [])

  async function load() {
    if (!t.termId) return
    setLoading(true)
    const q = new URLSearchParams({ termId: t.termId, classLevel })
    if (classArm) q.set('classArm', classArm)
    const r = await call(`/fees/ledger?${q}`)
    setRows(r.data.ledger ?? []); setStructures(r.data.structures ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [t.termId, classLevel, classArm])

  const shown = rows.filter(r => filter === 'all' || (filter === 'owing' ? r.balance > 0 : r.balance <= 0))
  const totals = rows.reduce((a, r) => ({ paid: a.paid + r.totalPaid, waived: a.waived + (r.totalWaived ?? 0), balance: a.balance + Math.max(r.balance, 0) }), { paid: 0, waived: 0, balance: 0 })

  return (
    <div style={S.page}>
      <PageHeader title="Fee Ledger" subtitle="Every student in a class: billed, paid, waived and owing. Click a row for their receipts." />
      <AccessBanner access={access} />
      {receipt && <ReceiptCard receipt={receipt} onClose={() => setReceipt(null)} />}
      <div style={S.card}>
        <TermPicker t={t} extra={<>
          <Field label="Class">
            <select style={S.input} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Arm">
            <select style={S.input} value={classArm} onChange={e => setClassArm(e.target.value)}>
              <option value="">All arms</option>
              {CLASS_ARMS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Show">
            <select style={S.input} value={filter} onChange={e => setFilter(e.target.value as any)}>
              <option value="all">Everyone</option><option value="owing">Owing only</option><option value="paid">Fully paid</option>
            </select>
          </Field>
        </>} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ fontSize: '0.86rem', color: '#3a3a36' }}>
          Bill per student <strong>{money(structures.reduce((s, f) => s + Number(f.amount), 0))}</strong> · Paid <strong>{money(totals.paid)}</strong> · Waived <strong>{money(totals.waived)}</strong> · Owing <strong style={{ color: '#b91c1c' }}>{money(totals.balance)}</strong>
        </p>
        <button style={S.btnGhost} onClick={() => downloadCsv(`ledger-${classLevel}${classArm ? '-' + classArm : ''}-${today()}.csv`, [
          { key: 'studentName', label: 'Student' }, { key: 'admissionNo', label: 'Admission No' }, { key: 'classArm', label: 'Arm' },
          { key: 'totalFees', label: 'Fees' }, { key: 'totalPaid', label: 'Paid' }, { key: 'totalWaived', label: 'Waived' }, { key: 'balance', label: 'Balance' },
        ], shown)}>⬇ CSV</button>
      </div>
      <Table colSpan={7} loading={loading} empty={shown.length === 0} head={<>
        <th style={S.th}>Student</th><th style={S.th}>Arm</th><th style={{ ...S.th, ...S.num }}>Fees</th><th style={{ ...S.th, ...S.num }}>Paid</th>
        <th style={{ ...S.th, ...S.num }}>Waived</th><th style={{ ...S.th, ...S.num }}>Balance</th><th style={S.th}></th>
      </>}>
        {shown.map(r => (
          <Fragment key={r.studentId}>
            <tr style={{ cursor: 'pointer', background: open === r.studentId ? '#f7f7f5' : undefined }} onClick={() => setOpen(open === r.studentId ? null : r.studentId)}>
              <td style={S.td}><strong>{r.studentName}</strong><br /><span style={{ fontSize: '0.75rem', color: '#a0a09a' }}>{r.admissionNo}</span></td>
              <td style={S.td}>{r.classArm}</td>
              <td style={{ ...S.td, ...S.num }}>{money(r.totalFees)}</td>
              <td style={{ ...S.td, ...S.num }}>{money(r.totalPaid)}</td>
              <td style={{ ...S.td, ...S.num }}>{money(r.totalWaived ?? 0)}</td>
              <td style={{ ...S.td, ...S.num }}>{r.balance <= 0 ? <Pill tone="success">Paid</Pill> : <span style={{ color: '#b91c1c', fontWeight: 600 }}>{money(r.balance)}</span>}</td>
              <td style={{ ...S.td, textAlign: 'right' }}>
                {!readOnly && <button style={S.btnSmall} onClick={e => { e.stopPropagation(); setPaying(r) }}>+ Payment</button>}
              </td>
            </tr>
            {open === r.studentId && (
              <tr><td colSpan={7} style={{ ...S.td, background: '#fafaf8', padding: '1rem' }}>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                  {r.feeDetails.map((f: any) => f.enrolled === false
                    ? <span key={f.feeId} style={{ color: '#a0a09a' }}>{f.feeName}: not taking</span>
                    : <span key={f.feeId}>{f.feeName}: <strong>{money(f.paid)}</strong> / {money(f.amount)}</span>
                  )}
                </div>
                <PaymentHistory student={{ id: r.studentId, full_name: r.studentName, admission_no: r.admissionNo, class_level: classLevel, class_arm: r.classArm }}
                  termId={t.termId} canWrite={!readOnly} onChanged={load} />
              </td></tr>
            )}
          </Fragment>
        ))}
      </Table>

      {paying && (
        <Modal title="Record payment" onClose={() => setPaying(null)} width={560}>
          <PaymentForm
            student={{ id: paying.studentId, full_name: paying.studentName, admission_no: paying.admissionNo, class_level: classLevel, class_arm: paying.classArm }}
            termId={t.termId} feeItems={structures}
            balances={Object.fromEntries(paying.feeDetails.map((f: any) => [f.feeId, f.balance]))}
            enrolled={Object.fromEntries(paying.feeDetails.map((f: any) => [f.feeId, f.enrolled !== false]))}
            onCancel={() => setPaying(null)}
            onDone={rc => { setReceipt(rc); setPaying(null); load() }} />
        </Modal>
      )}
    </div>
  )
}
