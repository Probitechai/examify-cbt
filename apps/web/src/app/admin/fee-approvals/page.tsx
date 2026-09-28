'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { ApprovalsPanel } from '@/components/finance/approvals'

// Used when the school has no active Proprietor: the School Admin approves
// waivers above the threshold and payment reversals (never their own requests).
export default function AdminFeeApprovalsPage() {
  const router = useRouter()
  useEffect(() => { checkAuth(router, 'school_admin') }, [])
  return <ApprovalsPanel />
}
