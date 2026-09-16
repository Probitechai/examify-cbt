'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../hooks/useAuth'
import styles from './admin.layout.module.css'

const TIER_ORDER: Record<string, number> = { basic: 1, standard: 2, premium: 3, enterprise: 4 }

interface NavItem {
  href: string
  icon: string
  label: string
  tier?: 'basic' | 'standard' | 'premium' | 'enterprise'
  group?: string
}

const GROUP_LABELS: Record<string, string> = {
  academics: '🗓️ ACADEMICS',
  cbt: '📝 ASSESSMENT',
  results: '📊 RESULTS',
  attendance: '📋 ATTENDANCE & CONDUCT',
  people: '👥 PEOPLE',
  finance: '💰 FINANCE',
  communication: '📢 COMMUNICATION',
  operations: '🚌 OPERATIONS',
  recognition: '🏆 RECOGNITION',
  analytics: '📈 ANALYTICS',
}

const NAV: NavItem[] = [
  { href: '/admin',               icon: '◦',  label: 'Overview' },
  { href: '/admin/settings',      icon: '⚙️', label: 'School Settings' },

  { href: '/admin/sessions',       icon: '📆', label: 'Academic Sessions',  group: 'academics' },
  { href: '/admin/curriculum',     icon: '📚', label: 'Curriculum',         tier: 'standard', group: 'academics' },
  { href: '/admin/lessons',        icon: '📖', label: 'Lesson Plans',       tier: 'standard', group: 'academics' },
  { href: '/admin/timetable2',     icon: '📅', label: 'Class Timetable',    tier: 'standard', group: 'academics' },
  { href: '/admin/gradebook',      icon: '📊', label: 'Gradebook',          tier: 'standard', group: 'academics' },
  { href: '/admin/learning-paths', icon: '🗺️', label: 'Learning Paths',    tier: 'standard', group: 'academics' },
  { href: '/admin/live-classes',   icon: '🎥', label: 'Live Classes',       tier: 'standard', group: 'academics' },

  { href: '/admin/qbank',         icon: '❓', label: 'Question Bank',    group: 'cbt' },
  { href: '/admin/exams',         icon: '📋', label: 'Exams Management', group: 'cbt' },
  { href: '/admin/timetable',     icon: '📝', label: 'Exam Timetable',   group: 'cbt' },
  { href: '/admin/results',       icon: '📈', label: 'Exam Results',     group: 'cbt' },

  { href: '/admin/results2',      icon: '📝', label: 'Result Entry',      group: 'results' },
  { href: '/admin/approvals',     icon: '✅', label: 'Result Approval',   tier: 'standard', group: 'results' },
  { href: '/admin/broadsheet',    icon: '📊', label: 'Broadsheet',        group: 'results' },
  { href: '/admin/report-card',   icon: '🎓', label: 'Report Card',       group: 'results' },

  { href: '/admin/attendance',    icon: '📋', label: 'Attendance',        group: 'attendance' },
  { href: '/admin/conduct',       icon: '📝', label: 'Conduct Reports',   tier: 'standard', group: 'attendance' },

  { href: '/admin/users',         icon: '👥', label: 'Students & Staff',  group: 'people' },
  { href: '/admin/users/import',  icon: '📥', label: 'Import Students',   group: 'people' },
  { href: '/admin/admissions',    icon: '🎓', label: 'Admissions',        tier: 'premium', group: 'people' },
  { href: '/admin/teacher-assignments', icon: '📌', label: 'Teacher Assignments', group: 'people' },

  { href: '/admin/fees',          icon: '💰', label: 'Fee Management',    tier: 'standard', group: 'finance' },
  { href: '/admin/subscription',  icon: '💳', label: 'Subscription',      group: 'finance' },

  { href: '/admin/announcements', icon: '📢', label: 'Announcements',     tier: 'standard', group: 'communication' },

  { href: '/admin/hostels',           icon: '🏠', label: 'Hostel Management',    tier: 'standard', group: 'operations' },
  { href: '/admin/hostel-operations', icon: '📋', label: 'Hostel Operations',    tier: 'premium', group: 'operations' },
  { href: '/admin/transport',         icon: '🚌', label: 'Transport',            tier: 'standard', group: 'operations' },
  { href: '/admin/transport-ops',     icon: '📋', label: 'Transport Operations', tier: 'premium', group: 'operations' },

  { href: '/admin/certificates',  icon: '🏆', label: 'Certificates',      tier: 'standard', group: 'recognition' },

  { href: '/admin/analytics',     icon: '📊', label: 'Analytics',         tier: 'premium', group: 'analytics' },
]

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  

   const router = useRouter()
  const pathname = usePathname()
  const { hydrate, user, isLoading } = useAuthStore()
  const [schoolTier, setSchoolTier] = useState<string>('basic')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {

    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role === 'student') router.replace('/student')
    if (!isLoading && user && user.role === 'parent') router.replace('/parent')
  }, [user, isLoading])

   useEffect(() => {

    if (!user) return
    try {
      const token = getToken()
      if (!token) { console.warn('[TIER FETCH] No token found at effect run time'); return }
      const payload = JSON.parse(atob(token.split('.')[1]))
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/schools/settings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-School-Subdomain': payload.schoolSubdomain ?? '',
          'Content-Type': 'application/json',
        }
      }).then(r => r.json()).then(d => {
        if (d.subscription_tier) setSchoolTier(d.subscription_tier)
      }).catch(err => console.error('[TIER FETCH] Failed:', err))
    } catch (err) {
      console.error('[TIER FETCH] Exception before fetch:', err)
    }
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
    if (tier === 'enterprise') return 'Enterprise'
    if (tier === 'premium') return 'Premium'
    if (tier === 'standard') return 'Standard'
    return 'Basic'
  }

  const tierColor = schoolTier === 'enterprise' ? '#b45309' : schoolTier === 'premium' ? '#7e22ce' : schoolTier === 'standard' ? '#1e40af' : '#0f4a32'
  const tierBg = schoolTier === 'enterprise' ? '#fffbeb' : schoolTier === 'premium' ? '#f5f3ff' : schoolTier === 'standard' ? '#eff6ff' : '#e8f5ee'

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sideTop}>
          {/* Brand */}
          <div className={styles.brand}>
            <div className={styles.logo}>E</div>
            <div>
              <div className={styles.appName}>Examify by Navura</div>
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
            {(() => {
              let lastGroup: string | undefined
              return NAV.map(item => {
                const isGroupStart = !!item.group && item.group !== lastGroup
                lastGroup = item.group
                const open = item.group ? (openGroups[item.group] ?? true) : true

                if (item.group && !isGroupStart && !open) return null

                const indent = item.group ? { paddingLeft: '1.75rem' } : {}
                const groupKey = item.group as string

                const header = isGroupStart ? (
                  <div key={`group-${groupKey}`}
                    onClick={() => setOpenGroups(prev => ({ ...prev, [groupKey]: !open }))}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.75rem', marginTop: '0.5rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    <span>{GROUP_LABELS[groupKey]}</span>
                    <span style={{ fontSize: '0.7rem' }}>{open ? '▾' : '▸'}</span>
                  </div>
                ) : null

                if (item.group && !open) {
                  return <div key={`wrap-${item.href}`}>{header}</div>
                }

                const locked = isLocked(item)
                const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))

                const navElement = locked ? (
                  <div key={item.href}
                    onClick={() => alert(`${item.label} requires the ${tierLabel(item.tier!)} plan.\n\nPlease contact support to upgrade your subscription.`)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.75rem', borderRadius: '8px', cursor: 'pointer', opacity: 0.5, ...indent }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>
                      {tierLabel(item.tier!)}
                    </span>
                  </div>
                ) : (
                  <Link key={item.href} href={item.href} style={indent}
                    className={`${styles.navItem} ${active ? styles.navActive : ''}`}>
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                )

                return header ? <div key={`wrap-${item.href}`}>{header}{navElement}</div> : navElement
              })
            })()}
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

