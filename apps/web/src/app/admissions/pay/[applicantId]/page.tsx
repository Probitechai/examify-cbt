'use client'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL

export default function AdmissionPayPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const applicantId = params.applicantId as string
  const school = searchParams.get('school') ?? ''

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadOffer() }, [applicantId])

  async function loadOffer() {
    try {
      const res = await fetch(`${API}/admissions/pay/${applicantId}?school=${school}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to load offer')
      setData(d)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  async function handlePay() {
    setPaying(true); setError('')
    try {
      const res = await fetch(`${API}/admissions/pay/${applicantId}/initialize?school=${school}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to initialize payment')
      if (d.noFee) {
        window.location.href = `/admissions/pay/${applicantId}/callback?school=${school}&noFee=true`
        return
      }
      window.location.href = d.authorizationUrl
    } catch (e: any) { setError(e.message); setPaying(false) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <p style={{ color: '#6b6b65' }}>Loading offer details...</p>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '2.5rem', maxWidth: 440, textAlign: 'center' as const }}>
        <p style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</p>
        <p style={{ fontSize: '1rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.5rem' }}>Unable to load offer</p>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>{error}</p>
      </div>
    </div>
  )

  const { school: schoolInfo, applicant, offer } = data
  const expired = offer.offerExpiresAt && new Date(offer.offerExpiresAt) < new Date()
  const feeRequired = offer.acceptanceFeeAmount > 0

  if (offer.acceptanceFeePaid) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '2.5rem', maxWidth: 480, textAlign: 'center' as const, border: '2px solid #1a6b4a' }}>
        {schoolInfo.logo_url && <img src={schoolInfo.logo_url} alt="School" style={{ width: 64, height: 64, objectFit: 'contain' as const, marginBottom: '1rem' }} />}
        <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✅</p>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a', marginBottom: '0.5rem' }}>Offer Already Accepted</h1>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '0.5rem' }}>
          {applicant.name} has already accepted the admission offer.
        </p>
        <p style={{ fontSize: '0.78rem', color: '#a0a09a' }}>Application: {applicant.applicationNumber}</p>
      </div>
    </div>
  )

  if (expired) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '2.5rem', maxWidth: 440, textAlign: 'center' as const }}>
        {schoolInfo.logo_url && <img src={schoolInfo.logo_url} alt="School" style={{ width: 64, height: 64, objectFit: 'contain' as const, marginBottom: '1rem' }} />}
        <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⏰</p>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#dc2626', marginBottom: '0.5rem' }}>Offer Expired</h1>
        <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>
          This admission offer has expired. Please contact {schoolInfo.name} for assistance.
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* School header */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' as const, border: '1px solid #e5e5e0' }}>
          {schoolInfo.logo_url && <img src={schoolInfo.logo_url} alt="School" style={{ width: 72, height: 72, objectFit: 'contain' as const, marginBottom: '0.75rem' }} />}
          <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.25rem' }}>{schoolInfo.name}</h1>
          <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Admissions Office</p>
        </div>

        {/* Offer card */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '2rem', border: '2px solid #1a6b4a', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '2rem' }}>🎉</span>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a6b4a', marginBottom: '0.2rem' }}>Congratulations!</h2>
              <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>You have received an admission offer</p>
            </div>
          </div>

          {/* Offer details */}
          <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Applicant', value: applicant.name },
              { label: 'Application No.', value: applicant.applicationNumber },
              { label: 'Class Offered', value: applicant.appliedClass },
              { label: 'Parent/Guardian', value: applicant.parentName },
              ...(feeRequired ? [{ label: 'Acceptance Fee', value: `₦${offer.acceptanceFeeAmount.toLocaleString()}` }] : []),
              ...(offer.offerExpiresAt ? [{ label: 'Offer Expires', value: new Date(offer.offerExpiresAt).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }] : []),
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #e5e5e0' }}>
                <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{item.label}</span>
                <span style={{ fontSize: '0.825rem', color: item.label === 'Acceptance Fee' ? '#dc2626' : '#1a1a18', fontWeight: item.label === 'Acceptance Fee' ? 700 : 500 }}>{item.value}</span>
              </div>
            ))}
          </div>

          {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}

          {feeRequired ? (
            <>
              <p style={{ fontSize: '0.875rem', color: '#3a3a36', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                To accept this offer, please pay the acceptance fee of <strong>₦{offer.acceptanceFeeAmount.toLocaleString()}</strong>.
                Payment is processed securely via Paystack.
              </p>
              <button onClick={handlePay} disabled={paying}
                style={{ width: '100%', padding: '1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', opacity: paying ? 0.6 : 1 }}>
                {paying ? 'Redirecting to payment...' : `💳 Pay ₦${offer.acceptanceFeeAmount.toLocaleString()} & Accept Offer`}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.875rem', color: '#3a3a36', lineHeight: 1.7, marginBottom: '1.25rem' }}>
                Click the button below to accept this admission offer. No payment is required.
              </p>
              <button onClick={handlePay} disabled={paying}
                style={{ width: '100%', padding: '1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', opacity: paying ? 0.6 : 1 }}>
                {paying ? 'Processing...' : '✅ Accept Offer'}
              </button>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center' as const, fontSize: '0.72rem', color: '#a0a09a' }}>
          Powered by Examify · Probitechai
        </p>
      </div>
    </div>
  )
}
