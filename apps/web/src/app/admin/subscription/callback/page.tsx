'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

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

export default function SubscriptionCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying')
  const [message, setMessage] = useState('')
  const [tier, setTier] = useState('')

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref')
    if (!reference) { setStatus('failed'); setMessage('No payment reference found.'); return }
    verifyPayment(reference)
  }, [])

  async function verifyPayment(reference: string) {
    try {
      const res = await fetch(`${API}/paystack/subscription/verify?reference=${reference}`, { headers: hdrs() })
      const data = await res.json()
      if (data.success) {
        setStatus('success')
        setTier(data.tier)
        setMessage(data.message)
        // Redirect to admin after 3 seconds
        setTimeout(() => router.push('/admin'), 3000)
      } else {
        setStatus('failed')
        setMessage(data.message ?? 'Payment verification failed.')
      }
    } catch {
      setStatus('failed')
      setMessage('Could not verify payment. Please contact support.')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '3rem', maxWidth: 480, width: '100%', textAlign: 'center', border: '1px solid #e5e5e0' }}>
        {status === 'verifying' && (
          <>
            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Verifying Payment</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Please wait while we confirm your payment with Paystack…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a6b4a', marginBottom: '0.5rem' }}>Payment Successful!</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1rem' }}>{message}</p>
            <p style={{ fontSize: '0.78rem', color: '#a0a09a' }}>Redirecting you to the dashboard in 3 seconds…</p>
            <button onClick={() => router.push('/admin')}
              style={{ marginTop: '1rem', padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              Go to Dashboard →
            </button>
          </>
        )}
        {status === 'failed' && (
          <>
            <p style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.5rem' }}>Payment Not Confirmed</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1rem' }}>{message}</p>
            <button onClick={() => router.push('/admin/subscription')}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              Back to Subscription
            </button>
          </>
        )}
      </div>
    </div>
  )
}