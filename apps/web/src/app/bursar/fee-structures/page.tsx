'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { CLASS_LEVELS } from '@/lib/classLevels'
import {
  call, errorText, money, S, Banner, Pill, Field, Table, PageHeader, TermPicker, Modal,
  useTerms, useFinanceAccess, AccessBanner,
} from '@/components/finance/ui'

export default function FeeStructuresPage() {
  const router = useRouter()
  const t = useTerms()
  const { access, readOnly } = useFinanceAccess()
  const [classLevel, setClassLevel] = useState('')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', amount: '', classLevel: 'JSS1', allClasses: false, mandatory: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => { checkAuth(router, 'bursar') }, [])

  async function load() {
    if (!t.termId) return
    setLoading(true)
    const q = new URLSearchParams({ termId: t.termId })
    if (classLevel) q.set('classLevel', classLevel)
    const r = await call(`/fees/structures?${q}`)
    setRows(r.data.structures ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [t.termId, classLevel])

  async function create() {
    const amount = parseFloat(form.amount)
    if (!form.name.trim() || !amount) { setMsg({ tone: 'error', text: 'Enter a name and an amount.' }); return }
    setSaving(true)
    const r = await call('/fees/structures', {
      method: 'POST',
      body: JSON.stringify({
        termId: t.termId, name: form.name.trim(), amount, isMandatory: form.mandatory,
        applyToAllClasses: form.allClasses, classLevel: form.allClasses ? undefined : form.classLevel,
      }),
    })
    setSaving(false)
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    setMsg({ tone: 'success', text: form.allClasses ? `“${form.name}” added to all classes.` : `“${form.name}” added to ${form.classLevel}.` })
    setShowAdd(false)
    setForm(f => ({ ...f, name: '', amount: '' }))
    load()
  }

  async function remove(row: any) {
    if (!confirm(`Delete “${row.name}” (${row.class_level}, ${money(row.amount)})?`)) return
    const r = await call(`/fees/structures/${row.id}`, { method: 'DELETE' })
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    setMsg({ tone: 'success', text: `Deleted “${row.name}”.` })
    load()
  }

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div style={S.page}>
      <PageHeader title="Fee Structures" subtitle="What each class is billed this term."
        actions={!readOnly && <button style={S.btn} onClick={() => { setShowAdd(true); setMsg(null) }}>+ Add fee item</button>} />
      <AccessBanner access={access} />
      <div style={S.card}>
        <TermPicker t={t} extra={
          <Field label="Class">
            <select style={S.input} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
              <option value="">All classes</option>
              {CLASS_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        } />
      </div>
      {msg && <Banner tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Banner>}
      <Table colSpan={4} loading={loading} empty={rows.length === 0} head={<>
        <th style={S.th}>Class</th><th style={S.th}>Fee item</th><th style={{ ...S.th, ...S.num }}>Amount</th><th style={S.th}></th>
      </>}>
        {rows.map(r => (
          <tr key={r.id}>
            <td style={S.td}>{r.class_level}</td>
            <td style={S.td}>{r.name} {!r.is_mandatory && <Pill>Optional</Pill>}</td>
            <td style={{ ...S.td, ...S.num }}>{money(r.amount)}</td>
            <td style={{ ...S.td, textAlign: 'right' }}>{!readOnly && <button style={S.btnDanger} onClick={() => remove(r)}>Delete</button>}</td>
          </tr>
        ))}
        {classLevel && rows.length > 0 && (
          <tr><td style={{ ...S.td, fontWeight: 700 }} colSpan={2}>Total per {classLevel} student</td><td style={{ ...S.td, ...S.num, fontWeight: 700 }}>{money(total)}</td><td style={S.td}></td></tr>
        )}
      </Table>
      <p style={{ fontSize: '0.78rem', color: '#a0a09a' }}>A fee item that already has payments against it can't be deleted. Add a new item instead.</p>

      {showAdd && (
        <Modal title="Add a fee item" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'grid', gap: '0.875rem' }}>
            <Field label="Name"><input style={S.input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tuition, PTA levy, Bus" /></Field>
            <Field label="Amount (₦)"><input style={S.input} type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
            <label style={{ fontSize: '0.86rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={form.allClasses} onChange={e => setForm({ ...form, allClasses: e.target.checked })} /> Apply to all classes
            </label>
            {!form.allClasses && (
              <Field label="Class">
                <select style={S.input} value={form.classLevel} onChange={e => setForm({ ...form, classLevel: e.target.value })}>
                  {CLASS_LEVELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            )}
            <label style={{ fontSize: '0.86rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" checked={form.mandatory} onChange={e => setForm({ ...form, mandatory: e.target.checked })} /> Mandatory for every student
            </label>
            {msg?.tone === 'error' && <Banner tone="error">{msg.text}</Banner>}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setShowAdd(false)}>Cancel</button>
              <button style={{ ...S.btn, opacity: saving ? 0.6 : 1 }} disabled={saving || !t.termId} onClick={create}>{saving ? 'Saving…' : 'Add'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
