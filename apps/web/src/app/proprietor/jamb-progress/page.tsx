'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { JambCohort } from '@/components/jamb/cohort'

export default function JambProgressPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'proprietor') }, [])
  return <JambCohort />
}
