'use client'
import { useState, useEffect } from 'react'
import { getSubjects, addCustomSubject } from '../lib/subjects'

interface Props {
  value: string
  onChange: (subject: string) => void
  style?: React.CSSProperties
  className?: string
}

export default function SubjectSelector({ value, onChange, style, className }: Props) {
  const [subjects, setSubjects] = useState<string[]>([])
  const [showCustom, setShowCustom] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setSubjects(getSubjects())
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__add_new__') {
      setShowCustom(true)
    } else {
      onChange(val)
    }
  }

  function handleAddCustom() {
    const trimmed = customValue.trim()
    if (!trimmed) { setError('Please enter a subject name'); return }
    if (trimmed.length < 2) { setError('Subject name too short'); return }
    addCustomSubject(trimmed)
    const updated = getSubjects()
    setSubjects(updated)
    onChange(trimmed)
    setCustomValue('')
    setShowCustom(false)
    setError('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleAddCustom() }
    if (e.key === 'Escape') { setShowCustom(false); setCustomValue('') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <select value={showCustom ? '__add_new__' : value} onChange={handleChange} style={style} className={className}>
        {subjects.map(s => <option key={s} value={s}>{s}</option>)}
        <option value="__add_new__">➕ Add new subject…</option>
      </select>
      {showCustom && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <input
              autoFocus
              value={customValue}
              onChange={e => { setCustomValue(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Enter subject name e.g. Civic Education"
              style={{ width: '100%', padding: '0.625rem 0.875rem', background: '#f7f7f5', border: `1.5px solid ${error ? '#dc2626' : '#1a6b4a'}`, borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
            {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>{error}</p>}
          </div>
          <button type="button" onClick={handleAddCustom}
            style={{ padding: '0.625rem 1rem', background: '#1a6b4a', color: 'white', fontSize: '0.825rem', fontWeight: 600, borderRadius: '8px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
            Add
          </button>
          <button type="button" onClick={() => { setShowCustom(false); setCustomValue(''); setError('') }}
            style={{ padding: '0.625rem 0.875rem', background: 'transparent', color: '#6b6b65', fontSize: '0.825rem', border: '1.5px solid #e5e5e0', borderRadius: '8px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
