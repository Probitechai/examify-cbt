'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { useAuthStore } from '@/hooks/useAuth'
import { call, money, today, daysAgo, S, Stat, StatGrid, Banner, PageHeader, useTerms } from '@/components/finance/ui'

export default function BursarOverview() {
  const router = useRouter()
  const { user } = useAuthStore()
  const t = useTerms()
  const [todayTotals, setTodayTotals] = useState<any>(null)
  const [term, setTerm] = useState({ expected: 0, collected: 0, outstanding: 0 })
  const [pending, setPending] = useState({ reversals: 0, waivers: 0 })
  const [recon, setRecon] = useState<{ missed: number; error: string | null } | null>(null)

  useEffect(() => { checkAuth(router, 'bursar') }, [])

  useEffect(() => {
    const d = today()
    call(`/finance/reports/cash-book?from=${d}&to=${d}`).then(r => setTodayTotals({ ...r.data.totals, count: (r.data.rows ?? []).length }))
    call('/finance/reversals?status=pending').then(r => setPending(p => ({ ...p, reversals: (r.data.reversals ?? []).length })))
    call('/finance/waivers?status=pending').then(r => setPending(p => ({ ...p, waivers: (r.data.waivers ?? []).length })))
    call(`/finance/reconciliation?from=${daysAgo(7)}&to=${d}`).then(r => {
      if (r.ok) setRecon({ missed: (r.data.missedWebhooks ?? []).length, error: r.data.paystackError })
    })
  }, [])

  useEffect(() => {
    if (!t.termId) return
    call(`/fees/summary?termId=${t.termId}`).then(r => {
      const rows = r.data.summary ?? []
      setTerm(rows.reduce((a: any, x: any) => ({
        expected: a.expected + Number(x.total_expected),
        collected: a.collected + Number(x.total_collected),
        outstanding: a.outstanding + Number(x.total_outstanding),
      }), { expected: 0, collected: 0, outstanding: 0 }))
    })
  }, [t.termId])

  const rate = term.expected > 0 ? Math.round(term.collected / term.expected * 100) : 0
  const activeTerm = t.terms.find(x => x.id === t.termId)

  return (
    <div style={S.page}>
      <PageHeader title={`Welcome, ${user?.fullName?.split(' ')[0] ?? 'Bursar'}`} subtitle="Fees at a glance for your school." />

      {recon && recon.missed > 0 && (
        <Banner tone="warning">
          <strong>{recon.missed} Paystack payment{recon.missed > 1 ? 's' : ''}</strong> from the last 7 days {recon.missed > 1 ? 'are' : 'is'} not yet on a receipt.{' '}
          <Link href="/bursar/reconciliation" style={{ color: '#92400e', fontWeight: 600 }}>Review in Reconciliation →</Link>
        </Banner>
      )}

      <StatGrid>
        <Stat label="Collected today" value={money(todayTotals?.net ?? 0)} hint={todayTotals ? `${todayTotals.count} receipt${todayTotals.count === 1 ? '' : 's'}` : '…'} />
        <Stat label={`Collected · ${activeTerm?.name ?? 'term'}`} value={money(term.collected)} hint={`${rate}% of ${money(term.expected)}`} />
        <Stat label="Outstanding this term" value={money(term.outstanding)} tone={term.outstanding > 0 ? 'warning' : 'default'} />
        <Stat label="Awaiting approval" value={pending.reversals + pending.waivers}
          hint={`${pending.waivers} waiver${pending.waivers === 1 ? '' : 's'} · ${pending.reversals} reversal${pending.reversals === 1 ? '' : 's'}`} />
      </StatGrid>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {[
          { href: '/bursar/record-payment', icon: '💵', title: 'Record a payment', text: 'Cash, transfer, POS or cheque — prints a receipt.' },
          { href: '/bursar/debtors', icon: '⚠️', title: 'Who owes', text: 'Balances by student, with SMS reminders.' },
          { href: '/bursar/waivers', icon: '🏷️', title: 'Discounts & waivers', text: 'Scholarships, sibling and staff discounts.' },
          { href: '/bursar/reports/cash-book', icon: '📘', title: 'Cash book', text: 'Every receipt in a date range.' },
        ].map(c => (
          <Link key={c.href} href={c.href} style={{ ...S.card, textDecoration: 'none', color: 'inherit', marginBottom: 0 }}>
            <p style={{ fontSize: '1.3rem', marginBottom: '0.4rem' }}>{c.icon}</p>
            <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.2rem' }}>{c.title}</p>
            <p style={{ fontSize: '0.8rem', color: '#6b6b65' }}>{c.text}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
