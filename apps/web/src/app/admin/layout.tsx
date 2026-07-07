'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../hooks/useAuth'
import styles from './admin.layout.module.css'

const NAV = [
  { href: '/admin',              icon: '▦',  label: 'Overview'        },
  { href: '/admin/settings', icon: '⚙️', label: 'School Settings' },
  { href: '/admin/sessions', icon: '📆', label: 'Academic Sessions' },
  { href: '/admin/fees', icon: '💰', label: 'Fee Management' },
  { href: '/admin/attendance', icon: '📋', label: 'Attendance' },
  { href: '/admin/results2', icon: '📝', label: 'Result Entry' },
  { href: '/admin/broadsheet', icon: '📊', label: 'Broadsheet' },
  { href: '/admin/report-card', icon: '🎓', label: 'Report Card' },
  { href: '/admin/users',        icon: '👥', label: 'Students & Staff' },
  { href: '/admin/users/import', icon: '📥', label: 'Import students'  },
  { href: '/admin/exams',        icon: '📋', label: 'Exams'           },
  { href: '/admin/timetable',    icon: '🗓', label: 'Timetable'       },
  { href: '/admin/qbank',    icon: '❓', label: 'Question bank'   },
  { href: '/admin/results',      icon: '📊', label: 'Results'         },
  { href: '/admin/analytics',    icon: '📈', label: 'Analytics'       },
  { href: '/teacher',            icon: '📝', label: 'Teacher Portal'  },
  
]
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading, hydrate, logout } = useAuthStore()

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role === 'student') router.replace('/student')
  }, [user, isLoading, router])

  if (isLoading || !user) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>
  }

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sideTop}>
          <div className={styles.brand}>
            <span className={styles.logo}>E</span>
            <div>
              <p className={styles.appName}>Examify</p>
              <p className={styles.schoolName}>{user.school.name}</p>
            </div>
          </div>
          <nav className={styles.nav}>
            {NAV.map(item => {
              const active = item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navActive : ''}`}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        <div className={styles.sideBottom}>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{user.fullName.charAt(0)}</div>
            <div className={styles.userInfo}>
              <p className={styles.userName}>{user.fullName}</p>
              <p className={styles.userRole}>{user.role === 'school_admin' ? 'School admin' : 'Teacher'}</p>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
