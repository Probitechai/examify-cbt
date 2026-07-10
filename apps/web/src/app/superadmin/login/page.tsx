'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL

export default function SuperAdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch(`${API}/superadmin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Invalid credentials')

      // Store token in cookie
      document.cookie = `examify_token=${data.token}; path=/; max-age=${60 * 60 * 12}`
      router.push('/superadmin')
    } catch (err: any) {
      setError(err.message ?? 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f4a32 0%, #1a1a18 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '2.5rem', width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: 56, height: 56, background: '#0f4a32', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'white', fontWeight: 800, fontSize: '1.5rem' }}>E</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.25rem' }}>Platform Admin</h1>
          <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Examify Super Admin Portal</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', display: 'block', marginBottom: '0.375rem' }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="superadmin@probitechai.com"
              style={{ width: '100%', padding: '0.75rem 1rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18', display: 'block', marginBottom: '0.375rem' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', padding: '0.75rem 1rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
            />
          </div>

          {error && (
            <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.825rem', color: '#dc2626' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ padding: '0.875rem', background: '#0f4a32', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, marginTop: '0.5rem' }}>
            {loading ? 'Signing in…' : 'Sign in to Platform Admin'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#a0a09a', marginTop: '1.5rem' }}>
          This portal is restricted to Examify platform administrators only.
        </p>
      </div>
    </div>
  )
}