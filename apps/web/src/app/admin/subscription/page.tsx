'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Payment {
  id: string
  amount: number
  tier: string
  term_name: string
  status: string
  paid_at: string | null
  created_at: string
}

const PLANS = [
  {
    tier: 'starter',
    name: 'Starter Plan',
    price: 80000,
    color: '#1a6b4a',
    bg: '#e8f5ee',
    features: [
      'CBT Exam Engine (unlimited exams)',
      'Question Bank (5 question types)',
      'Result Entry & Report Cards',
      'Class Broadsheet',
      'Attendance Marking',
      'Parent Portal (results & attendance)',
      'Email Notifications',
      'School Logo on Reports',
      'Up to 200 students',
    ],
    missing: ['Fee Management', 'Conduct Reports', 'Class Timetable', 'Announcements', 'SMS Notifications'],
  },
  {
    tier: 'growth',
    name: 'Growth Plan',
    price: 150000,
    color: '#1e40af',
    bg: '#eff6ff',
    popular: true,
    features: [
      'Everything in Starter, plus:',
      'Fee Management & Online Payments',
      'Conduct Reports on Report Cards',
      'Class Timetable Builder',
      'Bulk Announcements',
      'Result Approval Workflow',
      'SMS Notifications (absence, fees, results)',
      'Full Parent Portal',
      'Up to 500 students',
    ],
    missing: ['Advanced Analytics', 'Priority Support'],
  },
  {
    tier: 'premium',
    name: 'Premium Plan',
    price: 250000,
    color: '#7e22ce',
    bg: '#f5f3ff',
    features: [
      'Everything in Growth, plus:',
      'Unlimited Students',
      'Advanced CBT Analytics',
      'Data Export (CSV)',
      'Priority Support',
      'Early access to new features',
    ],
    missing: [],
  },
]

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}
function getSubdomain() {
  try {
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? ''
  } catch {}
  return ''
}
function hdrs() {
  return { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}
const API = process.env.NEXT_PUBLIC_API_URL

export default function SubscriptionPage() {
  const router = useRouter()
  const [currentTier, setCurrentTier] = useState('')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [subscriptionTerm, setSubscriptionTerm] = useState('')
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<string | null>(null)
  const [termName, setTermName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [schoolRes, historyRes] = await Promise.all([
        fetch(`${API}/schools/settings`, { headers: hdrs() }),
        fetch(`${API}/paystack/subscription/history`, { headers: hdrs() }),
      ])
      const schoolData = await schoolRes.json()
      const historyData = await historyRes.json()
      setCurrentTier(schoolData.subscription_tier ?? 'starter')
      setExpiresAt(schoolData.subscription_expires_at ?? null)
      setSubscriptionTerm(schoolData.subscription_term ?? '')
      setPayments(historyData.payments ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function handlePay(tier: string) {
    if (!termName.trim()) {
      setError('Please enter the term name before paying (e.g. Third Term 2025/2026)')
      return
    }
    setPaying(tier); setError('')
    try {
      const res = await fetch(`${API}/paystack/subscription/initialize`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ tier, termName: termName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to initialize payment')

      // Redirect to Paystack payment page
      window.location.href = data.authorizationUrl
    } catch (e: any) {
      setError(e.message ?? 'Failed to initialize payment')
    } finally { setPaying(null) }
  }

  function formatAmount(n: number) {
    return `₦${Number(n).toLocaleString('en-NG')}`
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const tierOrder: Record<string, number> = { starter: 1, growth: 2, premium: 3 }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1000 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Subscription</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Manage your school's Examify subscription plan.</p>
      </div>

      {/* Current plan banner */}
      {!loading && currentTier && (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: '#6b6b65', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Current Plan</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18' }}>
              {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} Plan
              {subscriptionTerm && <span style={{ fontSize: '0.825rem', fontWeight: 400, color: '#6b6b65', marginLeft: '0.5rem' }}>— {subscriptionTerm}</span>}
            </p>
            {expiresAt && (
              <p style={{ fontSize: '0.78rem', color: new Date(expiresAt) < new Date() ? '#dc2626' : '#1a6b4a', marginTop: '0.25rem' }}>
                {new Date(expiresAt) < new Date() ? '⚠️ Expired' : `✅ Active until ${formatDate(expiresAt)}`}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginBottom: '0.375rem' }}>Renew or upgrade below</p>
          </div>
        </div>
      )}

      {/* Term name input */}
      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#92400e', marginBottom: '0.5rem' }}>⚠️ Before paying — enter the term you are paying for:</p>
        <input
          value={termName}
          onChange={e => setTermName(e.target.value)}
          placeholder="e.g. Third Term 2025/2026"
          style={{ width: '100%', padding: '0.625rem 0.875rem', background: 'white', border: '1.5px solid #fde68a', borderRadius: '8px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
        />
      </div>

      {error && (
        <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {/* Plans */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        {PLANS.map(plan => {
          const isCurrent = currentTier === plan.tier
          const isUpgrade = tierOrder[plan.tier] > tierOrder[currentTier]
          const isDowngrade = tierOrder[plan.tier] < tierOrder[currentTier]

          return (
            <div key={plan.tier} style={{ background: 'white', border: `2px solid ${isCurrent ? plan.color : plan.popular ? plan.color : '#e5e5e0'}`, borderRadius: '16px', overflow: 'hidden', position: 'relative' as const }}>
              {plan.popular && (
                <div style={{ background: plan.color, padding: '0.375rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Popular</p>
                </div>
              )}
              {isCurrent && (
                <div style={{ background: plan.color, padding: '0.375rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'white', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✓ Current Plan</p>
                </div>
              )}

              <div style={{ padding: '1.5rem' }}>
                <p style={{ fontSize: '0.825rem', fontWeight: 700, color: plan.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>{plan.name}</p>
                <p style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1a1a18', marginBottom: '0.25rem' }}>{formatAmount(plan.price)}</p>
                <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '1.25rem' }}>per term</p>

                <div style={{ marginBottom: '1.25rem' }}>
                  {plan.features.map((f, i) => (
                    <p key={i} style={{ fontSize: '0.78rem', color: '#1a1a18', marginBottom: '0.375rem', display: 'flex', alignItems: 'flex-start', gap: '0.375rem' }}>
                      <span style={{ color: plan.color, flexShrink: 0 }}>✓</span> {f}
                    </p>
                  ))}
                  {plan.missing.map((f, i) => (
                    <p key={i} style={{ fontSize: '0.78rem', color: '#a0a09a', marginBottom: '0.375rem', display: 'flex', alignItems: 'flex-start', gap: '0.375rem' }}>
                      <span style={{ flexShrink: 0 }}>✗</span> {f}
                    </p>
                  ))}
                </div>

                <button
                  onClick={() => handlePay(plan.tier)}
                  disabled={!!paying || isCurrent}
                  style={{
                    width: '100%', padding: '0.75rem', border: 'none', borderRadius: '10px',
                    fontSize: '0.875rem', fontWeight: 600, cursor: isCurrent ? 'default' : 'pointer',
                    background: isCurrent ? '#f0f0ee' : plan.color,
                    color: isCurrent ? '#a0a09a' : 'white',
                    opacity: paying === plan.tier ? 0.6 : 1,
                  }}>
                  {paying === plan.tier ? 'Redirecting to Paystack…' :
                   isCurrent ? 'Current Plan' :
                   isUpgrade ? `Upgrade to ${plan.name}` :
                   isDowngrade ? `Switch to ${plan.name}` :
                   `Pay ${formatAmount(plan.price)}`}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>Payment History</h2>
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 100px', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
              <span>Term</span><span>Plan</span><span>Amount</span><span>Date</span><span>Status</span>
            </div>
            {payments.map((p, i) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 100px', gap: '1rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#1a1a18' }}>{p.term_name}</span>
                <span style={{ fontSize: '0.825rem', color: '#3a3a36', textTransform: 'capitalize' as const }}>{p.tier}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>{formatAmount(p.amount)}</span>
                <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{p.paid_at ? formatDate(p.paid_at) : formatDate(p.created_at)}</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: p.status === 'success' ? '#e8f5ee' : p.status === 'pending' ? '#fffbeb' : '#fef2f2', color: p.status === 'success' ? '#0f4a32' : p.status === 'pending' ? '#92400e' : '#dc2626' }}>
                  {p.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
