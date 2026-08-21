'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { token, user, setAuth } = useAuthStore()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/change-password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-School-Subdomain': user?.school?.subdomain ?? '',
        },
        body: JSON.stringify({ newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? 'Failed to update password.')
        return
      }

      // Update local state so the mustChangePassword flag clears immediately
      if (token && user) {
        setAuth(token, { ...user, mustChangePassword: false })
      }

      router.replace(
        user?.role === 'student'     ? '/student'     :
        user?.role === 'parent'      ? '/parent'      :
        user?.role === 'super_admin' ? '/superadmin'  : '/admin'
      )
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ background: 'white', borderRadius: '14px', padding: '2.5rem', width: 420, border: '1px solid #e5e5e0' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>Set a new password</h1>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>
          For security, you need to set a new password before continuing.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#3a3a36', display: 'block', marginBottom: '0.3rem' }}>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#3a3a36', display: 'block', marginBottom: '0.3rem' }}>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem' }}
            />
          </div>

          {error && (
            <p style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</p>
          )}

          <button type="submit" disabled={submitting}
            style={{ width: '100%', padding: '0.7rem', background: '#0f4a32', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}