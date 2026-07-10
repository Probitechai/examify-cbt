'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Overview {
  schools: { total_schools: number; active_schools: number; inactive_schools: number; starter_schools: number; growth_schools: number; premium_schools: number }
  users: { total_students: number; total_teachers: number; total_parents: number; total_admins: number }
  exams: { total_exams: number; active_exams: number; exams_last_30_days: number }
  sessions: { total_sessions: number; completed_sessions: number; in_progress_sessions: number; sessions_last_30_days: number }
  results: { total_results: number; approved_results: number; avg_score: number }
}
interface School {
  id: string
  name: string
  subdomain: string
  is_active: boolean
  subscription_tier: string
  created_at: string
  student_count: number
  teacher_count: number
  parent_count: number
  exam_count: number
  submissions_count: number
  last_activity: string | null
}

const TIER_CONFIG: Record<string, { color: string; bg: string }> = {
  starter: { color: '#1a6b4a', bg: '#e8f5ee' },
  growth: { color: '#1e40af', bg: '#eff6ff' },
  premium: { color: '#7e22ce', bg: '#f5f3ff' },
}

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}
function getSubdomain() {
  try {
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? 'greensprings'
  } catch {}
  return 'greensprings'
}
function hdrs() {
  return { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}
const API = process.env.NEXT_PUBLIC_API_URL

export default function SuperAdminDashboard() {
  const router = useRouter()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'schools'>('overview')
  const [toggling, setToggling] = useState<string | null>(null)
  const [updatingTier, setUpdatingTier] = useState<string | null>(null)

  useEffect(() => {
    // Verify super_admin role
    try {
      const token = getToken()
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.role !== 'super_admin') { router.push('/login'); return }
    } catch { router.push('/login'); return }
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [overviewRes, schoolsRes] = await Promise.all([
        fetch(`${API}/superadmin/overview`, { headers: hdrs() }),
        fetch(`${API}/superadmin/schools`, { headers: hdrs() }),
      ])
      const overviewData = await overviewRes.json()
      const schoolsData = await schoolsRes.json()
      setOverview(overviewData)
      setSchools(schoolsData.schools ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function handleToggleSchool(id: string) {
    setToggling(id)
    try {
      const res = await fetch(`${API}/superadmin/schools/${id}/toggle`, {
        method: 'PATCH', headers: hdrs(), body: '{}'
      })
      const data = await res.json()
      setSchools(prev => prev.map(s => s.id === id ? { ...s, is_active: data.school.is_active } : s))
    } catch {} finally { setToggling(null) }
  }

  async function handleUpdateTier(id: string, tier: string) {
    setUpdatingTier(id)
    try {
      const res = await fetch(`${API}/superadmin/schools/${id}/tier`, {
        method: 'PATCH', headers: hdrs(),
        body: JSON.stringify({ tier })
      })
      const data = await res.json()
      setSchools(prev => prev.map(s => s.id === id ? { ...s, subscription_tier: data.school.subscription_tier } : s))
    } catch {} finally { setUpdatingTier(null) }
  }

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return 'Never'
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    const hours = Math.floor(diff / 3600000)
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</p>
        <p style={{ color: '#6b6b65' }}>Loading platform analytics…</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f4a32 0%, #1a1a18 100%)', padding: '1.25rem 2rem' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginBottom: '0.2rem' }}>Examify Platform</p>
            <h1 style={{ color: 'white', fontSize: '1.25rem', fontWeight: 700 }}>Super Admin Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button onClick={loadData}
              style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'white', fontSize: '0.825rem', cursor: 'pointer' }}>
              🔄 Refresh
            </button>
            <button onClick={() => { document.cookie = 'examify_token=; Max-Age=0; path=/'; router.push('/login') }}
              style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: 'white', fontSize: '0.825rem', cursor: 'pointer' }}>
              Log out
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 2rem' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
          {([
            { key: 'overview', label: '📊 Platform Overview' },
            { key: 'schools', label: '🏫 Schools' },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '0.75rem 1.5rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#0f4a32' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && overview && (
          <>
            {/* Key metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Schools', value: overview.schools.total_schools, sub: `${overview.schools.active_schools} active`, color: '#0f4a32', bg: '#e8f5ee' },
                { label: 'Total Students', value: Number(overview.users.total_students).toLocaleString(), sub: `${overview.users.total_teachers} teachers`, color: '#1e40af', bg: '#eff6ff' },
                { label: 'Exams Created', value: Number(overview.exams.total_exams).toLocaleString(), sub: `${overview.exams.exams_last_30_days} in last 30 days`, color: '#7e22ce', bg: '#f5f3ff' },
                { label: 'Exam Submissions', value: Number(overview.sessions.completed_sessions).toLocaleString(), sub: `${overview.sessions.sessions_last_30_days} in last 30 days`, color: '#d97706', bg: '#fffbeb' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'white', borderRadius: '14px', padding: '1.25rem 1.5rem', border: '1px solid #e5e5e0' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.5rem' }}>{item.label}</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: 800, color: item.color, marginBottom: '0.25rem' }}>{item.value}</p>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{item.sub}</p>
                </div>
              ))}
            </div>

            {/* Secondary metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* School breakdown */}
              <div style={{ background: 'white', borderRadius: '14px', padding: '1.25rem 1.5rem', border: '1px solid #e5e5e0' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Schools by subscription</p>
                {[
                  { tier: 'starter', count: overview.schools.starter_schools },
                  { tier: 'growth', count: overview.schools.growth_schools },
                  { tier: 'premium', count: overview.schools.premium_schools },
                ].map(item => {
                  const cfg = TIER_CONFIG[item.tier]
                  const pct = overview.schools.total_schools > 0 ? Math.round((Number(item.count) / Number(overview.schools.total_schools)) * 100) : 0
                  return (
                    <div key={item.tier} style={{ marginBottom: '0.875rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                        <span style={{ fontSize: '0.825rem', fontWeight: 500, color: cfg.color, textTransform: 'capitalize' as const }}>{item.tier}</span>
                        <span style={{ fontSize: '0.825rem', color: '#6b6b65' }}>{item.count} schools ({pct}%)</span>
                      </div>
                      <div style={{ height: 8, background: '#f0f0ee', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: cfg.color, borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* User breakdown */}
              <div style={{ background: 'white', borderRadius: '14px', padding: '1.25rem 1.5rem', border: '1px solid #e5e5e0' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Users across platform</p>
                {[
                  { label: 'Students', value: overview.users.total_students, color: '#1a6b4a' },
                  { label: 'Teachers', value: overview.users.total_teachers, color: '#1e40af' },
                  { label: 'Parents', value: overview.users.total_parents, color: '#7e22ce' },
                  { label: 'School Admins', value: overview.users.total_admins, color: '#d97706' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f0f0ee' }}>
                    <span style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{item.label}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: item.color }}>{Number(item.value).toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18' }}>Total</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a18' }}>
                    {(Number(overview.users.total_students) + Number(overview.users.total_teachers) + Number(overview.users.total_parents) + Number(overview.users.total_admins)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Results stats */}
            <div style={{ background: 'white', borderRadius: '14px', padding: '1.25rem 1.5rem', border: '1px solid #e5e5e0' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Academic performance across platform</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {[
                  { label: 'Results entered', value: Number(overview.results.total_results).toLocaleString(), color: '#1a1a18' },
                  { label: 'Approved results', value: Number(overview.results.approved_results).toLocaleString(), color: '#1a6b4a' },
                  { label: 'Platform avg score', value: overview.results.avg_score ? `${Number(overview.results.avg_score).toFixed(1)}%` : 'N/A', color: '#1e40af' },
                ].map((item, i) => (
                  <div key={i} style={{ background: '#f7f7f5', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.375rem' }}>{item.label}</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, color: item.color }}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* SCHOOLS TAB */}
        {activeTab === 'schools' && (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 80px 100px 120px 100px 120px', gap: '0.5rem', padding: '0.75rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
              <span>School</span>
              <span style={{ textAlign: 'center' as const }}>Students</span>
              <span style={{ textAlign: 'center' as const }}>Teachers</span>
              <span style={{ textAlign: 'center' as const }}>Parents</span>
              <span style={{ textAlign: 'center' as const }}>Exams</span>
              <span style={{ textAlign: 'center' as const }}>Submissions</span>
              <span style={{ textAlign: 'center' as const }}>Last activity</span>
              <span style={{ textAlign: 'center' as const }}>Tier</span>
              <span style={{ textAlign: 'center' as const }}>Status</span>
            </div>

            {schools.map((school, i) => (
              <div key={school.id} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 80px 80px 80px 100px 120px 100px 120px', gap: '0.5rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{school.name}</p>
                  <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{school.subdomain}.examify.ng · {new Date(school.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{school.student_count}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{school.teacher_count}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{school.parent_count}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{school.exam_count}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.875rem', color: '#3a3a36' }}>{school.submissions_count}</span>
                <span style={{ textAlign: 'center' as const, fontSize: '0.72rem', color: '#6b6b65' }}>{timeAgo(school.last_activity)}</span>
                <div style={{ textAlign: 'center' as const }}>
                  <select
                    value={school.subscription_tier}
                    onChange={e => handleUpdateTier(school.id, e.target.value)}
                    disabled={updatingTier === school.id}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', fontWeight: 700, border: 'none', borderRadius: '20px', background: TIER_CONFIG[school.subscription_tier]?.bg ?? '#f7f7f5', color: TIER_CONFIG[school.subscription_tier]?.color ?? '#1a1a18', cursor: 'pointer', outline: 'none' }}>
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <button
                    onClick={() => handleToggleSchool(school.id)}
                    disabled={toggling === school.id}
                    style={{ padding: '0.3rem 0.75rem', border: 'none', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', background: school.is_active ? '#e8f5ee' : '#fef2f2', color: school.is_active ? '#0f4a32' : '#dc2626', opacity: toggling === school.id ? 0.6 : 1 }}>
                    {toggling === school.id ? '…' : school.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}