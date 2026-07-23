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
  { href: '/admin',               icon: '◦',  label: 'Overview' },
  { href: '/admin/settings',      icon: '⚙️', label: 'School Settings' },
  { href: '/admin/subscription',  icon: '💳', label: 'Subscription' },
  { href: '/admin/sessions',      icon: '📆', label: 'Academic Sessions' },
  { href: '/admin/attendance',    icon: '📋', label: 'Attendance' },
  { href: '/admin/results2',      icon: '📝', label: 'Result Entry' },
  { href: '/admin/approvals',     icon: '✅', label: 'Result Approval',   tier: 'growth' },
  { href: '/admin/broadsheet',    icon: '📊', label: 'Broadsheet' },
  { href: '/admin/report-card',   icon: '🎓', label: 'Report Card' },
  { href: '/admin/conduct',       icon: '📝', label: 'Conduct Reports',   tier: 'growth' },
  { href: '/admin/fees',          icon: '💰', label: 'Fee Management',    tier: 'growth' },
  { href: '/admin/timetable2',    icon: '📅', label: 'Class Timetable',   tier: 'growth' },
  { href: '/admin/announcements', icon: '📢', label: 'Announcements',     tier: 'growth' },
  { href: '/admin/admissions',    icon: '🎓', label: 'Admissions',        tier: 'premium' },
  { href: '/admin/curriculum',    icon: '📚', label: 'Curriculum',        tier: 'growth' },
  { href: '/admin/lessons',       icon: '📖', label: 'Lesson Plans',      tier: 'growth' },
  { href: '/admin/gradebook',     icon: '📊', label: 'Gradebook',         tier: 'growth' },
  { href: '/admin/users',         icon: '👥', label: 'Students & Staff' },
  { href: '/admin/users/import',  icon: '📥', label: 'Import Students' },
  { href: '/admin/exams',         icon: '📋', label: 'Exams' },
  { href: '/admin/timetable',     icon: '📝', label: 'Exam Timetable' },
  { href: '/admin/qbank',         icon: '❓', label: 'Question Bank' },
  { href: '/admin/results',       icon: '📈', label: 'CBT Results' },
  { href: '/admin/analytics',     icon: '📊', label: 'Analytics',         tier: 'premium' },
]

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { hydrate, user, isLoading } = useAuthStore()
  const [schoolTier, setSchoolTier] = useState<string>('starter')

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role === 'student') router.replace('/student')
    if (!isLoading && user && user.role === 'parent') router.replace('/parent')
  }, [user, isLoading, router])

  useEffect(() => {
    if (!user) return
    try {
      const token = getToken()
      if (!token) return
      const payload = JSON.parse(atob(token.split('.')[1]))
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/schools/settings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-School-Subdomain': payload.schoolSubdomain ?? '',
          'Content-Type': 'application/json',
        }
      }).then(r => r.json()).then(d => {
        if (d.subscription_tier) setSchoolTier(d.subscription_tier)
      }).catch(() => {})
    } catch {}
  }, [user])

  if (isLoading || !user) return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
    </div>
  )

  function isLocked(item: NavItem): boolean {
    if (!item.tier) return false
    return (TIER_ORDER[schoolTier] ?? 1) < (TIER_ORDER[item.tier] ?? 1)
  }

  function tierLabel(tier: string) {
    return tier === 'premium' ? 'Premium' : 'Growth'
  }

  const tierColor = schoolTier === 'premium' ? '#7e22ce' : schoolTier === 'growth' ? '#1e40af' : '#0f4a32'
  const tierBg = schoolTier === 'premium' ? '#f5f3ff' : schoolTier === 'growth' ? '#eff6ff' : '#e8f5ee'

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sideTop}>
          {/* Brand */}
          <div className={styles.brand}>
            <div className={styles.logo}>E</div>
            <div>
              <div className={styles.appName}>Examify</div>
              <div className={styles.schoolName}>{(user as any)?.school?.name ?? ''}</div>
            </div>
          </div>
          {/* Tier badge */}
          <div style={{ marginTop: '-1rem' }}>
            <span style={{ display: 'inline-block', padding: '0.2rem 0.75rem', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: tierBg, color: tierColor, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
              {schoolTier} plan
            </span>
          </div>
          {/* Nav */}
          <nav className={styles.nav}>
            {NAV.map(item => {
              const locked = isLocked(item)
              const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
              if (locked) {
                return (
                  <div key={item.href}
                    onClick={() => alert(`${item.label} requires the ${tierLabel(item.tier!)} plan.\n\nPlease contact support to upgrade your subscription.`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.75rem', borderRadius: '8px', cursor: 'pointer', opacity: 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>
                      {tierLabel(item.tier!)}
                    </span>
                  </div>
                )
              }
              return (
                <Link key={item.href} href={item.href}
                  className={`${styles.navItem} ${active ? styles.navActive : ''}`}>
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        {/* Bottom user info + logout */}
        <div className={styles.sideBottom}>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{user?.fullName?.[0] ?? 'A'}</div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user?.fullName ?? 'Admin'}</div>
              <div className={styles.userRole}>{user?.role}</div>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={() => {
            useAuthStore.getState().logout()
            window.location.href = '/login'
          }}>
            Log out
          </button>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  )
}