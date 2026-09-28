'use client'
// Which sections the school runs: Nursery, Primary, Secondary. Drives every class list.
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/auth'
import { SECTIONS, SECTION_LEVELS, SECTION_NAMES, refreshClassLevels, type Section } from '@/lib/classLevels'

const API = process.env.NEXT_PUBLIC_API_URL

export function SchoolSections() {
  const [saved, setSaved] = useState<Section[]>([])
  const [picked, setPicked] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    apiFetch(`${API}/schools/settings`).then(r => r.json()).then(d => {
      const s: Section[] = Array.isArray(d.sections) && d.sections.length ? d.sections : ['secondary']
      setSaved(s); setPicked(s)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  function toggle(s: Section) {
    setMsg(null)
    setPicked(p => (p.includes(s) ? p.filter(x => x !== s) : SECTIONS.filter(x => x === s || p.includes(x))))
  }

  async function save() {
    if (!picked.length) { setMsg({ ok: false, text: 'Choose at least one section.' }); return }
    setSaving(true); setMsg(null)
    try {
      const res = await apiFetch(`${API}/schools/settings`, { method: 'PATCH', body: JSON.stringify({ sections: picked }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: d.message ?? 'Could not save the sections.' }); return }
      setSaved(picked)
      refreshClassLevels()
      setMsg({ ok: true, text: 'Saved. Class lists across Examify now show these sections.' })
    } finally { setSaving(false) }
  }

  const changed = picked.join() !== saved.join()
  return (
    <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e5e5e0', padding: '1.5rem', marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Sections</h2>
      <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1rem' }}>
        The parts of the school you run. Only these classes appear in class lists, fees, results, attendance and admissions.
      </p>
      {loading ? <p style={{ fontSize: '0.825rem', color: '#a0a09a' }}>Loading…</p> : (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {SECTIONS.map(s => (
            <label key={s} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', padding: '0.75rem 0.9rem', border: `1.5px solid ${picked.includes(s) ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '10px', cursor: 'pointer', background: picked.includes(s) ? '#f0faf4' : 'white' }}>
              <input type="checkbox" checked={picked.includes(s)} onChange={() => toggle(s)} style={{ width: 16, height: 16, marginTop: 2, accentColor: '#1a6b4a' }} />
              <span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18' }}>{SECTION_NAMES[s]}</span>
                <span style={{ display: 'block', fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.15rem' }}>{SECTION_LEVELS[s].join(' · ')}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {msg && (
        <p style={{ fontSize: '0.825rem', marginTop: '0.875rem', padding: '0.6rem 0.75rem', borderRadius: '8px', color: msg.ok ? '#0f4a32' : '#b91c1c', background: msg.ok ? '#e8f5ee' : '#fef2f2' }}>{msg.text}</p>
      )}
      <button onClick={save} disabled={saving || !changed || loading}
        style={{ marginTop: '1rem', padding: '0.6rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: changed ? 'pointer' : 'default', opacity: saving || !changed ? 0.5 : 1 }}>
        {saving ? 'Saving…' : 'Save sections'}
      </button>
      <p style={{ fontSize: '0.75rem', color: '#a0a09a', marginTop: '0.6rem' }}>A section can’t be removed while it still has active students.</p>
    </div>
  )
}
