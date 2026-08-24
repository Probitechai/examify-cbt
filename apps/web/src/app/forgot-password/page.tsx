'use client'
import { useState } from 'react'

function detectSubdomain(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  const parts = host.split('.')
  if (parts.length === 3 && parts[1] === 'examify') return parts[0]
  return ''
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const subdomain = detectSubdomain() || localStorage.getItem('examify_school') || ''
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-School-Subdomain': subdomain,
        },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      setMessage(data.message ?? 'If that email is registered, a password reset link has been sent.')
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <div style={{ background: 'white', borderRadius: '14px', padding: '2.5rem', width: 420, border: '1px solid #e5e5e0' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>Reset your password</h1>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>
          Enter your email address and we'll send you a link to reset your password.
        </p>

        {message ? (
          <p style={{ fontSize: '0.875rem', color: '#0f4a32', background: '#e8f5ee', padding: '0.75rem 1rem', borderRadius: '8px' }}>
            {message}
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#3a3a36', display: 'block', marginBottom: '0.3rem' }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem' }}
              />
            </div>

            {error && (
              <p style={{ fontSize: '0.8rem', color: '#dc2626', background: '#fef2f2', padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>{error}</p>
            )}

            <button type="submit" disabled={submitting}
              style={{ width: '100%', padding: '0.7rem', background: '#0f4a32', border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p style={{ fontSize: '0.8rem', color: '#6b6b65', marginTop: '1.25rem', textAlign: 'center' as const }}>
          <a href="/login" style={{ color: '#0f4a32' }}>Back to login</a>
        </p>
      </div>
    </div>
  )
}