'use client'
import dynamic from 'next/dynamic'

const ExamEngine = dynamic(() => import('./ExamEngine'), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', fontFamily: 'sans-serif' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <p style={{ color: '#6b6b65' }}>Loading exam...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
})

export default function ExamPage() {
  return <ExamEngine />
}