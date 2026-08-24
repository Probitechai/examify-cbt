'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function detectSubdomain(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  const parts = host.split('.')
  if (parts.length === 3 && parts[1] === 'examify') return parts[0]
  return ''
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('This reset link is invalid. Please request a new one.')
      return
    }
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
      const subdomain = detectSubdomain() || localStorage.getItem('examify_school') || ''
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-School-Subdomain': subdomain,
        },
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? 'Failed to reset password.')
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2500)
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

        {success ? (
          <p style={{ fontSize: '0.875rem', color: '#0f4a32', background: '#e8f5ee', padding: '0.75rem 1rem', borderRadius: '8px' }}>
            Password updated! Redirecting you to login…
          </p>
        ) : (
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
        )}
      </div>
    </div>
  )
}