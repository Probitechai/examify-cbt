'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader, useFinanceAccess, AccessBanner } from '@/components/finance/ui'
import { Debtors } from '@/components/finance/reports'

export default function DebtorsPage() {
  const router = useRouter()
  const { access, readOnly } = useFinanceAccess()
  useEffect(() => { checkAuth(router, 'bursar') }, [])
  return (
    <div style={S.page}>
      <PageHeader title="Debtors" subtitle="Students with an outstanding balance, after payments and approved waivers." />
      <AccessBanner access={access} />
      <Debtors canWrite={!readOnly} />
    </div>
  )
}
