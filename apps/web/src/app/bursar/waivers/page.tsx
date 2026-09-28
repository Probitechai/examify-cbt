'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { useAuthStore } from '@/hooks/useAuth'
import {
  call, errorText, money, fmtDate, S, Banner, Field, Table, PageHeader, TermPicker, Modal,
  useTerms, useFinanceAccess, AccessBanner,
} from '@/components/finance/ui'
import { StatusPill, type StudentRef } from '@/components/finance/payments'
import { StudentPicker } from '@/components/finance/students'

const KINDS: Record<string, string> = {
  scholarship: 'Scholarship', sibling: 'Sibling discount', staff_child: "Staff child", discount: 'Discount', waiver: 'Waiver',
}

export default function WaiversPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const t = useTerms()
  const { access, readOnly } = useFinanceAccess()
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [student, setStudent] = useState<StudentRef | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState({ kind: 'scholarship', amount: '', feeStructureId: '', reason: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { checkAuth(router, 'bursar') }, [])

  async function load() {
    if (!t.termId) return
    setLoading(true)
    const q = new URLSearchParams({ termId: t.termId })
    if (status) q.set('status', status)
    const r = await call(`/finance/waivers?${q}`)
    setRows(r.data.waivers ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [t.termId, status])

  useEffect(() => {
    if (!student?.class_level || !t.termId) { setItems([]); return }
    call(`/fees/structures?termId=${t.termId}&classLevel=${encodeURIComponent(student.class_level)}`).then(r => setItems(r.data.structures ?? []))
  }, [student?.id, t.termId])

  async function create() {
    const amount = parseFloat(form.amount)
    if (!student) { setMsg({ tone: 'error', text: 'Choose a student.' }); return }
    if (!amount || amount <= 0) { setMsg({ tone: 'error', text: 'Enter the waiver amount.' }); return }
    if (form.reason.trim().length < 5) { setMsg({ tone: 'error', text: 'Give a short reason.' }); return }
    setSaving(true)
    const r = await call('/finance/waivers', {
      method: 'POST',
      body: JSON.stringify({
        studentId: student.id, termId: t.termId, kind: form.kind, amount, reason: form.reason.trim(),
        feeStructureId: form.feeStructureId || undefined,
      }),
    })
    setSaving(false)
    if (!r.ok) {
      let text = errorText(r.data)
      if (r.data.error === 'EXCEEDS_BILL') text = `This would take ${student.full_name}'s total waivers to ${money(r.data.cumulative)}, more than their term bill of ${money(r.data.bill)}.`
      if (r.data.error === 'FEE_ITEM_NOT_IN_STUDENT_BILL') text = "That fee item isn't on this student's bill for the term."
      setMsg({ tone: 'error', text }); return
    }
    if (r.data.needsApproval) {
      setMsg({ tone: 'warning', text: `Sent to the Proprietor for approval: ${student.full_name}'s total waivers this term are now above the approval threshold. It won't reduce their balance until approved.` })
    } else {
      setMsg({ tone: 'success', text: `${money(amount)} ${KINDS[form.kind].toLowerCase()} applied to ${student.full_name}.` })
    }
    setShowAdd(false); setStudent(null); setForm({ kind: 'scholarship', amount: '', feeStructureId: '', reason: '' })
    load()
  }

  async function cancel(w: any) {
    if (!confirm(`Withdraw this pending ${KINDS[w.kind].toLowerCase()} for ${w.student_name}?`)) return
    const r = await call(`/finance/waivers/${w.id}/cancel`, { method: 'POST' })
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    load()
  }

  return (
    <div style={S.page}>
      <PageHeader title="Discounts & Waivers" subtitle="Anything that reduces what a student owes. Large amounts go to the Proprietor for approval."
        actions={!readOnly && <button style={S.btn} onClick={() => { setShowAdd(true); setMsg(null) }}>+ New waiver</button>} />
      <AccessBanner access={access} />
      <div style={S.card}>
        <TermPicker t={t} extra={
          <Field label="Status">
            <select style={S.input} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option>
              <option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
            </select>
          </Field>
        } />
      </div>
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <Table colSpan={7} loading={loading} empty={rows.length === 0} head={<>
        <th style={S.th}>Date</th><th style={S.th}>Student</th><th style={S.th}>Type</th><th style={{ ...S.th, ...S.num }}>Amount</th>
        <th style={S.th}>Reason</th><th style={S.th}>Status</th><th style={S.th}></th>
      </>}>
        {rows.map(w => (
          <tr key={w.id}>
            <td style={S.td}>{fmtDate(w.created_at)}</td>
            <td style={S.td}><strong>{w.student_name}</strong><br /><span style={{ fontSize: '0.75rem', color: '#a0a09a' }}>{w.class_level} {w.class_arm} · {w.admission_no}</span></td>
            <td style={S.td}>{KINDS[w.kind] ?? w.kind}{w.fee_name ? <><br /><span style={{ fontSize: '0.75rem', color: '#a0a09a' }}>on {w.fee_name}</span></> : null}</td>
            <td style={{ ...S.td, ...S.num }}>{money(w.amount)}</td>
            <td style={{ ...S.td, fontSize: '0.8rem' }}>{w.reason}{w.decision_note ? <><br /><span style={{ color: '#6b6b65' }}>Note: {w.decision_note}</span></> : null}</td>
            <td style={S.td}><StatusPill status={w.status} />{w.decided_by_name ? <><br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>by {w.decided_by_name}</span></> : null}</td>
            <td style={{ ...S.td, textAlign: 'right' }}>
              {!readOnly && w.status === 'pending' && w.requested_by === user?.id && <button style={S.btnSmall} onClick={() => cancel(w)}>Withdraw</button>}
            </td>
          </tr>
        ))}
      </Table>

      {showAdd && (
        <Modal title="New discount or waiver" onClose={() => setShowAdd(false)} width={520}>
          <div style={{ display: 'grid', gap: '0.875rem' }}>
            <Field label="Student"><StudentPicker value={student} onChange={setStudent} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <Field label="Type">
                <select style={S.input} value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                  {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Amount (₦)"><input style={S.input} type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
            </div>
            <Field label="Against" hint="Leave as the whole bill unless the discount is for one item only.">
              <select style={S.input} value={form.feeStructureId} onChange={e => setForm({ ...form, feeStructureId: e.target.value })}>
                <option value="">Whole term bill</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name} — {money(i.amount)}</option>)}
              </select>
            </Field>
            <Field label="Reason"><textarea style={{ ...S.input, minHeight: 70 }} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Second child in school; 2025 merit scholarship" /></Field>
            {msg?.tone === 'error' && <Banner tone="error">{msg.text}</Banner>}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={{ ...S.btn, opacity: saving ? 0.6 : 1 }} disabled={saving || !t.termId} onClick={create}>{saving ? 'Saving…' : 'Submit'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
