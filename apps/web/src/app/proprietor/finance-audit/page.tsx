'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader } from '@/components/finance/ui'
import { AuditLog } from '@/components/finance/reports'

export default function ProprietorFinanceAuditPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  return (
    <div style={S.page}>
      <PageHeader title="Finance Audit Log" subtitle="Every change to fee records, by anyone. Entries can't be edited or deleted. Highlighted rows were done under emergency access." />
      <AuditLog showActorFilter={true} />
    </div>
  )
}
