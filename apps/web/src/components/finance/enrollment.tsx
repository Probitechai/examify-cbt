'use client'
// Choose which students take an optional fee item (bus, hostel, clubs…)
import { useEffect, useMemo, useState } from 'react'
import { call, errorText, money, S, Banner, Modal } from './ui'

export function EnrollmentModal({ structureId, onClose, onSaved }: {
  structureId: string
  onClose: () => void
  onSaved?: () => void
}) {
  const [item, setItem] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'success' | 'warning'; text: string } | null>(null)

  useEffect(() => {
    call(`/fees/structures/${structureId}/enrollments`).then(r => {
      if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
      setItem(r.data.structure)
      setStudents(r.data.students ?? [])
      setPicked(new Set((r.data.students ?? []).filter((s: any) => s.enrolled).map((s: any) => s.id)))
    })
  }, [structureId])

  const arms = useMemo(() => Array.from(new Set(students.map(s => s.class_arm ?? '—'))), [students])
  const shown = students.filter(s => !search.trim() || s.full_name.toLowerCase().includes(search.toLowerCase()) || (s.admission_no ?? '').toLowerCase().includes(search.toLowerCase()))
  const locked = (s: any) => Number(s.paid) > 0   // paid towards it: can't be removed

  function toggle(id: string) {
    setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function setArm(arm: string, on: boolean) {
    setPicked(prev => {
      const n = new Set(prev)
      for (const s of students) if ((s.class_arm ?? '—') === arm && (on || !locked(s))) { if (on) n.add(s.id); else n.delete(s.id) }
      return n
    })
  }

  async function save() {
    setSaving(true); setMsg(null)
    const r = await call(`/fees/structures/${structureId}/enrollments`, { method: 'PUT', body: JSON.stringify({ studentIds: [...picked] }) })
    setSaving(false)
    if (!r.ok) { setMsg({ tone: 'error', text: errorText(r.data) }); return }
    const kept = r.data.keptWithPayments?.length ?? 0
    setMsg({
      tone: kept ? 'warning' : 'success',
      text: `Saved: ${r.data.added} added, ${r.data.removed} removed.${kept ? ` ${kept} student(s) stayed on because they have already paid towards it.` : ''}`,
    })
    onSaved?.()
  }

  const count = picked.size
  return (
    <Modal title={item ? `Who takes “${item.name}”?` : 'Loading…'} onClose={onClose} width={620}>
      {item && (
        <>
          <p style={{ fontSize: '0.84rem', color: '#3a3a36', marginBottom: '0.75rem' }}>
            {item.class_level} · {money(item.amount)} each. Only ticked students are billed for this item.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
            <input style={{ ...S.input, maxWidth: 240 }} placeholder="Search name or admission no." value={search} onChange={e => setSearch(e.target.value)} />
            {arms.map(a => (
              <span key={a} style={{ display: 'inline-flex', gap: '0.25rem' }}>
                <button style={S.btnSmall} onClick={() => setArm(a, true)}>All {a}</button>
                <button style={S.btnSmall} onClick={() => setArm(a, false)}>None {a}</button>
              </span>
            ))}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e5e5e0', borderRadius: 10 }}>
            {shown.length === 0 && <p style={{ padding: '1rem', color: '#6b6b65', fontSize: '0.84rem' }}>No students.</p>}
            {shown.map(s => (
              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0ee', fontSize: '0.86rem', cursor: locked(s) ? 'default' : 'pointer' }}>
                <input type="checkbox" checked={picked.has(s.id)} disabled={locked(s) && picked.has(s.id)} onChange={() => toggle(s.id)} />
                <span style={{ flex: 1 }}><strong>{s.full_name}</strong> <span style={{ color: '#a0a09a' }}>· {s.admission_no ?? '—'} · {s.class_arm}</span></span>
                {locked(s) && <span style={{ fontSize: '0.72rem', color: '#0f4a32' }}>paid {money(s.paid)}</span>}
              </label>
            ))}
          </div>
          <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.5rem' }}>
            {count} of {students.length} students ticked. Students who have paid towards this item can't be removed.
          </p>
        </>
      )}
      {msg && <div style={{ marginTop: '0.75rem' }}><Banner tone={msg.tone}>{msg.text}</Banner></div>}
      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button style={S.btnGhost} onClick={onClose}>Close</button>
        {item && <button style={{ ...S.btn, opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>}
      </div>
    </Modal>
  )
}
