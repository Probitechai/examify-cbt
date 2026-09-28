'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '../../hooks/useAuth'
import { ROLE_HOME } from '@/lib/auth'

const NAV = [
  { href: '/bursar', icon: '📊', label: 'Overview' },
  { href: '/bursar/fee-structures', icon: '🧾', label: 'Fee Structures', group: 'billing' },
  { href: '/bursar/waivers', icon: '🏷️', label: 'Discounts & Waivers', group: 'billing' },
  { href: '/bursar/record-payment', icon: '💵', label: 'Record Payment', group: 'collections' },
  { href: '/bursar/ledger', icon: '📒', label: 'Fee Ledger', group: 'collections' },
  { href: '/bursar/debtors', icon: '⚠️', label: 'Debtors', group: 'collections' },
  { href: '/bursar/reversals', icon: '↩️', label: 'Reversals', group: 'collections' },
  { href: '/bursar/reconciliation', icon: '🔁', label: 'Paystack Reconciliation', group: 'collections' },
  { href: '/bursar/reports/collection', icon: '📈', label: 'Collection Summary', group: 'reports' },
  { href: '/bursar/reports/cash-book', icon: '📘', label: 'Cash Book', group: 'reports' },
  { href: '/bursar/reports/by-item', icon: '🗂️', label: 'By Fee Item', group: 'reports' },
  { href: '/bursar/audit-log', icon: '🔍', label: 'My Activity Log', group: 'reports' },
]

const GROUP_LABELS: Record<string, string> = {
  billing: '🧾 BILLING',
  collections: '💰 COLLECTIONS',
  reports: '📊 REPORTS',
}

export default function BursarLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading, hydrate, logout } = useAuthStore()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (isLoading) return
    if (!user) { router.replace('/login'); return }
    // Allow-list: every other role is sent to its own portal
    if (user.role !== 'bursar') router.replace(ROLE_HOME[user.role] ?? '/login')
  }, [user, isLoading, router])

  if (isLoading || !user || user.role !== 'bursar') {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <p style={{ color: '#6b6b65' }}>Loading…</p>
    </div>
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <aside style={{ width: 240, background: 'white', borderRight: '1px solid #e5e5e0', display: 'flex', flexDirection: 'column' as const, padding: '1.25rem 0', position: 'sticky' as const, top: 0, height: '100vh' }}>
        <div style={{ padding: '0 1.25rem 1.25rem', borderBottom: '1px solid #f0f0ee', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: '#1a6b4a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>E</span>
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1a1a18' }}>Examify by Navura</p>
              <p style={{ fontSize: '0.68rem', color: '#6b6b65' }}>{user.school?.name}</p>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: '0 0.75rem', display: 'flex', flexDirection: 'column' as const, gap: '0.25rem', overflowY: 'auto' as const }}>
          {(() => {
            let lastGroup: string | undefined
            return NAV.map(item => {
              const isGroupStart = !!item.group && item.group !== lastGroup
              lastGroup = item.group
              const open = item.group ? (openGroups[item.group] ?? true) : true

              if (item.group && !isGroupStart && !open) return null

              const indent = item.group ? { paddingLeft: '1.5rem' } : {}
              const groupKey = item.group as string

              const header = isGroupStart ? (
                <div key={`group-${groupKey}`}
                  onClick={() => setOpenGroups(prev => ({ ...prev, [groupKey]: !open }))}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', marginTop: '0.5rem', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                  <span>{GROUP_LABELS[groupKey]}</span>
                  <span style={{ fontSize: '0.65rem' }}>{open ? '▾' : '▸'}</span>
                </div>
              ) : null

              if (item.group && !open) {
                return <div key={`wrap-${item.href}`}>{header}</div>
              }

              const active = pathname === item.href
              const navElement = (
                <Link key={item.href} href={item.href}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.75rem', borderRadius: 8, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 500, background: active ? '#e8f5ee' : 'transparent', color: active ? '#0f4a32' : '#3a3a36', ...indent }}>
                  <span>{item.icon}</span><span>{item.label}</span>
                </Link>
              )

              return header ? <div key={`wrap-${item.href}`}>{header}{navElement}</div> : navElement
            })
          })()}
        </nav>
        <div style={{ padding: '1rem 1.25rem 0', borderTop: '1px solid #f0f0ee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#f0f0ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#6b6b65' }}>{user.fullName?.charAt(0)}</span>
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1a1a18' }}>{user.fullName}</p>
              <p style={{ fontSize: '0.68rem', color: '#6b6b65' }}>Bursar</p>
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
