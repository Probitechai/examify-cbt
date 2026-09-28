'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader } from '@/components/finance/ui'
import { AuditLog } from '@/components/finance/reports'

export default function ActivityLogPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'bursar') }, [])
  return (
    <div style={S.page}>
      <PageHeader title="My Activity Log" subtitle="Everything you have done in the fee system. Entries can't be edited or deleted." />
      <AuditLog showActorFilter={false} />
    </div>
  )
}
