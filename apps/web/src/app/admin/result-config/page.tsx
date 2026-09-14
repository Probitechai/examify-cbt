'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface GradeBoundary {
  grade: string
  min: number
  max: number
  remark: string
}

const API = process.env.NEXT_PUBLIC_API_URL

export default function ResultConfigPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [caWeight, setCaWeight] = useState(40)
  const [examWeight, setExamWeight] = useState(60)
  const [showPosition, setShowPosition] = useState(true)
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>([])

  useEffect(() => { checkAuth(router, 'school_admin') }, [])
  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    setLoading(true)
    try {
      const res = await apiFetch(`${API}/result-config`)
      const data = await res.json()
      const c = data.config
      setCaWeight(c.caWeight)
      setExamWeight(c.examWeight)
      setShowPosition(c.showPosition)
      setBoundaries(c.gradeBoundaries ?? [])
    } catch {
      setError('Failed to load grading configuration')
    } finally {
      setLoading(false)
    }
  }

  function updateBoundary(index: number, field: keyof GradeBoundary, value: string | number) {
    setBoundaries(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b))
  }

  function addBoundary() {
    setBoundaries(prev => [...prev, { grade: '', min: 0, max: 0, remark: '' }])
  }

  function removeBoundary(index: number) {
    setBoundaries(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    setError('')
    if (caWeight + examWeight !== 100) {
      setError('CA weight and Exam weight must add up to 100')
      return
    }
    if (boundaries.some(b => !b.grade.trim() || !b.remark.trim())) {
      setError('Every grade boundary needs a grade letter and a remark')
      return
    }

    setSaving(true)
    try {
      const res = await apiFetch(`${API}/result-config`, {
        method: 'POST',
        body: JSON.stringify({
          caWeight,
          examWeight,
          showPosition,
          gradeBoundaries: boundaries.map(b => ({
            grade: b.grade.trim(),
            min: Number(b.min),
            max: Number(b.max),
            remark: b.remark.trim(),
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to save grading configuration')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = { padding: '0.625rem 0.875rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
  const lbl = { fontSize: '0.825rem', fontWeight: 500 as const, color: '#1a1a18', display: 'block' as const, marginBottom: '0.4rem' }

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', fontFamily: 'system-ui' }}>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Loading grading configuration…</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 800 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Result Configuration</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Set CA/Exam weighting, grade boundaries and class position settings for your school.</p>
      </div>

      {/* CA / Exam weighting */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>CA / Exam Weighting</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
          <div>
            <label style={lbl}>Continuous Assessment (CA) weight (%)</label>
            <input style={inp} type="number" min={0} max={100} value={caWeight}
              onChange={e => setCaWeight(Number(e.target.value))} />
          </div>
          <div>
            <label style={lbl}>Exam weight (%)</label>
            <input style={inp} type="number" min={0} max={100} value={examWeight}
              onChange={e => setExamWeight(Number(e.target.value))} />
          </div>
        </div>
        <p style={{ fontSize: '0.78rem', color: caWeight + examWeight === 100 ? '#6b6b65' : '#dc2626' }}>
          Total: {caWeight + examWeight}% {caWeight + examWeight !== 100 && '— must equal 100%'}
        </p>
      </div>

      {/* Class position */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.75rem' }}>Class Position</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" id="showPosition" checked={showPosition}
            onChange={e => setShowPosition(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
          <label htmlFor="showPosition" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>
            Show class position on report cards
          </label>
        </div>
      </div>

      {/* Grade boundaries */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>Grade Boundaries</h2>
          <button onClick={addBoundary}
            style={{ padding: '0.4rem 0.85rem', background: '#e8f5ee', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer' }}>
            + Add grade
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr 1fr 2fr 0.5fr', gap: '0.5rem', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a' }}>GRADE</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a' }}>MIN %</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a' }}>MAX %</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a' }}>REMARK</span>
          <span></span>
        </div>

        {boundaries.map((b, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr 1fr 2fr 0.5fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input style={inp} value={b.grade} onChange={e => updateBoundary(i, 'grade', e.target.value)} placeholder="A" />
            <input style={inp} type="number" value={b.min} onChange={e => updateBoundary(i, 'min', Number(e.target.value))} />
            <input style={inp} type="number" value={b.max} onChange={e => updateBoundary(i, 'max', Number(e.target.value))} />
            <input style={inp} value={b.remark} onChange={e => updateBoundary(i, 'remark', e.target.value)} placeholder="Excellent" />
            <button onClick={() => removeBoundary(i)}
              style={{ padding: '0.4rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.75rem', color: '#dc2626', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        ))}

        {boundaries.length === 0 && (
          <p style={{ fontSize: '0.825rem', color: '#6b6b65', textAlign: 'center', padding: '1rem 0' }}>
            No grade boundaries yet. Click "+ Add grade" to create one.
          </p>
        )}
      </div>

      {error && <p style={{ fontSize: '0.825rem', color: '#dc2626', marginBottom: '1rem' }}>{error}</p>}
      {saved && <p style={{ fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500, marginBottom: '1rem' }}>✅ Grading configuration saved successfully!</p>}

      <button onClick={handleSave} disabled={saving}
        style={{ padding: '0.75rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving…' : 'Save grading configuration'}
      </button>
    </div>
  )
}
