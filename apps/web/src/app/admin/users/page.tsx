'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './users.module.css'

interface User {
  id: string
  role: string
  full_name: string
  fullName?: string
  email: string
  admission_no?: string
  admissionNo?: string
  class_level?: string
  classLevel?: string
  class_arm?: string
  classArm?: string
  is_active: boolean
  isActive?: boolean
  last_login_at?: string
  lastLoginAt?: string
}

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}

function getSubdomain() {
  if (typeof window === 'undefined') return 'greensprings'
  return window.localStorage.getItem('examify_school') ?? 'greensprings'
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'student' | 'teacher'>('student')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'X-School-Subdomain': getSubdomain(),
          'Content-Type': 'application/json'
        }
      })
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  function getName(u: User) { return u.full_name ?? u.fullName ?? '' }
  function getAdmNo(u: User) { return u.admission_no ?? u.admissionNo ?? '—' }
  function getClass(u: User) { return u.class_level ?? u.classLevel ?? '' }
  function getArm(u: User) { return u.class_arm ?? u.classArm ?? '' }
  function getActive(u: User) { return u.is_active ?? u.isActive ?? true }
  function getLastLogin(u: User) {
    const d = u.last_login_at ?? u.lastLoginAt
    if (!d) return 'Never'
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  const filtered = users.filter(u => {
    if (u.role !== tab) return false
    if (search && !getName(u).toLowerCase().includes(search.toLowerCase()) &&
        !u.email.toLowerCase().includes(search.toLowerCase())) return false
    if (classFilter && getClass(u) !== classFilter) return false
    return true
  })

  const classes = [...new Set(users.filter(u => u.role === 'student').map(u => getClass(u)).filter(Boolean))].sort()
  const students = users.filter(u => u.role === 'student')
  const teachers = users.filter(u => u.role === 'teacher')

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Students & Staff</h1>
          <p className={styles.subtitle}>
            {loading ? 'Loading...' : `${students.length} students · ${teachers.length} teachers`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className={styles.importBtn}
            onClick={() => router.push('/admin/users/import')}>
            📥 Import students
          </button>
          <button
            className={styles.addBtn}
            onClick={() => setShowAddModal(true)}>
            + Add user
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        {(['student', 'teacher'] as const).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}>
            {t === 'student' ? `Students (${students.length})` : `Teachers (${teachers.length})`}
          </button>
        ))}
      </div>

      <div className={styles.filterRow}>
        <input
          className={styles.search}
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {tab === 'student' && (
          <select className={styles.sel} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="">All classes</option>
            {classes.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <span>Name</span>
          <span>Email</span>
          {tab === 'student' && <span>Adm. No.</span>}
          {tab === 'student' && <span>Class</span>}
          <span>Last login</span>
          <span>Status</span>
        </div>

        {loading ? (
          <div className={styles.loading}>
            {[1,2,3,4,5].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>
              {tab === 'student' ? '👤' : '👩‍🏫'}
            </div>
            <p>{search ? 'No results found' : `No ${tab}s yet. ${tab === 'student' ? 'Import students to get started.' : 'Add a teacher to get started.'}`}</p>
            {!search && tab === 'student' && (
              <button className={styles.addBtn} style={{ marginTop: '1rem' }}
                onClick={() => router.push('/admin/users/import')}>
                Import students
              </button>
            )}
          </div>
        ) : filtered.map(u => (
          <div key={u.id} className={styles.tableRow}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: tab === 'student' ? '#e8f5ee' : '#eff6ff', color: tab === 'student' ? '#0f4a32' : '#1e40af', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {getName(u).charAt(0)}
              </span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{getName(u)}</span>
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{u.email}</span>
            {tab === 'student' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{getAdmNo(u)}</span>}
            {tab === 'student' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{getClass(u)} {getArm(u)}</span>}
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{getLastLogin(u)}</span>
            <span>
              <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 20, background: getActive(u) ? '#e8f5ee' : '#fef2f2', color: getActive(u) ? '#0f4a32' : '#dc2626' }}>
                {getActive(u) ? 'Active' : 'Inactive'}
              </span>
            </span>
          </div>
        ))}
      </div>

      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); loadUsers() }}
        />
      )}
    </div>
  )
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    role: 'student',
    fullName: '',
    email: '',
    password: 'Student@1234',
    admissionNo: '',
    classLevel: 'SS2',
    classArm: 'A',
  })

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form.fullName.trim() || !form.email.trim()) {
      setError('Full name and email are required')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'X-School-Subdomain': getSubdomain(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: form.role,
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          admissionNo: form.admissionNo || undefined,
          classLevel: form.role === 'student' ? form.classLevel : undefined,
          classArm: form.role === 'student' ? form.classArm : undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to create user')
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { padding: '0.625rem 0.875rem', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem', color: 'var(--text-primary)', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
  const labelStyle = { fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '480px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Add User</h2>
          <button onClick={onClose} style={{ color: 'var(--text-tertiary)', fontSize: '1rem' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Role</label>
            <select style={inputStyle} value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="school_admin">School Admin</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Full name</label>
            <input style={inputStyle} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="e.g. Amara Obi" />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="amara.obi@school.ng" />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input style={inputStyle} value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
          {form.role === 'student' && (
            <>
              <div>
                <label style={labelStyle}>Admission No. (optional)</label>
                <input style={inputStyle} value={form.admissionNo} onChange={e => set('admissionNo', e.target.value)} placeholder="e.g. SCH/2024/001" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <div>
                  <label style={labelStyle}>Class level</label>
                  <select style={inputStyle} value={form.classLevel} onChange={e => set('classLevel', e.target.value)}>
                    <option>SS1</option><option>SS2</option><option>SS3</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Class arm</label>
                  <input style={inputStyle} value={form.classArm} onChange={e => set('classArm', e.target.value)} placeholder="A, B, Science..." />
                </div>
              </div>
            </>
          )}
          {error && <p style={{ fontSize: '0.875rem', color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.625rem 0.875rem' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save user'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

