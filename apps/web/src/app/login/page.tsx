'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'
import { api, ApiError } from '../../lib/api'
import styles from './login.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth, hydrate, user, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [school, setSchool] = useState(() => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('examify_school') ?? 'greensprings'
  }
  return 'greensprings'
})

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(user.role === 'student' ? '/student' : user.role === 'parent' ? '/parent' : '/admin')
    }
  }, [user, isLoading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    localStorage.setItem('examify_school', school)  // ← add this line
    try {
      const { token, user } = await api.login(email.trim(), password)
      setAuth(token, user)
      router.push(user.role === 'student' ? '/student' : '/admin')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401
        ? 'Invalid email or password. Please try again.'
        : 'Something went wrong. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return <div className={styles.loading}><div className={styles.spinner} /></div>

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logo}>E</div>
          <h1 className={styles.title}>Examify</h1>
          <p className={styles.subtitle}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email address</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@school.examify.ng"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
<div className={styles.field}>
  <label htmlFor="school" className={styles.label}>School</label>
  <select
    id="school"
    className={styles.input}
    value={school}
    onChange={e => {
      setSchool(e.target.value)
      localStorage.setItem('examify_school', e.target.value)
    }}
  >
    <option value="greensprings">Greensprings Academy (Demo)</option>
    <option value="fmandt">F.M. & T Covenant Schools</option>
  </select>
</div>
          {error && <p className={styles.error} role="alert">{error}</p>}

          <button type="submit" className={styles.btn} disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.help}>
          Forgot your password? Contact your school administrator.
        </p>
      </div>
    </div>
  )
}
