'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './users.module.css'

interface User {
  id: string
  role: string
  fullName: string
  email: string
  admissionNo?: string
  classLevel?: string
  classArm?: string
  isActive: boolean
  lastLoginAt?: string
}

const MOCK_USERS: User[] = [
  { id: '1', role: 'student', fullName: 'Amara Obi', email: 'amara.obi@greensprings.examify.ng', admissionNo: 'GS/2024/001', classLevel: 'SS2', classArm: 'A', isActive: true, lastLoginAt: new Date().toISOString() },
  { id: '2', role: 'student', fullName: 'Tunde Adeyemi', email: 'tunde.adeyemi@greensprings.examify.ng', admissionNo: 'GS/2024/002', classLevel: 'SS2', classArm: 'A', isActive: true, lastLoginAt: new Date(Date.now() - 3600000).toISOString() },
  { id: '3', role: 'student', fullName: 'Ngozi Eze', email: 'ngozi.eze@greensprings.examify.ng', admissionNo: 'GS/2024/003', classLevel: 'SS2', classArm: 'B', isActive: true },
  { id: '4', role: 'student', fullName: 'Emeka Nwosu', email: 'emeka.nwosu@greensprings.examify.ng', admissionNo: 'GS/2024/004', classLevel: 'SS3', classArm: 'A', isActive: false },
  { id: '5', role: 'student', fullName: 'Halima Sule', email: 'halima.sule@greensprings.examify.ng', admissionNo: 'GS/2024/005', classLevel: 'SS3', classArm: 'B', isActive: true },
  { id: '6', role: 'teacher', fullName: 'Mr. Chukwuemeka Eze', email: 'c.eze@greensprings.examify.ng', isActive: true, lastLoginAt: new Date(Date.now() - 7200000).toISOString() },
  { id: '7', role: 'teacher', fullName: 'Mrs. Fatima Bello', email: 'f.bello@greensprings.examify.ng', isActive: true },
]

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>(MOCK_USERS)
  const [tab, setTab] = useState<'student' | 'teacher'>('student')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const filtered = users.filter(u => {
    if (u.role !== tab) return false
    if (search && !u.fullName.toLowerCase().includes(search.toLowerCase()) &&
        !u.email.toLowerCase().includes(search.toLowerCase()) &&
        !(u.admissionNo ?? '').toLowerCase().includes(search.toLowerCase())) return false
    if (classFilter && u.classLevel !== classFilter) return false
    return true
  })

  function formatLastLogin(iso?: string) {
    if (!iso) return 'Never'
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return new Date(iso).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Students & Staff</h1>
          <p className={styles.subtitle}>Manage all users in your school</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.importBtn} onClick={() => router.push('/admin/users/import')}>
            ↑ Import CSV
          </button>
          <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
            + Add user
          </button>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'student' ? styles.tabActive : ''}`} onClick={() => setTab('student')}>
          Students <span className={styles.tabCount}>{users.filter(u => u.role === 'student').length}</span>
        </button>
        <button className={`${styles.tab} ${tab === 'teacher' ? styles.tabActive : ''}`} onClick={() => setTab('teacher')}>
          Teachers <span className={styles.tabCount}>{users.filter(u => u.role === 'teacher').length}</span>
        </button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Search by name, email or admission number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {tab === 'student' && (
          <select className={styles.select} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="">All classes</option>
            <option value="SS1">SS1</option>
            <option value="SS2">SS2</option>
            <option value="SS3">SS3</option>
          </select>
        )}
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableHead}>
          <span>Name</span>
          {tab === 'student' && <><span>Adm. No.</span><span>Class</span></>}
          <span>Email</span>
          <span>Last login</span>
          <span>Status</span>
          <span></span>
        </div>
        {filtered.length === 0 ? (
          <div className={styles.empty}>No {tab}s found.</div>
        ) : filtered.map(user => (
          <div key={user.id} className={styles.tableRow}>
            <span className={styles.nameCell}>
              <span className={styles.rowAvatar}>{user.fullName.charAt(0)}</span>
              <span className={styles.userName}>{user.fullName}</span>
            </span>
            {tab === 'student' && (
              <>
                <span className={styles.cell}>{user.admissionNo ?? '—'}</span>
                <span className={styles.cell}>{user.classLevel} {user.classArm}</span>
              </>
            )}
            <span className={styles.cellMono}>{user.email}</span>
            <span className={styles.cell}>{formatLastLogin(user.lastLoginAt)}</span>
            <span>
              <span className={`${styles.statusPill} ${user.isActive ? styles.active : styles.inactive}`}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
            </span>
            <span className={styles.actions}>
              <button className={styles.actionBtn}>Edit</button>
              <button
                className={styles.actionBtn}
                onClick={() => setUsers(us => us.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u))}
              >
                {user.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </span>
          </div>
        ))}
      </div>

      {showAddModal && (
        <AddUserModal tab={tab} onClose={() => setShowAddModal(false)} onAdd={u => { setUsers(us => [...us, u]); setShowAddModal(false) }} />
      )}
    </div>
  )
}

function AddUserModal({ tab, onClose, onAdd }: { tab: string; onClose: () => void; onAdd: (u: User) => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', admissionNo: '', classLevel: 'SS2', classArm: 'A' })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onAdd({
      id: Math.random().toString(),
      role: tab,
      fullName: form.fullName,
      email: form.email,
      admissionNo: form.admissionNo || undefined,
      classLevel: tab === 'student' ? form.classLevel : undefined,
      classArm: tab === 'student' ? form.classArm : undefined,
      isActive: true,
    })
  }

  return (
    <div className={styles.modalBackdrop} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add {tab}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formField}>
            <label>Full name</label>
            <input required value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Amara Obi" />
          </div>
          <div className={styles.formField}>
            <label>Email</label>
            <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="amara.obi@greensprings.examify.ng" />
          </div>
          <div className={styles.formField}>
            <label>Password</label>
            <input type="password" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 6 characters" />
          </div>
          {tab === 'student' && (
            <>
              <div className={styles.formField}>
                <label>Admission number</label>
                <input value={form.admissionNo} onChange={e => setForm(f => ({ ...f, admissionNo: e.target.value }))} placeholder="GS/2024/001" />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label>Class</label>
                  <select value={form.classLevel} onChange={e => setForm(f => ({ ...f, classLevel: e.target.value }))}>
                    <option>SS1</option><option>SS2</option><option>SS3</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label>Arm</label>
                  <select value={form.classArm} onChange={e => setForm(f => ({ ...f, classArm: e.target.value }))}>
                    <option>A</option><option>B</option><option>C</option><option>Science</option><option>Arts</option><option>Commercial</option>
                  </select>
                </div>
              </div>
            </>
          )}
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submitBtn}>Add {tab}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
