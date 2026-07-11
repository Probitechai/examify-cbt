'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../hooks/useAuth'
import styles from './admin.layout.module.css'

const TIER_ORDER: Record<string, number> = { starter: 1, growth: 2, premium: 3 }

interface NavItem {
  href: string
  icon: string
  label: string
  tier?: 'starter' | 'growth' | 'premium'
}

const NAV: NavItem[] = [
  { href: '/admin',                icon: '◦',   label: 'Overview' },
  { href: '/admin/settings',       icon: '⚙️',  label: 'School Settings' },
  { href: '/admin/sessions',       icon: '📆',  label: 'Academic Sessions' },
  { href: '/admin/attendance',     icon: '📋',  label: 'Attendance' },
  { href: '/admin/results2',       icon: '📝',  label: 'Result Entry' },
  { href: '/admin/approvals',      icon: '✅',  label: 'Result Approval',   tier: 'growth' },
  { href: '/admin/broadsheet',     icon: '📊',  label: 'Broadsheet' },
  { href: '/admin/report-card',    icon: '🎓',  label: 'Report Card' },
  { href: '/admin/conduct',        icon: '📝',  label: 'Conduct Reports',   tier: 'growth' },
  { href: '/admin/fees',           icon: '💰',  label: 'Fee Management',    tier: 'growth' },
  { href: '/admin/timetable2',     icon: '📅',  label: 'Class Timetable',   tier: 'growth' },
  { href: '/admin/announcements',  icon: '📢',  label: 'Announcements',     tier: 'growth' },
  { href: '/admin/users',          icon: '👥',  label: 'Students & Staff' },
  { href: '/admin/users/import',   icon: '📥',  label: 'Import Students' },
  { href: '/admin/exams',          icon: '📋',  label: 'Exams' },
  { href: '/admin/timetable',      icon: '📝',  label: 'Exam Timetable' },
  { href: '/admin/qbank',          icon: '❓',  label: 'Question Bank' },
  { href: '/admin/results',        icon: '📈',  label: 'CBT Results' },
  { href: '/admin/analytics',      icon: '📊',  label: 'Analytics',         tier: 'premium' },
]

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { hydrate, user, isLoading } = useAuthStore()
  const [schoolTier, setSchoolTier] = useState<string>('growth')

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role === 'student') router.replace('/student')
    if (!isLoading && user && user.role === 'parent') router.replace('/parent')
  }, [user, isLoading, router])

  useEffect(() => {
    // Get school tier from JWT
    try {
      const token = getToken()
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        // Tier is stored on request.school in API — fetch it
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/schools/settings`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-School-Subdomain': payload.schoolSubdomain ?? '',
            'Content-Type': 'application/json',
          }
        }).then(r => r.json()).then(d => {
          if (d.subscription_tier) setSchoolTier(d.subscription_tier)
        }).catch(() => {})
      }
    } catch {}
  }, [user])

  if (isLoading || !user) return null

  function isLocked(item: NavItem): boolean {
    if (!item.tier) return false
    const current = TIER_ORDER[schoolTier] ?? 1
    const required = TIER_ORDER[item.tier] ?? 1
    return current < required
  }

  function tierBadge(tier: string) {
    if (tier === 'growth') return 'Growth'
    if (tier === 'premium') return 'Premium'
    return ''
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>E</span>
          <span className={styles.logoText}>Examify</span>
        </div>

        {/* Tier badge */}
        <div style={{ padding: '0.5rem 1rem', marginBottom: '0.5rem' }}>
          <span style={{
            display: 'inline-block', padding: '0.2rem 0.75rem',
            borderRadius: 20, fontSize: '0.7rem', fontWeight: 700,
            background: schoolTier === 'premium' ? '#f5f3ff' : schoolTier === 'growth' ? '#eff6ff' : '#e8f5ee',
            color: schoolTier === 'premium' ? '#7e22ce' : schoolTier === 'growth' ? '#1e40af' : '#0f4a32',
            textTransform: 'uppercase' as const, letterSpacing: '0.05em'
          }}>
            {schoolTier} plan
          </span>
        </div>

        <nav className={styles.nav}>
          {NAV.map(item => {
            const locked = isLocked(item)
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))

            if (locked) {
              return (
                <div key={item.href}
                  onClick={() => alert(`${item.label} requires the ${tierBadge(item.tier!)} plan. Please contact support to upgrade.`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1rem', cursor: 'pointer', opacity: 0.5, borderRadius: '8px', margin: '0.1rem 0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <span style={{ fontSize: '0.875rem' }}>{item.icon}</span>
                    <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{item.label}</span>
                  </div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.375rem', borderRadius: 10, background: '#f0f0ee', color: '#a0a09a' }}>
                    🔒 {tierBadge(item.tier!)}
                  </span>
                </div>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.navActive : ''}`}>
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <span className={styles.userAvatar}>{user?.fullName?.[0] ?? 'A'}</span>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{user?.fullName ?? 'Admin'}</span>
              <span className={styles.userRole}>{user?.role}</span>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={() => {
            document.cookie = 'examify_token=; Max-Age=0; path=/'
            router.push('/login')
          }}>
            Log out
          </button>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  )
}