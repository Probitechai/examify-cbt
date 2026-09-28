'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader } from '@/components/finance/ui'
import { CollectionSummary } from '@/components/finance/reports'

export default function CollectionPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'bursar') }, [])
  return (
    <div style={S.page}>
      <PageHeader title="Collection Summary" subtitle="Expected, collected, waived and outstanding by class for the term." />
      <CollectionSummary />
    </div>
  )
}
