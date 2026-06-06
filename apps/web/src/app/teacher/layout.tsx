'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../hooks/useAuth'
import styles from './teacher.layout.module.css'

const NAV = [
  { href: '/teacher',           icon: 'ti-layout-dashboard', label: 'My classes'     },
  { href: '/teacher/questions', icon: 'ti-clipboard-list',   label: 'Question bank'  },
  { href: '/teacher/exams',     icon: 'ti-calendar-event',   label: 'Exams'          },
  { href: '/teacher/results',   icon: 'ti-chart-bar',        label: 'Results'        },
]

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
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
              const active = item.href === '/teacher'
                ? pathname === '/teacher'
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navActive : ''}`}
                >
                  <i className={`ti ${item.icon}`} aria-hidden="true" />
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
              <p className={styles.userRole}>Teacher</p>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={() => { logout(); router.push('/login') }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
