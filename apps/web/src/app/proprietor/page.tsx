'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../../hooks/useAuth'

const API = process.env.NEXT_PUBLIC_API_URL

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  basic: { label: 'Basic', color: '#1a6b4a', bg: '#e8f5ee' },
  standard: { label: 'Standard', color: '#1e40af', bg: '#eff6ff' },
  premium: { label: 'Premium', color: '#7e22ce', bg: '#f5f3ff' },
  enterprise: { label: 'Enterprise', color: '#d97706', bg: '#fffbeb' },
}

interface Snapshot {
  totalStudents: number
  enrollmentByClass: { classLevel: string; count: number }[]
  totalTeachers: number
  subscriptionTier: string
  schoolActive: boolean
  schoolSince: string | null
}
interface TermTrend {
  termId: string
  termLabel: string
  feesExpected: number
  feesCollected: number
  avgScore: number | null
  passRate: number | null
  attendanceRate: number | null
}

export default function ProprietorOverview() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [trends, setTrends] = useState<TermTrend[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { checkAuth(router, 'proprietor') }, [])

  useEffect(() => {
    apiFetch(`${API}/proprietor/dashboard`)
      .then(res => res.json())
      .then(d => {
        setSnapshot(d.snapshot ?? null)
        setTrends(d.trends ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui', color: '#6b6b65' }}>Loading dashboard…</div>
  }
  if (!snapshot) {
    return <div style={{ padding: '3rem', textAlign: 'center' as const, fontFamily: 'system-ui', color: '#dc2626' }}>Failed to load dashboard data.</div>
  }

  const tierCfg = TIER_CONFIG[snapshot.subscriptionTier] ?? TIER_CONFIG.basic
  const maxFees = Math.max(...trends.map(t => t.feesExpected), 1)

  const card = { background: 'white', borderRadius: 14, padding: '1.25rem 1.5rem', border: '1px solid #e5e5e0' }
  const chartCard = { ...card, marginBottom: '1.5rem' }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>
          Welcome, {user?.fullName}
        </h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>{user?.school?.name} — Executive Overview</p>
      </div>

      {/* Snapshot cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <div style={card}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Enrollment</p>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1a6b4a', marginBottom: '0.5rem' }}>{snapshot.totalStudents.toLocaleString()}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '0.375rem' }}>
            {snapshot.enrollmentByClass.map(e => (
              <span key={e.classLevel} style={{ fontSize: '0.68rem', color: '#6b6b65', background: '#f7f7f5', padding: '0.15rem 0.5rem', borderRadius: 20 }}>
                {e.classLevel}: {e.count}
              </span>
            ))}
          </div>
        </div>

        <div style={card}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Teaching Staff</p>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e40af' }}>{snapshot.totalTeachers.toLocaleString()}</p>
          <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.5rem' }}>active teachers</p>
        </div>

        <div style={card}>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Subscription</p>
          <span style={{ display: 'inline-block', fontSize: '0.9rem', fontWeight: 700, padding: '0.25rem 0.75rem', borderRadius: 20, background: tierCfg.bg, color: tierCfg.color, marginBottom: '0.5rem' }}>
            {tierCfg.label}
          </span>
          <p style={{ fontSize: '0.72rem', color: snapshot.schoolActive ? '#1a6b4a' : '#dc2626' }}>
            {snapshot.schoolActive ? '● Active' : '● Inactive'}
          </p>
        </div>
      </div>

      {trends.length === 0 ? (
        <div style={{ ...card, textAlign: 'center' as const, padding: '3rem' }}>
          <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>No term data yet to show trends.</p>
        </div>
      ) : (
        <>
          {/* Fee collection trend */}
          <div style={chartCard}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Fee collection by term</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 140 }}>
              {trends.map(t => {
                const collectedPct = t.feesExpected > 0 ? (t.feesCollected / t.feesExpected) * 100 : 0
                return (
                  <div key={t.termId} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '100%', position: 'relative' as const, height: 100, background: '#f0f0ee', borderRadius: '4px 4px 0 0', display: 'flex', alignItems: 'flex-end' }}>
                      <div style={{ width: '100%', height: `${Math.max((t.feesExpected / maxFees) * 100, 4)}%`, background: '#e5e5e0', borderRadius: '4px 4px 0 0', position: 'relative' as const }}>
                        <div style={{ position: 'absolute' as const, bottom: 0, width: '100%', height: `${collectedPct}%`, background: '#1a6b4a', borderRadius: '4px 4px 0 0' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.68rem', color: '#1a6b4a', fontWeight: 700 }}>{Math.round(collectedPct)}%</span>
                    <span style={{ fontSize: '0.62rem', color: '#a0a09a', textAlign: 'center' as const }}>{t.termLabel}</span>
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: '0.68rem', color: '#a0a09a', marginTop: '0.75rem' }}>Dark green = collected, light grey = total expected</p>
          </div>

          {/* Academic performance trend */}
          <div style={chartCard}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Academic performance by term</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 140 }}>
              {trends.map(t => (
                <div key={t.termId} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '100%', display: 'flex', gap: '0.25rem', alignItems: 'flex-end', height: 100 }}>
                    <div style={{ flex: 1, height: `${Math.max(t.avgScore ?? 0, 2)}%`, background: '#1e40af', borderRadius: '4px 4px 0 0' }} title={`Avg score: ${t.avgScore ?? 'N/A'}`} />
                    <div style={{ flex: 1, height: `${Math.max(t.passRate ?? 0, 2)}%`, background: '#7e22ce', borderRadius: '4px 4px 0 0' }} title={`Pass rate: ${t.passRate ?? 'N/A'}`} />
                  </div>
                  <span style={{ fontSize: '0.62rem', color: '#a0a09a', textAlign: 'center' as const }}>{t.termLabel}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.68rem', color: '#1e40af' }}>■ Avg. score %</span>
              <span style={{ fontSize: '0.68rem', color: '#7e22ce' }}>■ Pass rate %</span>
            </div>
          </div>

          {/* Attendance trend */}
          <div style={chartCard}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>Attendance rate by term</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 140 }}>
              {trends.map(t => (
                <div key={t.termId} style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '100%', height: 100, display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${Math.max(t.attendanceRate ?? 0, 2)}%`, background: '#d97706', borderRadius: '4px 4px 0 0' }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 700 }}>{t.attendanceRate != null ? `${t.attendanceRate}%` : 'N/A'}</span>
                  <span style={{ fontSize: '0.62rem', color: '#a0a09a', textAlign: 'center' as const }}>{t.termLabel}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}