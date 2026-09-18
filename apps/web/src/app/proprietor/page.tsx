'use client'
import { checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuthStore } from '../../hooks/useAuth'

export default function ProprietorOverview() {
  const router = useRouter()
  const { user } = useAuthStore()

  useEffect(() => { checkAuth(router, 'proprietor') }, [])

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>
        Welcome, {user?.fullName}
      </h1>
      <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>
        Your executive dashboard is on the way — enrollment, fee collection, academic performance trends, and subscription status will appear here shortly.
      </p>
    </div>
  )
}