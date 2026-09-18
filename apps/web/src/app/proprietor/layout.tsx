'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../hooks/useAuth'

const NAV = [
  { href: '/proprietor', icon: '📊', label: 'Overview' },
  { href: '/proprietor/subscription', icon: '💳', label: 'Subscription & Billing' },
]

export default function ProprietorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading, hydrate, logout } = useAuthStore()

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
    if (!isLoading && user && user.role === 'student') router.replace('/student')
    if (!isLoading && user && user.role === 'parent') router.replace('/parent')
  }, [user, isLoading, router])

  if (isLoading || !user) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <p style={{ color: '#6b6b65' }}>Loading…</p>
    </div>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <aside style={{ width: 240, background: 'white', borderRight: '1px solid #e5e5e0', display: 'flex', flexDirection: 'column' as const, padding: '1.25rem 0' }}>
        <div style={{ padding: '0 1.25rem 1.25rem', borderBottom: '1px solid #f0f0ee', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: '#1a6b4a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>E</span>
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a1a18' }}>Examify by Navura</p>
              <p style={{ fontSize: '0.68rem', color: '#6b6b65' }}>{user.school?.name}</p>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '0 0.75rem', display: 'flex', flexDirection: 'column' as const, gap: '0.25rem' }}>
          {NAV.map(item => {
            const active = pathname === item.href
            return (
              <Link key={item.href} href={item.href}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.75rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500, background: active ? '#e8f5ee' : 'transparent', color: active ? '#0f4a32' : '#3a3a36' }}>
                <span>{item.icon}</span><span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div style={{ padding: '1rem 1.25rem 0', borderTop: '1px solid #f0f0ee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b6b65' }}>{user.fullName?.charAt(0)}</span>
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1a1a18' }}>{user.fullName}</p>
              <p style={{ fontSize: '0.68rem', color: '#6b6b65' }}>Proprietor</p>
            </div>
          </div>
          <button onClick={() => { logout(); router.push('/login') }}
            style={{ width: '100%', padding: '0.5rem', background: '#f7f7f5', border: '1px solid #e5e5e0', borderRadius: 8, fontSize: '0.78rem', color: '#6b6b65', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, background: '#f7f7f5', overflowY: 'auto' as const }}>{children}</main>
    </div>
  )
}