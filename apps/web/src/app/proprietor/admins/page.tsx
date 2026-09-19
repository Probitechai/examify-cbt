'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

interface Admin {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export default function ProprietorAdminsPage() {
  const router = useRouter()
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newAdmin, setNewAdmin] = useState({ fullName: '', email: '', phone: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [createdInfo, setCreatedInfo] = useState<{ email: string; tempPassword: string } | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)
  const [resetInfo, setResetInfo] = useState<{ email: string; tempPassword: string } | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  useEffect(() => { loadAdmins() }, [])

  async function loadAdmins() {
    setLoading(true)
    try {
      const res = await apiFetch(`${API}/proprietor/admins`)
      const data = await res.json()
      setAdmins(data.admins ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function handleCreate() {
    setCreateError('')
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!newAdmin.fullName.trim()) { setCreateError('Full name is required.'); return }
    if (!emailPattern.test(newAdmin.email)) { setCreateError('Not a valid email address.'); return }
    setCreating(true)
    try {
      const res = await apiFetch(`${API}/proprietor/admins`, {
        method: 'POST',
        body: JSON.stringify({ fullName: newAdmin.fullName, email: newAdmin.email, phone: newAdmin.phone || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.message ?? 'Failed to create admin.'); return }
      setCreatedInfo({ email: data.admin.email, tempPassword: data.tempPassword })
      setNewAdmin({ fullName: '', email: '', phone: '' })
      loadAdmins()
    } catch {
      setCreateError('Network error. Please try again.')
    } finally { setCreating(false) }
  }

  async function handleToggle(id: string) {
    setToggling(id); setActionError('')
    try {
      const res = await apiFetch(`${API}/proprietor/admins/${id}/toggle`, { method: 'PATCH', body: '{}' })
      const data = await res.json()
      if (!res.ok) { setActionError(data.message ?? 'Failed to update admin.'); return }
      setAdmins(prev => prev.map(a => a.id === id ? { ...a, is_active: data.admin.is_active } : a))
    } catch {} finally { setToggling(null) }
  }

  async function handleResetPassword(id: string, name: string) {
    if (!confirm(`Reset ${name}'s password? A new temporary password will be generated and emailed to them.`)) return
    setResetting(id); setActionError('')
    try {
      const res = await apiFetch(`${API}/proprietor/admins/${id}/reset-password`, { method: 'PATCH', body: '{}' })
      const data = await res.json()
      if (!res.ok) { setActionError(data.message ?? 'Failed to reset password.'); return }
      const admin = admins.find(a => a.id === id)
      setResetInfo({ email: admin?.email ?? '', tempPassword: data.tempPassword })
    } catch {} finally { setResetting(null) }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Permanently delete ${name}'s admin account? This cannot be undone.`)) return
    setDeleting(id); setActionError('')
    try {
      const res = await apiFetch(`${API}/proprietor/admins/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setActionError(data.message ?? 'Failed to delete admin.'); return }
      setAdmins(prev => prev.filter(a => a.id !== id))
    } catch {} finally { setDeleting(null) }
  }

  const inp = { width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', boxSizing: 'border-box' as const }
  const lbl = { fontSize: '0.78rem', fontWeight: 600, color: '#3a3a36', display: 'block', marginBottom: '0.3rem' }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Admin Accounts</h1>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Manage who has administrative access to run your school day-to-day.</p>
        </div>
        <button onClick={() => { setShowAddModal(true); setCreatedInfo(null); setCreateError('') }}
          style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
          + Add Admin
        </button>
      </div>

      {actionError && (
        <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{actionError}</div>
      )}

      {resetInfo && (
        <div style={{ padding: '1rem 1.25rem', background: '#e8f5ee', border: '1px solid #1a6b4a', borderRadius: '10px', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f4a32', marginBottom: '0.5rem' }}>✅ Password reset — share these new details:</p>
          <p style={{ fontSize: '0.825rem', color: '#3a3a36' }}><strong>Email:</strong> {resetInfo.email}</p>
          <p style={{ fontSize: '0.825rem', color: '#3a3a36', marginBottom: '0.75rem' }}><strong>Temporary password:</strong> {resetInfo.tempPassword}</p>
          <button onClick={() => setResetInfo(null)}
            style={{ padding: '0.4rem 0.875rem', background: 'white', border: '1px solid #1a6b4a', color: '#0f4a32', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
            Dismiss
          </button>
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 130px 130px 220px', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
          <span>Name</span><span>Email / Phone</span><span>Status</span><span>Last login</span><span></span>
        </div>
        {loading ? (
          <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: '#6b6b65' }}>Loading…</p>
        ) : admins.length === 0 ? (
          <p style={{ padding: '1.5rem', textAlign: 'center' as const, color: '#6b6b65' }}>No admin accounts yet. Add one to get started.</p>
        ) : admins.map(a => (
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 130px 130px 220px', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{a.full_name}</span>
            <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{a.email}{a.phone ? ` · ${a.phone}` : ''}</span>
            <span style={{ padding: '0.25rem 0.625rem', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: a.is_active ? '#e8f5ee' : '#fef2f2', color: a.is_active ? '#0f4a32' : '#dc2626', width: 'fit-content' }}>
              {a.is_active ? 'Active' : 'Inactive'}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>{a.last_login_at ? new Date(a.last_login_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : 'Never'}</span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' as const }}>
              <button onClick={() => handleToggle(a.id)} disabled={toggling === a.id}
                style={{ padding: '0.3rem 0.6rem', border: '1px solid #e5e5e0', borderRadius: '6px', background: 'white', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', opacity: toggling === a.id ? 0.6 : 1 }}>
                {a.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button onClick={() => handleResetPassword(a.id, a.full_name)} disabled={resetting === a.id}
                style={{ padding: '0.3rem 0.6rem', border: '1px solid #bfdbfe', borderRadius: '6px', background: '#eff6ff', color: '#1e40af', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', opacity: resetting === a.id ? 0.6 : 1 }}>
                {resetting === a.id ? '…' : 'Reset password'}
              </button>
              <button onClick={() => handleDelete(a.id, a.full_name)} disabled={deleting === a.id}
                style={{ padding: '0.3rem 0.6rem', border: '1px solid #fecaca', borderRadius: '6px', background: 'white', color: '#dc2626', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', opacity: deleting === a.id ? 0.6 : 1 }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setShowAddModal(false)}>
          <div style={{ background: 'white', borderRadius: '14px', padding: '1.75rem', width: 420 }} onClick={e => e.stopPropagation()}>
            {!createdInfo ? (
              <>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1.25rem' }}>Add a School Admin</h2>
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={lbl}>Full name</label>
                  <input style={inp} value={newAdmin.fullName} onChange={e => setNewAdmin(p => ({ ...p, fullName: e.target.value }))} placeholder="e.g. Jane Doe" />
                </div>
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={lbl}>Email</label>
                  <input style={inp} value={newAdmin.email} onChange={e => setNewAdmin(p => ({ ...p, email: e.target.value }))} placeholder="admin@yourschool.ng" />
                </div>
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={lbl}>Phone number <span style={{ fontWeight: 400, color: '#a0a09a' }}>(optional)</span></label>
                  <input style={inp} value={newAdmin.phone} onChange={e => setNewAdmin(p => ({ ...p, phone: e.target.value }))} placeholder="e.g. 08012345678" />
                </div>
                {createError && (
                  <p style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '0.875rem' }}>{createError}</p>
                )}
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button onClick={() => setShowAddModal(false)}
                    style={{ flex: 1, padding: '0.65rem', background: '#f7f7f5', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={creating}
                    style={{ flex: 1, padding: '0.65rem', background: '#1a6b4a', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: creating ? 0.6 : 1 }}>
                    {creating ? 'Creating…' : 'Create admin'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f4a32', marginBottom: '0.75rem' }}>✅ Admin created</h2>
                <p style={{ fontSize: '0.875rem', color: '#3a3a36', marginBottom: '1rem' }}>Share these login details, or they've already been emailed:</p>
                <div style={{ background: '#f7f7f5', borderRadius: '8px', padding: '0.875rem', marginBottom: '1.25rem', fontSize: '0.825rem' }}>
                  <p style={{ marginBottom: '0.4rem' }}><strong>Email:</strong> {createdInfo.email}</p>
                  <p><strong>Temporary password:</strong> {createdInfo.tempPassword}</p>
                </div>
                <button onClick={() => setShowAddModal(false)}
                  style={{ width: '100%', padding: '0.65rem', background: '#1a6b4a', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}