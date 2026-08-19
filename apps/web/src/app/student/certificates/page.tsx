'use client'
import { apiFetch, checkAuth } from '@/lib/auth'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '../../../hooks/useAuth'

const API = process.env.NEXT_PUBLIC_API_URL

function CertificateRenderer({ cert }: { cert: any }) {
  return (
    <div style={{ background: 'white', fontFamily: 'Georgia, serif', padding: '2rem', border: '3px solid #1a6b4a', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 8, left: 8, width: 40, height: 40, borderTop: '3px solid #d4af37', borderLeft: '3px solid #d4af37', borderRadius: '4px 0 0 0' }} />
      <div style={{ position: 'absolute', top: 8, right: 8, width: 40, height: 40, borderTop: '3px solid #d4af37', borderRight: '3px solid #d4af37', borderRadius: '0 4px 0 0' }} />
      <div style={{ position: 'absolute', bottom: 8, left: 8, width: 40, height: 40, borderBottom: '3px solid #d4af37', borderLeft: '3px solid #d4af37', borderRadius: '0 0 0 4px' }} />
      <div style={{ position: 'absolute', bottom: 8, right: 8, width: 40, height: 40, borderBottom: '3px solid #d4af37', borderRight: '3px solid #d4af37', borderRadius: '0 0 4px 0' }} />
      <div style={{ textAlign: 'center' as const, padding: '1.5rem 2rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          {cert.school_logo && <img src={cert.school_logo} alt="School logo" style={{ width: 72, height: 72, objectFit: 'contain' as const, marginBottom: '0.75rem' }} />}
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a6b4a', margin: 0, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>{cert.school_name}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, #d4af37)' }} />
          <span style={{ fontSize: '1.25rem' }}>🏆</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, #d4af37)' }} />
        </div>
        <p style={{ fontSize: '0.825rem', fontWeight: 600, color: '#6b6b65', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginBottom: '0.5rem' }}>This is to certify that</p>
        <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#1a1a18', margin: '0.5rem 0', fontStyle: 'italic' }}>{cert.student_name}</h2>
        <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1rem' }}>{cert.class_level} {cert.class_arm}</p>
        <div style={{ width: 120, height: 2, background: '#d4af37', margin: '0 auto 1rem' }} />
        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a6b4a', margin: '0 0 0.75rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{cert.title}</h3>
        <p style={{ fontSize: '0.925rem', color: '#3a3a36', lineHeight: 1.7, maxWidth: 480, margin: '0 auto 1.5rem' }}>
          {cert.description ?? `For successfully completing the requirements of${cert.subject_name ? ` ${cert.subject_name}` : ''} in ${cert.term_name} — ${cert.session_name}`}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, #d4af37)' }} />
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, #d4af37)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ height: 40, borderBottom: '1.5px solid #1a1a18', marginBottom: '0.375rem' }} />
            <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontFamily: 'system-ui' }}>Class Teacher</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ height: 40, borderBottom: '1.5px solid #1a1a18', marginBottom: '0.375rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {cert.school_logo && <img src={cert.school_logo} alt="Stamp" style={{ width: 40, height: 40, opacity: 0.3, objectFit: 'contain' as const }} />}
            </div>
            <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontFamily: 'system-ui' }}>School Stamp</p>
          </div>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ height: 40, borderBottom: '1.5px solid #1a1a18', marginBottom: '0.375rem' }} />
            <p style={{ fontSize: '0.72rem', color: '#6b6b65', fontFamily: 'system-ui' }}>Principal</p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#a0a09a', fontFamily: 'system-ui', borderTop: '1px solid #e5e5e0', paddingTop: '0.875rem' }}>
          <span>Certificate No: <strong>{cert.certificate_number}</strong></span>
          <span>Issued: {new Date(cert.issued_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}

export default function StudentCertificatesPage() {
  const router = useRouter()
  const { user, isLoading, hydrate } = useAuthStore()
  const [certificates, setCertificates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewingCert, setViewingCert] = useState<any>(null)

  useEffect(() => { checkAuth(router, 'student') }, [])

  useEffect(() => { hydrate() }, [hydrate])

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login')
  }, [user, isLoading, router])

  useEffect(() => { if (user) loadCertificates() }, [user])

  async function loadCertificates() {
    try {
      const res = await apiFetch(`${API}/certificates/student/${(user as any).id}`)
      const data = await res.json()
      setCertificates(data.certificates ?? [])
    } catch {} finally { setLoading(false) }
  }

  if (isLoading || !user) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  const initials = user.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e5e5e0', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={() => router.push('/student')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.825rem', color: '#6b6b65' }}>← Dashboard</button>
            <div style={{ width: 1, height: 20, background: '#e5e5e0' }} />
            <h1 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>My Certificates</h1>
          </div>
          <div style={{ width: 36, height: 36, background: '#1a6b4a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem' }}>{initials}</div>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center' as const, padding: '3rem', color: '#6b6b65' }}>Loading...</div>
        ) : certificates.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '16px', padding: '4rem', textAlign: 'center' as const }}>
            <p style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🏆</p>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.5rem' }}>No certificates yet</p>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>Complete your lessons to earn certificates!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            {certificates.map(cert => (
              <div key={cert.id} style={{ background: 'white', border: '2px solid #d4af37', borderRadius: '16px', padding: '1.5rem', cursor: 'pointer', textAlign: 'center' as const }}
                onClick={() => setViewingCert(cert)}>
                <p style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏆</p>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.375rem' }}>{cert.title}</h3>
                {cert.subject_name && <p style={{ fontSize: '0.78rem', color: '#1a6b4a', fontWeight: 600, marginBottom: '0.25rem' }}>{cert.subject_name}</p>}
                <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '0.5rem' }}>{cert.term_name} · {cert.session_name}</p>
                <p style={{ fontSize: '0.68rem', color: '#a0a09a' }}>No: {cert.certificate_number}</p>
                <div style={{ marginTop: '1rem', padding: '0.375rem 0.875rem', background: '#e8f5ee', borderRadius: 20, display: 'inline-block' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0f4a32' }}>Click to view & print</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Certificate Viewer */}
      {viewingCert && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
          onClick={e => e.target === e.currentTarget && setViewingCert(null)}>
          <div style={{ background: 'white', borderRadius: '20px', padding: '1rem', width: '100%', maxWidth: 680, maxHeight: '95vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Your Certificate</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => window.print()}
                  style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  🖨️ Print
                </button>
                <button onClick={() => setViewingCert(null)}
                  style={{ padding: '0.375rem 0.75rem', background: '#f7f7f5', border: '1px solid #e5e5e0', borderRadius: '6px', fontSize: '0.78rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>
            <CertificateRenderer cert={viewingCert} />
          </div>
        </div>
      )}
    </div>
  )
}