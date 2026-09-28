'use client'
import { useEffect, useMemo, useState } from 'react'
import { call, S } from './ui'
import type { StudentRef } from './payments'

let cache: StudentRef[] | null = null

export function useFinanceStudents() {
  const [students, setStudents] = useState<StudentRef[]>(cache ?? [])
  const [loading, setLoading] = useState(!cache)
  useEffect(() => {
    if (cache) return
    call('/finance/students').then(r => {
      cache = (r.data.students ?? []).filter((s: any) => s.is_active !== false)
      setStudents(cache as StudentRef[])
    }).finally(() => setLoading(false))
  }, [])
  return { students, loading }
}

// Type-ahead search by name or admission number
export function StudentPicker({ value, onChange }: { value: StudentRef | null; onChange: (s: StudentRef | null) => void }) {
  const { students, loading } = useFinanceStudents()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return students.filter(s =>
      s.full_name.toLowerCase().includes(term) || (s.admission_no ?? '').toLowerCase().includes(term)
    ).slice(0, 12)
  }, [q, students])

  if (value) {
    return (
      <div style={{ ...S.input, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e8f5ee', borderColor: '#a7d7bf' }}>
        <span><strong>{value.full_name}</strong> · {value.admission_no ?? 'no adm. no'} · {value.class_level} {value.class_arm}</span>
        <button onClick={() => { onChange(null); setQ('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0f4a32', fontWeight: 600 }}>Change</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input style={S.input} value={q} placeholder={loading ? 'Loading students…' : 'Type a name or admission number'}
        onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
      {open && matches.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: 8, marginTop: 4, zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 300, overflowY: 'auto' }}>
          {matches.map(s => (
            <div key={s.id} onClick={() => { onChange(s); setOpen(false) }}
              style={{ padding: '0.55rem 0.75rem', cursor: 'pointer', fontSize: '0.86rem', borderBottom: '1px solid #f0f0ee' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f7f7f5')}
              onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
              <strong>{s.full_name}</strong> <span style={{ color: '#6b6b65' }}>· {s.admission_no ?? '—'} · {s.class_level} {s.class_arm}</span>
            </div>
          ))}
        </div>
      )}
      {open && q.trim() && matches.length === 0 && !loading && (
        <p style={{ fontSize: '0.78rem', color: '#a0a09a', marginTop: 4 }}>No student matches “{q}”.</p>
      )}
    </div>
  )
}
