'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { SchoolSettlements } from '@/components/finance/settlements'

export default function SettlementsPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  return <SchoolSettlements />
}
