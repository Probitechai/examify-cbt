'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { call, errorText, money, fmtDateTime, S, Banner, Pill, Field, Table, PageHeader } from '@/components/finance/ui'

export default function FinanceAccessPage() {
  const router = useRouter()
  const [admins, setAdmins] = useState<any[]>([])
  const [grants, setGrants] = useState<any[]>([])
  const [threshold, setThreshold] = useState<number | null>(null)
  const [newThreshold, setNewThreshold] = useState('')
  const [form, setForm] = useState({ adminId: '', hours: '24', reason: '' })
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])

  async function load() {
    const [a, g, t] = await Promise.all([call('/proprietor/admins'), call('/proprietor/finance-grants'), call('/proprietor/finance-settings')])
    const active = (a.data.admins ?? []).filter((x: any) => x.is_active)
    setAdmins(active)
    setForm(f => ({ ...f, adminId: f.adminId || active[0]?.id || '' }))
    setGrants(g.data.grants ?? [])
    if (t.ok) { setThreshold(t.data.threshold); setNewThreshold(String(t.data.threshold)) }
  }
  useEffect(() => { load() }, [])

  async function grant() {
    const hours = parseInt(form.hours, 10)
    if (!form.adminId) { setMsg({ tone: 'error', text: 'Choose an admin.' }); return }
    if (!hours || hours < 1 || hours > 72) { setMsg({ tone: 'error', text: 'Access can last between 1 and 72 hours.' }); return }
    if (form.reason.trim().length < 10) { setMsg({ tone: 'error', text: 'Give a reason (at least 10 characters). It is kept in the audit log.' }); return }
    setSaving(true)
    const r = await call('/proprietor/finance-grants', { method: 'POST', body: JSON.stringify({ adminId: form.adminId, hours, reason: form.reason.trim() }) })
    setSaving(false)
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    const name = admins.find(a => a.id === form.adminId)?.full_name
    setMsg({ tone: 'success', text: `${name} can manage fees until ${fmtDateTime(r.data.grant.expires_at)}.` })
    setForm(f => ({ ...f, reason: '' }))
    load()
  }

  async function revoke(g: any) {
    if (!confirm(`End ${g.admin_name}'s fee access now?`)) return
    const r = await call(`/proprietor/finance-grants/${g.id}/revoke`, { method: 'POST' })
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    setMsg({ tone: 'success', text: `${g.admin_name}'s fee access has ended.` })
    load()
  }

  async function saveThreshold() {
    const v = parseFloat(newThreshold)
    if (isNaN(v) || v < 0) { setMsg({ tone: 'error', text: 'Enter a valid amount.' }); return }
    const r = await call('/proprietor/finance-settings', { method: 'PATCH', body: JSON.stringify({ threshold: v }) })
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    setThreshold(v)
    setMsg({ tone: 'success', text: `Approval threshold set to ${money(v)} per student per term.` })
  }

  return (
    <div style={S.page}>
      <PageHeader title="Emergency Access & Threshold" subtitle="Controls that only you, the Proprietor, can change." />
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}

      <div style={S.card}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Waiver approval threshold</h3>
        <p style={{ ...S.sub, marginBottom: '1rem' }}>
          Discounts and waivers are applied straight away while a student's total for the term stays at or below this amount. Anything above comes to you for approval. Payment reversals always come to you, whatever the amount.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 220 }}>
            <Field label="Per student, per term (₦)"><input style={S.input} type="number" min="0" value={newThreshold} onChange={e => setNewThreshold(e.target.value)} /></Field>
          </div>
          <button style={S.btn} disabled={threshold !== null && Number(newThreshold) === threshold} onClick={saveThreshold}>Save</button>
          {threshold !== null && <span style={{ fontSize: '0.8rem', color: '#6b6b65' }}>Currently {money(threshold)}</span>}
        </div>
      </div>

      <div style={S.card}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Give an Admin temporary fee access</h3>
        <p style={{ ...S.sub, marginBottom: '1rem' }}>
          While your school has a Bursar, Admins can only view fees. If the Bursar is away, you can let an Admin record payments for a limited time. It ends automatically, and everything they do is flagged in the audit log.
        </p>
        {admins.length === 0 ? <Banner tone="info">No active Admin accounts.</Banner> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
            <Field label="Admin">
              <select style={S.input} value={form.adminId} onChange={e => setForm({ ...form, adminId: e.target.value })}>
                {admins.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </Field>
            <Field label="For how long">
              <select style={S.input} value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })}>
                <option value="2">2 hours</option><option value="8">8 hours</option><option value="24">24 hours</option>
                <option value="48">48 hours</option><option value="72">72 hours (maximum)</option>
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Reason"><input style={S.input} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Bursar on sick leave during fee week" /></Field>
            </div>
            <div><button style={{ ...S.btn, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={grant}>{saving ? 'Granting…' : 'Grant access'}</button></div>
          </div>
        )}
      </div>

      <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0.5rem 0 0.75rem' }}>Access history</h3>
      <Table colSpan={5} empty={grants.length === 0} head={<>
        <th style={S.th}>Admin</th><th style={S.th}>Reason</th><th style={S.th}>Granted</th><th style={S.th}>Status</th><th style={S.th}></th>
      </>}>
        {grants.map(g => (
          <tr key={g.id}>
            <td style={S.td}>{g.admin_name}<br /><span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{g.admin_email}</span></td>
            <td style={{ ...S.td, fontSize: '0.8rem' }}>{g.reason}</td>
            <td style={{ ...S.td, fontSize: '0.8rem' }}>{fmtDateTime(g.created_at)}</td>
            <td style={S.td}>
              {g.is_active ? <Pill tone="warning">Active until {fmtDateTime(g.expires_at)}</Pill>
                : g.revoked_at ? <Pill>Revoked {fmtDateTime(g.revoked_at)}</Pill>
                : <Pill>Expired {fmtDateTime(g.expires_at)}</Pill>}
            </td>
            <td style={{ ...S.td, textAlign: 'right' }}>{g.is_active && <button style={S.btnDanger} onClick={() => revoke(g)}>End now</button>}</td>
          </tr>
        ))}
      </Table>
    </div>
  )
}
