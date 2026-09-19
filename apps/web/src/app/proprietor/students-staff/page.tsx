'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL
const ROLE_LABELS: Record<string, string> = { student: 'Student', teacher: 'Teacher', parent: 'Parent', school_admin: 'Admin' }

export default function ProprietorStudentsStaffPage() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState('student')

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => {
    apiFetch(`${API}/users`).then(r => r.json()).then(d => setUsers(d.users ?? [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const filtered = users.filter(u => u.role === roleFilter)

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Students & Staff</h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem', marginBottom: '1.5rem' }}>Read-only view of everyone enrolled or employed at the school.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {['student', 'teacher', 'parent', 'school_admin'].map(r => (
          <button key={r} onClick={() => setRoleFilter(r)}
            style={{ padding: '0.4rem 1rem', borderRadius: 20, border: '1px solid #e5e5e0', background: roleFilter === r ? '#1a6b4a' : 'white', color: roleFilter === r ? 'white' : '#6b6b65', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}>
            {ROLE_LABELS[r]} ({users.filter(u => u.role === r).length})
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#6b6b65', textAlign: 'center' as const, padding: '2rem' }}>Loading…</p>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 100px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
            <span>Name</span><span>Email</span><span>Class</span><span>Adm. No.</span><span>Status</span>
          </div>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center' as const, color: '#6b6b65' }}>No one found in this category.</p>
          ) : filtered.map(u => (
            <div key={u.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 100px', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', fontSize: '0.875rem' }}>
              <span style={{ fontWeight: 500 }}>{u.full_name}</span>
              <span style={{ color: '#6b6b65', fontSize: '0.8rem' }}>{u.email}</span>
              <span style={{ color: '#6b6b65' }}>{u.class_level ? `${u.class_level} ${u.class_arm ?? ''}` : '—'}</span>
              <span style={{ color: '#6b6b65' }}>{u.admission_no ?? '—'}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 20, background: u.is_active ? '#e8f5ee' : '#fef2f2', color: u.is_active ? '#0f4a32' : '#dc2626', width: 'fit-content' }}>
                {u.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}