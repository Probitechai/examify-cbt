'use client'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL

export default function AdmissionPayCallbackPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const applicantId = params.applicantId as string
  const school = searchParams.get('school') ?? ''
  const reference = searchParams.get('reference') ?? searchParams.get('trxref') ?? ''
  const noFee = searchParams.get('noFee') === 'true'

  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying')
  const [message, setMessage] = useState('')
  const [applicantName, setApplicantName] = useState('')

  useEffect(() => {
    if (noFee) { setStatus('success'); setMessage('Your offer has been accepted successfully!'); return }
    if (!reference) { setStatus('failed'); setMessage('No payment reference found.'); return }
    verify()
  }, [])

  async function verify() {
    try {
      const res = await fetch(`${API}/admissions/pay/${applicantId}/verify?reference=${reference}&school=${school}`)
      const d = await res.json()
      if (d.success) {
        setStatus('success')
        setApplicantName(d.applicantName ?? '')
        setMessage(d.message)
      } else {
        setStatus('failed')
        setMessage(d.message ?? 'Payment could not be verified.')
      }
    } catch {
      setStatus('failed')
      setMessage('Could not verify payment. Please contact the school.')
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', fontFamily: 'system-ui', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '2.5rem', maxWidth: 480, textAlign: 'center' as const, border: `2px solid ${status === 'success' ? '#1a6b4a' : status === 'failed' ? '#dc2626' : '#e5e5e0'}` }}>
        {status === 'verifying' && (
          <>
            <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>Verifying Payment</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Please wait while we confirm your payment...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🎉</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a', marginBottom: '0.5rem' }}>Offer Accepted!</h1>
            {applicantName && <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>{applicantName}</p>}
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem', lineHeight: 1.6 }}>{message}</p>
            <div style={{ background: '#e8f5ee', borderRadius: '12px', padding: '1.25rem', textAlign: 'left' as const, marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.825rem', color: '#0f4a32', lineHeight: 1.7 }}>
                ✅ Your acceptance has been recorded.<br />
                📧 The school will contact you with further instructions.<br />
                📋 Please keep your application number for reference.
              </p>
            </div>
            <button onClick={() => window.location.href = '/'}
              style={{ width: '100%', padding: '0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              Done
            </button>
          </>
        )}
        {status === 'failed' && (
          <>
            <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>❌</p>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.5rem' }}>Payment Not Confirmed</h1>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65', marginBottom: '1.5rem' }}>{message}</p>
            <button onClick={() => window.history.back()}
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
