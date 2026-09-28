'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { call, errorText, money, fmtDate, METHOD_LABELS, S, Banner, Pill, Field, PageHeader, Modal } from '@/components/finance/ui'

const KINDS: Record<string, string> = {
  scholarship: 'Scholarship', sibling: 'Sibling discount', staff_child: 'Staff child', discount: 'Discount', waiver: 'Waiver',
}

export default function ApprovalsPage() {
  const router = useRouter()
  const [data, setData] = useState<{ reversals: any[]; waivers: any[] }>({ reversals: [], waivers: [] })
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [deciding, setDeciding] = useState<{ kind: 'reversal' | 'waiver'; item: any; decision: 'approve' | 'reject' } | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])

  async function load() {
    setLoading(true)
    const r = await call('/finance/approvals')
    setData({ reversals: r.data.reversals ?? [], waivers: r.data.waivers ?? [] })
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function decide() {
    if (!deciding) return
    if (deciding.decision === 'reject' && !note.trim()) { setMsg({ tone: 'error', text: 'Add a short note explaining the rejection.' }); return }
    setSaving(true)
    const path = deciding.kind === 'reversal' ? `/finance/reversals/${deciding.item.id}/decide` : `/finance/waivers/${deciding.item.id}/decide`
    const r = await call(path, { method: 'POST', body: JSON.stringify({ decision: deciding.decision, note: note.trim() || undefined }) })
    setSaving(false)
    if (!r.ok) {
      let text = errorText(r.data)
      if (r.data.error === 'OWN_REQUEST') text = "You can't approve a request you made yourself."
      if (r.data.error === 'ALREADY_DECIDED') text = 'This request has already been decided.'
      setMsg({ tone: 'error', text }); setDeciding(null); load(); return
    }
    const verb = deciding.decision === 'approve' ? 'Approved' : 'Rejected'
    setMsg({ tone: 'success', text: `${verb}: ${deciding.kind === 'reversal' ? `reversal of ${deciding.item.receipt_number}` : `${KINDS[deciding.item.kind] ?? 'waiver'} for ${deciding.item.student_name}`}.` })
    setDeciding(null); setNote('')
    load()
  }

  const card = (children: React.ReactNode, key: string) => (
    <div key={key} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>{children}</div>
  )
  const actions = (kind: 'reversal' | 'waiver', item: any) => item.isOwnRequest
    ? <Pill>Your own request</Pill>
    : (
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button style={{ ...S.btnGhost, color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => { setDeciding({ kind, item, decision: 'reject' }); setNote(''); setMsg(null) }}>Reject</button>
        <button style={S.btn} onClick={() => { setDeciding({ kind, item, decision: 'approve' }); setNote(''); setMsg(null) }}>Approve</button>
      </div>
    )

  const total = data.reversals.length + data.waivers.length

  return (
    <div style={S.page}>
      <PageHeader title="Approvals" subtitle="Reversals of recorded payments and waivers above your threshold wait here for you." />
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      {loading ? <p style={{ color: '#6b6b65' }}>Loading…</p> : total === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', color: '#6b6b65', padding: '2.5rem' }}>✅ Nothing waiting for approval.</div>
      ) : (
        <>
          {data.reversals.length > 0 && <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Payment reversals ({data.reversals.length})</h3>}
          {data.reversals.map(r => card(<>
            <div style={{ flex: 1, minWidth: 260 }}>
              <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Cancel receipt {r.receipt_number} · {money(r.amount_paid)}</p>
              <p style={{ fontSize: '0.84rem', color: '#3a3a36' }}>{[r.student_name, `${r.class_level ?? ''} ${r.class_arm ?? ''}`.trim(), r.admission_no].filter(Boolean).join(' · ')}</p>
              <p style={{ fontSize: '0.8rem', color: '#6b6b65', marginTop: '0.25rem' }}>{METHOD_LABELS[r.payment_method] ?? r.payment_method} payment on {fmtDate(r.payment_date)}</p>
              <p style={{ fontSize: '0.84rem', marginTop: '0.5rem', background: '#f7f7f5', padding: '0.5rem 0.75rem', borderRadius: 8 }}>“{r.reason}”</p>
              <p style={{ fontSize: '0.75rem', color: '#a0a09a', marginTop: '0.4rem' }}>Requested by {r.requested_by_name} ({r.requested_by_role}) on {fmtDate(r.created_at)}</p>
            </div>
            {actions('reversal', r)}
          </>, r.id))}

          {data.waivers.length > 0 && <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '1rem 0 0.75rem' }}>Waivers above threshold ({data.waivers.length})</h3>}
          {data.waivers.map(w => card(<>
            <div style={{ flex: 1, minWidth: 260 }}>
              <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{KINDS[w.kind] ?? w.kind} · {money(w.amount)}</p>
              <p style={{ fontSize: '0.84rem', color: '#3a3a36' }}>{[w.student_name, `${w.class_level ?? ''} ${w.class_arm ?? ''}`.trim(), w.admission_no].filter(Boolean).join(' · ')}</p>
              <p style={{ fontSize: '0.8rem', color: '#6b6b65', marginTop: '0.25rem' }}>Already approved for this student this term: {money(w.already_approved_this_term)}</p>
              <p style={{ fontSize: '0.84rem', marginTop: '0.5rem', background: '#f7f7f5', padding: '0.5rem 0.75rem', borderRadius: 8 }}>“{w.reason}”</p>
              <p style={{ fontSize: '0.75rem', color: '#a0a09a', marginTop: '0.4rem' }}>Requested by {w.requested_by_name} ({w.requested_by_role}) on {fmtDate(w.created_at)}</p>
            </div>
            {actions('waiver', w)}
          </>, w.id))}
        </>
      )}

      {deciding && (
        <Modal title={`${deciding.decision === 'approve' ? 'Approve' : 'Reject'} ${deciding.kind}`} onClose={() => setDeciding(null)}>
          <p style={{ fontSize: '0.86rem', color: '#3a3a36', marginBottom: '0.75rem' }}>
            {deciding.kind === 'reversal'
              ? <>Receipt <strong>{deciding.item.receipt_number}</strong> ({money(deciding.item.amount_paid)}) for {deciding.item.student_name}. {deciding.decision === 'approve' ? 'The amount will be added back to their balance. The receipt stays on record, marked reversed.' : ''}</>
              : <>{KINDS[deciding.item.kind]} of <strong>{money(deciding.item.amount)}</strong> for {deciding.item.student_name}. {deciding.decision === 'approve' ? "It will reduce the student's balance immediately." : ''}</>}
          </p>
          <Field label={deciding.decision === 'reject' ? 'Reason for rejecting (required)' : 'Note (optional)'}>
            <textarea style={{ ...S.input, minHeight: 70 }} value={note} onChange={e => setNote(e.target.value)} />
          </Field>
          {msg?.tone === 'error' && <div style={{ marginTop: '0.75rem' }}><Banner tone="error">{msg.text}</Banner></div>}
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button style={S.btnGhost} onClick={() => setDeciding(null)}>Cancel</button>
            <button style={{ ...S.btn, background: deciding.decision === 'approve' ? '#1a6b4a' : '#b91c1c', opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={decide}>
              {saving ? 'Saving…' : deciding.decision === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
