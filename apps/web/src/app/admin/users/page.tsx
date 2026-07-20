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
  linkedStudents?: any[]
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
  const [tab, setTab] = useState<'student' | 'teacher' | 'parent'>('student')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [manageLinksParent, setManageLinksParent] = useState<User | null>(null)
  const [allLinks, setAllLinks] = useState<any[]>([])

  useEffect(() => { loadUsers() }, [])
  useEffect(() => { if (tab === 'parent') loadLinks() }, [tab])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally { setLoading(false) }
  }

  async function loadLinks() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/parents/links`, {
        headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      const links = data.links ?? []
      setAllLinks(links)
      setUsers(prev => prev.map(u => u.role === 'parent' ? {
        ...u,
        linkedStudents: links.filter((l: any) => l.parent_id === u.id)
      } : u))
    } catch {}
  }

  function getName(u: User) { return u.full_name ?? u.fullName ?? '' }
  function getAdmNo(u: User) { return u.admission_no ?? u.admissionNo ?? '-' }
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
  const parents = users.filter(u => u.role === 'parent')

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Students & Staff</h1>
          <p className={styles.subtitle}>
            {loading ? 'Loading...' : `${students.length} students · ${teachers.length} teachers · ${parents.length} parents`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className={styles.importBtn} onClick={() => router.push('/admin/users/import')}>
            Import students
          </button>
          <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
            + Add user
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        {(['student', 'teacher', 'parent'] as const).map(t => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
            {t === 'student' ? `Students (${students.length})` : t === 'teacher' ? `Teachers (${teachers.length})` : `Parents (${parents.length})`}
          </button>
        ))}
      </div>

      <div className={styles.filterRow}>
        <input className={styles.search} placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
        {tab === 'student' && (
          <select className={styles.sel} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="">All classes</option>
            {classes.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead} style={{ gridTemplateColumns: tab === 'student' ? '2fr 2fr 1fr 1fr 100px 1fr 0.8fr' : '2fr 2fr 2fr 1fr 0.8fr' }}>
          <span>Name</span>
          <span>Email</span>
          {tab === 'student' && <span>Adm. No.</span>}
          {tab === 'student' && <span>Class</span>}
          {tab === 'student' && <span></span>}
          {tab === 'parent' && <span>Linked Students</span>}
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
              {tab === 'student' ? '👤' : tab === 'parent' ? '👨‍👩‍👧' : '👩‍🏫'}
            </div>
            <p>{search ? 'No results found' : `No ${tab}s yet.`}</p>
          </div>
        ) : filtered.map(u => (
          <div key={u.id} className={styles.tableRow} style={{ gridTemplateColumns: tab === 'student' ? '2fr 2fr 1fr 1fr 100px 1fr 0.8fr' : '2fr 2fr 2fr 1fr 0.8fr' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: tab === 'student' ? '#e8f5ee' : tab === 'parent' ? '#fff7ed' : '#eff6ff', color: tab === 'student' ? '#0f4a32' : tab === 'parent' ? '#c2410c' : '#1e40af', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {getName(u).charAt(0)}
              </span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.875rem' }}>{getName(u)}</span>
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{u.email}</span>
            {tab === 'student' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{getAdmNo(u)}</span>}
            {tab === 'student' && <span style={{ color: 'var(--text-secondary)', fontSize: '0.825rem' }}>{getClass(u)} {getArm(u)}</span>}
            {tab === 'student' && (
              <span>
                <button onClick={() => router.push(`/admin/students/${u.id}`)}
                  style={{ padding: '0.25rem 0.625rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                  View Profile
                </button>
              </span>
            )}
            {tab === 'parent' && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {u.linkedStudents && u.linkedStudents.length > 0
                  ? u.linkedStudents.map((s: any) => s.student_name).join(', ')
                  : <span style={{ color: '#a0a09a' }}>No student linked</span>}
                <button onClick={() => setManageLinksParent(u)}
                  style={{ marginLeft: '0.5rem', padding: '0.15rem 0.5rem', background: '#eff6ff', border: 'none', borderRadius: '6px', fontSize: '0.68rem', color: '#1e40af', cursor: 'pointer', fontWeight: 600 }}>
                  Manage
                </button>
              </span>
            )}
            {tab === 'student' && (
              <span>
                <button onClick={() => router.push(`/admin/students/${u.id}`)}
                  style={{ padding: '0.25rem 0.625rem', background: '#e8f5ee', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#0f4a32', cursor: 'pointer', fontWeight: 600 }}>
                  View Profile
                </button>
              </span>
            )}
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

      {manageLinksParent && (
        <ManageLinksModal
          parent={manageLinksParent}
          allLinks={allLinks.filter((l: any) => l.parent_id === manageLinksParent.id)}
          students={students}
          onClose={() => setManageLinksParent(null)}
          onSaved={() => { setManageLinksParent(null); loadLinks() }}
        />
      )}
    </div>
  )
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [linkedStudentId, setLinkedStudentId] = useState('')
  const [students, setStudents] = useState<any[]>([])
  const [form, setForm] = useState({
    role: 'student', fullName: '', email: '', password: 'Student@1234',
    admissionNo: '', classLevel: 'SS2', classArm: 'A',
  })

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/users?role=student`, {
      headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
    }).then(r => r.json()).then(d => setStudents(d.users ?? [])).catch(() => {})
  }, [])

  async function handleSave() {
    if (!form.fullName.trim() || !form.email.trim()) { setError('Full name and email are required'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: form.role, fullName: form.fullName, email: form.email, password: form.password,
          admissionNo: form.admissionNo || undefined,
          classLevel: form.role === 'student' ? form.classLevel : undefined,
          classArm: form.role === 'student' ? form.classArm : undefined,
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to create user')
      if (form.role === 'parent' && linkedStudentId && data.userId) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/parents/link`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: data.userId, studentId: linkedStudentId, relationship: 'parent' })
        })
      }
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const inp = { padding: '0.625rem 0.875rem', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem', color: 'var(--text-primary)', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }
  const lbl = { fontSize: '0.825rem', fontWeight: 500, color: 'var(--text-primary)', display: 'block', marginBottom: '0.4rem' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '480px', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' as const }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Add User</h2>
          <button onClick={onClose} style={{ color: 'var(--text-tertiary)', fontSize: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={lbl}>Role</label>
            <select style={inp} value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="school_admin">School Admin</option>
              <option value="parent">Parent</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Full name</label>
            <input style={inp} value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="e.g. Amara Obi" />
          </div>
          <div>
            <label style={lbl}>Email</label>
            <input style={inp} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="amara@example.com" />
          </div>
          <div>
            <label style={lbl}>Password</label>
            <input style={inp} value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
          {form.role === 'parent' && (
            <div>
              <label style={lbl}>Link to student (ward)</label>
              <select style={inp} value={linkedStudentId} onChange={e => setLinkedStudentId(e.target.value)}>
                <option value="">Select student...</option>
                {students.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.full_name} - {s.class_level} {s.class_arm ?? ''}</option>
                ))}
              </select>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.375rem' }}>You can link additional students later.</p>
            </div>
          )}
          {form.role === 'student' && (
            <>
              <div>
                <label style={lbl}>Admission No. (optional)</label>
                <input style={inp} value={form.admissionNo} onChange={e => set('admissionNo', e.target.value)} placeholder="e.g. SCH/2024/001" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <div>
                  <label style={lbl}>Class level</label>
                  <select style={inp} value={form.classLevel} onChange={e => set('classLevel', e.target.value)}>
                    {['JSS1','JSS2','JSS3','SS1','SS2','SS3'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Class arm</label>
                  <input style={inp} value={form.classArm} onChange={e => set('classArm', e.target.value)} placeholder="A, B, Science..." />
                </div>
              </div>
            </>
          )}
          {error && <p style={{ fontSize: '0.825rem', color: '#dc2626' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Create user'}
            </button>
            <button onClick={onClose}
              style={{ padding: '0.75rem 1.25rem', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '0.875rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ManageLinksModal({ parent, allLinks, students, onClose, onSaved }: {
  parent: User
  allLinks: any[]
  students: User[]
  onClose: () => void
  onSaved: () => void
}) {
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inp = { padding: '0.625rem 0.875rem', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem', color: 'var(--text-primary)', outline: 'none', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' as const }

  async function handleLink() {
    if (!selectedStudentId) { setError('Please select a student'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/parents/link`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: parent.id, studentId: selectedStudentId })
      })
      if (!res.ok) throw new Error('Failed to link')
      setSelectedStudentId('')
      onSaved()
    } catch { setError('Failed to link student') } finally { setSaving(false) }
  }

  async function handleUnlink(studentId: string) {
    if (!window.confirm('Remove this student link?')) return
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/parents/link`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: parent.id, studentId })
    })
    onSaved()
  }

  const linkedStudentIds = allLinks.map((l: any) => l.student_id)
  const unlinkableStudents = students.filter(s => !linkedStudentIds.includes(s.id))

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '1.75rem', width: '100%', maxWidth: '480px', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Manage Student Links</h2>
            <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>{parent.full_name}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-tertiary)', fontSize: '1rem', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.625rem' }}>Linked Students</p>
          {allLinks.length === 0 ? (
            <p style={{ fontSize: '0.825rem', color: '#a0a09a', padding: '0.875rem', background: '#f7f7f5', borderRadius: '8px' }}>No students linked yet</p>
          ) : allLinks.map((l: any) => (
            <div key={l.student_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.875rem', background: '#e8f5ee', borderRadius: '8px', marginBottom: '0.5rem' }}>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#0f4a32' }}>{l.student_name}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{l.class_level} {l.class_arm}</p>
              </div>
              <button onClick={() => handleUnlink(l.student_id)}
                style={{ padding: '0.25rem 0.625rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.72rem', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
                Remove
              </button>
            </div>
          ))}
        </div>
        {unlinkableStudents.length > 0 && (
          <div>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.625rem' }}>Link Another Student</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select style={{ ...inp, flex: 1 }} value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
                <option value="">Select student...</option>
                {unlinkableStudents.map(s => (
                  <option key={s.id} value={s.id}>{s.full_name} - {s.class_level} {s.class_arm ?? ''}</option>
                ))}
              </select>
              <button onClick={handleLink} disabled={saving}
                style={{ padding: '0 1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const, opacity: saving ? 0.6 : 1 }}>
                {saving ? '...' : 'Link'}
              </button>
            </div>
            {error && <p style={{ fontSize: '0.78rem', color: '#dc2626', marginTop: '0.375rem' }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}