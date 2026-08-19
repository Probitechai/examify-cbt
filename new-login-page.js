// new-login-page.js
// Run from C:\Probitechai\examify:  node new-login-page.js
// Rewrites apps/web/src/app/login/page.tsx to use subdomain detection

const fs = require('fs')
const path = require('path')

const filePath = 'apps/web/src/app/login/page.tsx'

const newContent = `'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../hooks/useAuth'
import styles from './login.module.css'

// Known schools: subdomain -> { name, displayName }
const SCHOOL_MAP: Record<string, { name: string; displayName: string }> = {
  greensprings: { name: 'greensprings', displayName: 'Greensprings Academy' },
  fmandt:       { name: 'fmandt',       displayName: 'F.M. & T Covenant Schools' },
}

function getSubdomainFromHost(): string {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname // e.g. greensprings.examify.ng
  const parts = host.split('.')
  // If 3+ parts and second part is 'examify', first part is school subdomain
  if (parts.length >= 3 && parts[1] === 'examify') {
    return parts[0]
  }
  // localhost or app.examify.ng — no school subdomain
  return ''
}

export default function LoginPage() {
  const router = useRouter()
  const { setAuth, hydrate, user, isLoading } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Detect subdomain on mount
  const [school, setSchool] = useState('')
  const [schoolDisplay, setSchoolDisplay] = useState('')
  const [subdomainDetected, setSubdomainDetected] = useState(false)

  useEffect(() => {
    const subdomain = getSubdomainFromHost()
    if (subdomain && SCHOOL_MAP[subdomain]) {
      // Subdomain matches a known school — use it automatically
      setSchool(subdomain)
      setSchoolDisplay(SCHOOL_MAP[subdomain].displayName)
      setSubdomainDetected(true)
      localStorage.setItem('examify_school', subdomain)
    } else {
      // Fallback: use localStorage or default (for localhost / direct access)
      const saved = localStorage.getItem('examify_school') ?? 'greensprings'
      setSchool(saved)
      setSchoolDisplay(SCHOOL_MAP[saved]?.displayName ?? saved)
      setSubdomainDetected(false)
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    localStorage.setItem('examify_school', school)
    try {
      const res = await fetch(\`\${process.env.NEXT_PUBLIC_API_URL}/auth/login\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, subdomain: school }),
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

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoText}>Examify</span>
        </div>

        {/* Show school name if detected from subdomain, otherwise show nothing */}
        {subdomainDetected && (
          <p className={styles.schoolBadge}>{schoolDisplay}</p>
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

          {/* Only show school selector on localhost / direct access — never on school subdomains */}
          {!subdomainDetected && (
            <div className={styles.field}>
              <label htmlFor="school" className={styles.label}>School</label>
              <select
                id="school"
                className={styles.input}
                value={school}
                onChange={e => {
                  setSchool(e.target.value)
                  setSchoolDisplay(SCHOOL_MAP[e.target.value]?.displayName ?? e.target.value)
                  localStorage.setItem('examify_school', e.target.value)
                }}
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

const winPath = filePath.replace(/\//g, path.sep)

// Backup original
const original = fs.readFileSync(winPath, 'utf8')
fs.writeFileSync(winPath + '.bak', original, 'utf8')
console.log('Backup saved: ' + winPath + '.bak')

// Write new file
fs.writeFileSync(winPath, newContent, 'utf8')
console.log('DONE: login page updated.')
console.log('')
console.log('What changed:')
console.log('  - School is now auto-detected from subdomain (greensprings.examify.ng etc)')
console.log('  - School dropdown is HIDDEN when visiting a school subdomain')
console.log('  - School badge shows the school name instead')
console.log('  - Dropdown still shown on localhost for your own testing')
console.log('  - Backup of original saved as page.tsx.bak')

// Also patch the CSS file to add .schoolBadge
const cssPath = 'apps/web/src/app/login/login.module.css'.replace(/\//g, path.sep)
const cssContent = fs.readFileSync(cssPath, 'utf8')

const badgeCSS = `
.schoolBadge {
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-primary, #1A7A4A);
  background: var(--color-primary-light, #E8F5EE);
  border: 1px solid var(--color-primary, #1A7A4A);
  border-radius: 999px;
  padding: 0.25rem 1rem;
  margin: 0 auto 1rem;
  display: inline-block;
  width: fit-content;
  left: 0;
  right: 0;
  position: relative;
}
`

if (!cssContent.includes('.schoolBadge')) {
  fs.writeFileSync(cssPath, cssContent + badgeCSS, 'utf8')
  console.log('CSS updated: .schoolBadge added')
} else {
  console.log('CSS already has .schoolBadge — skipped')
}
