'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader } from '@/components/finance/ui'
import { ByItem } from '@/components/finance/reports'

export default function ByItemPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'bursar') }, [])
  return (
    <div style={S.page}>
      <PageHeader title="By Fee Item" subtitle="How much of each fee item has been collected." />
      <ByItem />
    </div>
  )
}
