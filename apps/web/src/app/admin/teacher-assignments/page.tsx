'use client'
import { getToken, checkAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CLASS_LEVELS } from '@/lib/classLevels'
import { CLASS_ARMS } from '@/lib/classArms'
import { getSubjects } from '@/lib/subjects'

function getSubdomain() {
  if (typeof window === 'undefined') return 'greensprings'
  return window.localStorage.getItem('examify_school') ?? 'greensprings'
}

interface Teacher { id: string; full_name: string }
interface Assignment {
  id: string
  teacher_id: string
  teacher_name: string
  class_level: string
  class_arm: string
  subject: string
}

const inp = { padding: '0.625rem 0.875rem', background: 'white', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem', color: 'var(--text-primary)', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
const lbl = { fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }

export default function TeacherAssignmentsPage() {
  const router = useRouter()
  const [view, setView] = useState<'teacher' | 'class' | 'classTeacher'>('teacher')
  const [classTeachers, setClassTeachers] = useState<{ id: string; teacher_id: string; teacher_name: string; class_level: string; class_arm: string }[]>([])
  const [ctForm, setCtForm] = useState({ classLevel: 'SS2', classArm: 'A', teacherId: '' })
  const [savingCt, setSavingCt] = useState(false)
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [selectedClass, setSelectedClass] = useState('SS2')
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ classLevel: 'SS2', classArm: '', subject: 'Mathematics' })
  const subjects = getSubjects()

  useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
      headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
    }).then(r => r.json()).then(d => {
      const t = (d.users ?? []).filter((u: any) => u.role === 'teacher')
      setTeachers(t)
      setSelectedTeacher(prev => prev || (t[0]?.id ?? ''))
    }).catch(console.error)
  }, [])

  useEffect(() => {
    if (view === 'teacher' && selectedTeacher) loadAssignments(`teacherId=${selectedTeacher}`)
    if (view === 'class' && selectedClass) loadAssignments(`classLevel=${selectedClass}`)
    if (view === 'classTeacher') loadClassTeachers()
  }, [view, selectedTeacher, selectedClass])

  function loadClassTeachers() {
    setLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/class-teachers`, {
      headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
    }).then(r => r.json()).then(d => setClassTeachers(d.classTeachers ?? [])).catch(console.error).finally(() => setLoading(false))
  }

  async function handleAssignClassTeacher() {
    if (!ctForm.teacherId) { setError('Select a teacher first'); return }
    setSavingCt(true); setError('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/class-teachers`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: ctForm.teacherId, classLevel: ctForm.classLevel, classArm: ctForm.classArm })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to assign')
      loadClassTeachers()
    } catch (e: any) {
      setError(e.message ?? 'Failed to assign')
    } finally { setSavingCt(false) }
  }

  async function handleRemoveClassTeacher(id: string) {
    if (!window.confirm('Remove this class teacher assignment?')) return
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/class-teachers/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
    })
    loadClassTeachers()
  }

  function loadAssignments(query: string) {
    setLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/teacher-assignments?${query}`, {
      headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
    }).then(r => r.json()).then(d => setAssignments(d.assignments ?? [])).catch(console.error).finally(() => setLoading(false))
  }

  async function handleAdd() {
    if (!selectedTeacher) { setError('Select a teacher first'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/teacher-assignments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId: selectedTeacher, classLevel: form.classLevel, classArm: form.classArm || undefined, subject: form.subject })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to save')
      loadAssignments(`teacherId=${selectedTeacher}`)
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Remove this assignment?')) return
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/teacher-assignments/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
    })
    if (view === 'teacher') loadAssignments(`teacherId=${selectedTeacher}`)
    else loadAssignments(`classLevel=${selectedClass}`)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', fontFamily: 'var(--font-body)' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          Teacher Assignments
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Assign teachers to the classes and subjects they teach
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['teacher', 'class', 'classTeacher'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ padding: '0.5rem 1.25rem', borderRadius: '8px', border: '1.5px solid var(--border)', background: view === v ? 'var(--brand)' : 'white', color: view === v ? 'white' : 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer' }}>
            {v === 'teacher' ? 'By Teacher' : v === 'class' ? 'By Class' : 'Class Teachers'}
          </button>
        ))}
      </div>

      {view === 'teacher' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={lbl}>Teacher</label>
            <select style={inp} value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)}>
              {teachers.length === 0 && <option value="">No teachers found</option>}
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>

          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>Add assignment</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
              <div>
                <label style={lbl}>Class level</label>
                <select style={inp} value={form.classLevel} onChange={e => setForm(f => ({ ...f, classLevel: e.target.value }))}>
                  {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Class arm</label>
                <select style={inp} value={form.classArm} onChange={e => setForm(f => ({ ...f, classArm: e.target.value }))}>
                  <option value="">All arms</option>
                  {CLASS_ARMS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Subject</label>
                <select style={inp} value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}>
                  {subjects.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={handleAdd} disabled={saving}
                style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                {saving ? 'Adding...' : '+ Add'}
              </button>
            </div>
            {error && <p style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.75rem' }}>{error}</p>}
          </div>

          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <span>Class level</span><span>Arm</span><span>Subject</span><span></span>
            </div>
            {loading ? (
              <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: 'var(--text-secondary)' }}>Loading…</p>
            ) : assignments.length === 0 ? (
              <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: 'var(--text-secondary)' }}>No assignments yet for this teacher.</p>
            ) : assignments.map(a => (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.875rem', alignItems: 'center' }}>
                <span>{a.class_level}</span>
                <span>{a.class_arm || 'All arms'}</span>
                <span>{a.subject}</span>
                <button onClick={() => handleDelete(a.id)}
                  style={{ padding: '0.25rem 0.625rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={lbl}>Class level</label>
            <select style={inp} value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
              {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <span>Arm</span><span>Subject</span><span>Teacher</span>
            </div>
            {loading ? (
              <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: 'var(--text-secondary)' }}>Loading…</p>
            ) : assignments.length === 0 ? (
              <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: 'var(--text-secondary)' }}>No teachers assigned to this class level yet.</p>
            ) : assignments.map(a => (
              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.875rem', alignItems: 'center' }}>
                <span>{a.class_arm || 'All arms'}</span>
                <span>{a.subject}</span>
                <span>{a.teacher_name}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            To add or remove an assignment, switch to the "By Teacher" view.
          </p>
        </div>
      )}

      {view === 'classTeacher' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem' }}>Assign class teacher</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              The class teacher is responsible for marking daily attendance for their assigned arm — this is separate from subject teaching assignments.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
              <div>
                <label style={lbl}>Class level</label>
                <select style={inp} value={ctForm.classLevel} onChange={e => setCtForm(f => ({ ...f, classLevel: e.target.value }))}>
                  {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Class arm</label>
                <select style={inp} value={ctForm.classArm} onChange={e => setCtForm(f => ({ ...f, classArm: e.target.value }))}>
                  {CLASS_ARMS.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Teacher</label>
                <select style={inp} value={ctForm.teacherId} onChange={e => setCtForm(f => ({ ...f, teacherId: e.target.value }))}>
                  <option value="">Select teacher...</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <button onClick={handleAssignClassTeacher} disabled={savingCt}
                style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: savingCt ? 0.6 : 1, whiteSpace: 'nowrap' as const }}>
                {savingCt ? 'Assigning...' : '+ Assign'}
              </button>
            </div>
            {error && <p style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.75rem' }}>{error}</p>}
          </div>

          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <span>Class level</span><span>Arm</span><span>Class teacher</span><span></span>
            </div>
            {loading ? (
              <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: 'var(--text-secondary)' }}>Loading…</p>
            ) : classTeachers.length === 0 ? (
              <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: 'var(--text-secondary)' }}>No class teachers assigned yet.</p>
            ) : classTeachers.map(ct => (
              <div key={ct.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 80px', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.875rem', alignItems: 'center' }}>
                <span>{ct.class_level}</span>
                <span>{ct.class_arm}</span>
                <span>{ct.teacher_name}</span>
                <button onClick={() => handleRemoveClassTeacher(ct.id)}
                  style={{ padding: '0.25rem 0.625rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}