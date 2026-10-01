'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader } from '@/components/finance/ui'
import { CollectionSummary, Debtors, CashBook, ByItem } from '@/components/finance/reports'
import { usePlan, hasFeature } from '@/lib/plan'

const TABS = [
  { key: 'summary', label: '📊 Collection' },  // every plan; the rest are Standard finance reports
  { key: 'debtors', label: '⚠️ Debtors' },
  { key: 'cashbook', label: '📘 Cash Book' },
  { key: 'items', label: '🗂️ By Fee Item' },
] as const

export default function ProprietorFinancePage() {
  const router = useRouter()
  const [tab, setTab] = useState<typeof TABS[number]['key']>('summary')
  const plan = usePlan()
  const reports = hasFeature(plan, 'financeControls')
  useEffect(() => { checkAuth(router, 'proprietor') }, [])

  return (
    <div style={S.page}>
      <PageHeader title="Finance Overview" subtitle={reports ? 'Read-only view of fees, collections and balances. Your Bursar manages the records.' : 'Read-only view of fee collections. Your School Admin manages fee records. Debtors, the cash book and reports by fee item come with the Standard plan.'} />
      <div style={{ display: 'flex', background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden', marginBottom: '1.25rem', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.filter(x => x.key === 'summary' || reports).map(x => (
          <button key={x.key} onClick={() => setTab(x.key)}
            style={{ padding: '0.7rem 1.25rem', fontSize: '0.86rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: tab === x.key ? '#1a6b4a' : 'transparent', color: tab === x.key ? 'white' : '#6b6b65' }}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'summary' && <CollectionSummary />}
      {tab === 'debtors' && reports && <Debtors canWrite={false} />}
      {tab === 'cashbook' && reports && <CashBook />}
      {tab === 'items' && reports && <ByItem />}
    </div>
  )
}
