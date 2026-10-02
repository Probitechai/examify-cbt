'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import SchoolAnalytics from '@/components/SchoolAnalytics'

export default function ProprietorAnalyticsPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  return <SchoolAnalytics resultsHref="/proprietor/results" />
}
