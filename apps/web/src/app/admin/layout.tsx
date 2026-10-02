'use client'
import { useEffect, useState } from 'react'
import { usePlan, hasFeature, featureForPath, PlanGate } from '@/lib/plan'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../hooks/useAuth'
import { ROLE_HOME } from '@/lib/auth'
import { useTeaching } from '@/lib/teaching'
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
  { href: '/admin/timetable2',     icon: '📅', label: 'Class Timetable',    group: 'academics' },
  { href: '/admin/gradebook',      icon: '📊', label: 'Gradebook',          tier: 'standard', group: 'academics' },
  { href: '/admin/learning-paths', icon: '🗺️', label: 'Learning Paths',    tier: 'premium', group: 'academics' },
  { href: '/admin/live-classes',   icon: '🎥', label: 'Live Classes',       tier: 'standard', group: 'academics' },

  { href: '/admin/qbank',         icon: '❓', label: 'Question Bank',    group: 'cbt' },
  { href: '/admin/exams',         icon: '📋', label: 'Exams Management', group: 'cbt' },
  { href: '/admin/timetable',     icon: '📝', label: 'Exam Timetable',   tier: 'standard', group: 'cbt' },
  { href: '/admin/results',       icon: '📈', label: 'Exam Results',     group: 'cbt' },
  { href: '/admin/jamb-progress', icon: '🎯', label: 'JAMB Progress (SS3)', group: 'cbt' },

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

  { href: '/admin/fees',          icon: '💰', label: 'Fee Management',    group: 'finance' },
  { href: '/admin/fee-approvals', icon: '✅', label: 'Fee Approvals',     group: 'finance' },
  { href: '/admin/subscription',  icon: '💳', label: 'Subscription',      group: 'finance' },

  { href: '/admin/announcements', icon: '📢', label: 'Announcements',     group: 'communication' },

  { href: '/admin/hostels',           icon: '🏠', label: 'Hostel Management',    tier: 'standard', group: 'operations' },
  { href: '/admin/hostel-operations', icon: '📋', label: 'Hostel Operations',    tier: 'premium', group: 'operations' },
  { href: '/admin/transport',         icon: '🚌', label: 'Transport',            tier: 'standard', group: 'operations' },
  { href: '/admin/transport-ops',     icon: '📋', label: 'Transport Operations', tier: 'premium', group: 'operations' },

  { href: '/admin/certificates',  icon: '🏆', label: 'Certificates',      tier: 'standard', group: 'recognition' },

  { href: '/admin/analytics',     icon: '📊', label: 'School Analytics',  tier: 'premium', group: 'analytics' },
]

// Pages only the School Admin uses. Teachers don't see them in the menu, and
// opening one directly shows a short notice instead of the page.
const ADMIN_ONLY = [
  '/admin/settings', '/admin/sessions', '/admin/users', '/admin/students', '/admin/admissions',
  '/admin/fees', '/admin/fee-approvals', '/admin/subscription', '/admin/approvals', '/admin/result-config',
  '/admin/hostels', '/admin/hostel-operations', '/admin/transport', '/admin/transport-ops',
  '/admin/analytics', '/admin/questions2',
]
function adminOnly(path: string) {
  return ADMIN_ONLY.some(p => path === p || path.startsWith(p + '/'))
}
// Menu names that read better for a teacher
const TEACHER_LABELS: Record<string, string> = { '/admin/teacher-assignments': 'My Classes' }

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  

   const router = useRouter()
  const pathname = usePathname()
  const { hydrate, user, isLoading } = useAuthStore()
  const [schoolTier, setSchoolTier] = useState<string>('basic')
  const plan = usePlan()
  const teaching = useTeaching()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {

    if (isLoading) return
    if (!user) { router.replace('/login'); return }
    // Allow-list: every other role is sent to its own portal
    if (!['school_admin', 'teacher'].includes(user.role)) router.replace(ROLE_HOME[user.role] ?? '/login')
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
  const isTeacher = user?.role === 'teacher'
  // A teacher's menu: no admin-only pages; the broadsheet only for class teachers
  const nav = !isTeacher ? NAV : NAV.filter(item => {
    if (adminOnly(item.href)) return false
    if (item.href === '/admin/broadsheet') return teaching.loaded && teaching.classTeacherOf.length > 0
    return true
  }).map(item => TEACHER_LABELS[item.href] ? { ...item, label: TEACHER_LABELS[item.href] } : item)
  const blocked = isTeacher && adminOnly(pathname)

  if (isLoading || !user) return (
    <div className={styles.loading}>
      <div className={styles.spinner} />
    </div>
  )

  // Locks come from the plan table the API enforces; item.tier is only the fallback label
  function isLocked(item: NavItem): boolean {
    const f = featureForPath(item.href)
    if (f && plan.loaded) return !hasFeature(plan, f)
    if (!item.tier) return false
    return (TIER_ORDER[schoolTier] ?? 1) < (TIER_ORDER[item.tier] ?? 1)
  }
  function lockLabel(item: NavItem) {
    const f = featureForPath(item.href)
    return tierLabel((f && plan.featureTiers[f]) || item.tier || 'basic')
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
              return nav.map(item => {
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
                    onClick={() => router.push(item.href)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.75rem', borderRadius: '8px', cursor: 'pointer', opacity: 0.5, ...indent }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className={styles.navIcon}>{item.icon}</span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.label}</span>
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: 10, background: '#fef3c7', color: '#92400e' }}>
                      {lockLabel(item)}
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
      <main className={styles.main}>
        {blocked ? (
          <div style={{ padding: '3rem 1.5rem', maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
            <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🔒</p>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}>This page is for the School Admin</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Your teacher account can&apos;t open it. If you need something here, please ask your School Admin.</p>
            <Link href="/admin" style={{ padding: '0.6rem 1.25rem', background: '#1a6b4a', color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>Back to overview</Link>
          </div>
        ) : (
          <PlanGate pathname={pathname} upgradeHref={user.role === 'school_admin' ? '/admin/subscription' : undefined}>{children}</PlanGate>
        )}
      </main>
    </div>
  )
}

