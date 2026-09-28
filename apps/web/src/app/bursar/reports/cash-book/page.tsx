'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { S, PageHeader } from '@/components/finance/ui'
import { CashBook } from '@/components/finance/reports'

export default function CashBookPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'bursar') }, [])
  return (
    <div style={S.page}>
      <PageHeader title="Cash Book" subtitle="Every receipt issued in a date range. Reversed receipts stay listed, struck through." />
      <CashBook />
    </div>
  )
}
