const fs = require('fs')
const path = require('path')

const filePath = 'apps/web/src/app/login/page.tsx'.replace(/\//g, path.sep)

const newContent = `'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'
import styles from './login.module.css'

const SCHOOL_MAP: Record<string, string> = {
  greensprings: 'Greensprings Academy',
  fmandt:       'F.M. & T Covenant Schools',
}

function detectSubdomain(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname // e.g. greensprings.examify.ng
  const parts = host.split('.')
  // Match: <school>.examify.ng  (3 parts, middle is 'examify')
  if (parts.length === 3 && parts[1] === 'examify') {
    return parts[0] // e.g. 'greensprings'
  }
  return ''
}

export default function LoginPage() {
  const router = useRouter()
  const { setAuth, hydrate, user, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Start as null — we don't know the subdomain until client mounts
  const [subdomain, setSubdomain] = useState<string | null>(null)
  const [fallbackSchool, setFallbackSchool] = useState('greensprings')

  useEffect(() => {
    const detected = detectSubdomain()
    if (detected && SCHOOL_MAP[detected]) {
      setSubdomain(detected)
      localStorage.setItem('examify_school', detected)
    } else {
      setSubdomain('') // empty string = no subdomain detected
      const saved = localStorage.getItem('examify_school') ?? 'greensprings'
      setFallbackSchool(saved)
    }
  }, [])

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(
        user.role === 'student'     ? '/student'     :
        user.role === 'parent'      ? '/parent'      :
        user.role === 'super_admin' ? '/superadmin'  : '/admin'
      )
    }
  }, [user, isLoading, router])

  // The school to use for login — whichever is active
  const activeSchool = subdomain || fallbackSchool

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    localStorage.setItem('examify_school', activeSchool)
    try {
      const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, subdomain: activeSchool }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Login failed')
        return
      }
      setAuth(data.token, data.user)
      document.cookie = \`examify_token=\${data.token}; path=/; max-age=\${60 * 60 * 24 * 7}; SameSite=Lax\`
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) return null

  // While subdomain is still being detected (null), render nothing
  // to avoid flash of dropdown before detection completes
  if (subdomain === null) return null

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoText}>Examify</span>
        </div>

        {/* School subdomain detected — show badge, hide dropdown */}
        {subdomain && (
          <p className={styles.schoolBadge}>
            {SCHOOL_MAP[subdomain]}
          </p>
        )}

        <h1 className={styles.title}>Sign in to your account</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email" className={styles.label}>Email address</label>
            <input
              id="email"
              type="email"
              className={styles.input}
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
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
              required
              autoComplete="current-password"
            />
          </div>

          {/* Only show school selector when NOT on a school subdomain */}
          {!subdomain && (
            <div className={styles.field}>
              <label htmlFor="school" className={styles.label}>School</label>
              <select
                id="school"
                className={styles.input}
                value={fallbackSchool}
                onChange={e => setFallbackSchool(e.target.value)}
              >
                <option value="greensprings">Greensprings Academy</option>
                <option value="fmandt">F.M. &amp; T Covenant Schools</option>
              </select>
            </div>
          )}

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
`

fs.writeFileSync(filePath, newContent, 'utf8')
console.log('DONE: login page fixed.')
console.log('Key fix: subdomain starts as null, page renders nothing until client detects hostname.')
console.log('This prevents the dropdown from ever flashing on school subdomains.')
