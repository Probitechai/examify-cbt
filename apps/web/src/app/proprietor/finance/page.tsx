'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader } from '@/components/finance/ui'
import { CollectionSummary, Debtors, CashBook, ByItem } from '@/components/finance/reports'

const TABS = [
  { key: 'summary', label: '📊 Collection' },
  { key: 'debtors', label: '⚠️ Debtors' },
  { key: 'cashbook', label: '📘 Cash Book' },
  { key: 'items', label: '🗂️ By Fee Item' },
] as const

export default function ProprietorFinancePage() {
  const router = useRouter()
  const [tab, setTab] = useState<typeof TABS[number]['key']>('summary')
  useEffect(() => { checkAuth(router, 'proprietor') }, [])

  return (
    <div style={S.page}>
      <PageHeader title="Finance Overview" subtitle="Read-only view of fees, collections and balances. Your Bursar manages the records." />
      <div style={{ display: 'flex', background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, overflow: 'hidden', marginBottom: '1.25rem', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(x => (
          <button key={x.key} onClick={() => setTab(x.key)}
            style={{ padding: '0.7rem 1.25rem', fontSize: '0.86rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: tab === x.key ? '#1a6b4a' : 'transparent', color: tab === x.key ? 'white' : '#6b6b65' }}>
            {x.label}
          </button>
        ))}
      </div>
      {tab === 'summary' && <CollectionSummary />}
      {tab === 'debtors' && <Debtors canWrite={false} />}
      {tab === 'cashbook' && <CashBook />}
      {tab === 'items' && <ByItem />}
    </div>
  )
}
