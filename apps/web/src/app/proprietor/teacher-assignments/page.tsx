'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { CLASS_LEVELS } from '@/lib/classLevels'

const API = process.env.NEXT_PUBLIC_API_URL

export default function ProprietorTeacherAssignmentsPage() {
  const router = useRouter()
  const [view, setView] = useState<'teacher' | 'class'>('teacher')
  const [teachers, setTeachers] = useState<any[]>([])
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedClass, setSelectedClass] = useState('SS2')
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => {
    apiFetch(`${API}/users`).then(r => r.json()).then(d => {
      const t = (d.users ?? []).filter((u: any) => u.role === 'teacher')
      setTeachers(t)
      setSelectedTeacher(prev => prev || (t[0]?.id ?? ''))
    }).catch(console.error)
  }, [])
  useEffect(() => {
    if (view === 'teacher' && selectedTeacher) load(`teacherId=${selectedTeacher}`)
    if (view === 'class' && selectedClass) load(`classLevel=${selectedClass}`)
  }, [view, selectedTeacher, selectedClass])

  function load(query: string) {
    setLoading(true)
    apiFetch(`${API}/teacher-assignments?${query}`).then(r => r.json()).then(d => setAssignments(d.assignments ?? [])).catch(console.error).finally(() => setLoading(false))
  }

  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 800 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Teacher Assignments</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of who teaches what, and where.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['teacher', 'class'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1.5px solid #e5e5e0', background: view === v ? '#1a6b4a' : 'white', color: view === v ? 'white' : '#6b6b65', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>
            {v === 'teacher' ? 'By Teacher' : 'By Class'}
          </button>
        ))}
      </div>

      {view === 'teacher' ? (
        <select style={{ ...sel, marginBottom: '1.25rem', width: '100%' }} value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)}>
          {teachers.length === 0 && <option value="">No teachers found</option>}
          {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      ) : (
        <select style={{ ...sel, marginBottom: '1.25rem', width: '100%' }} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
          {CLASS_LEVELS.map((c: string) => <option key={c}>{c}</option>)}
        </select>
      )}

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: view === 'teacher' ? '1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
          {view === 'teacher' ? <><span>Class level</span><span>Arm</span><span>Subject</span></> : <><span>Arm</span><span>Subject</span><span>Teacher</span></>}
        </div>
        {loading ? (
          <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: '#6b6b65' }}>Loading…</p>
        ) : assignments.length === 0 ? (
          <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: '#6b6b65' }}>No assignments found.</p>
        ) : assignments.map((a: any) => (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', fontSize: '0.875rem', alignItems: 'center' }}>
            {view === 'teacher' ? (
              <><span>{a.class_level}</span><span>{a.class_arm || 'All arms'}</span><span>{a.subject}</span></>
            ) : (
              <><span>{a.class_arm || 'All arms'}</span><span>{a.subject}</span><span>{a.teacher_name}</span></>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}