'use client'
import dynamic from 'next/dynamic'

const StudentDashboard = dynamic(() => import('./StudentDashboard2'), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ width: 32, height: 32, border: '2.5px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
})


export default function StudentPage() {
  return <StudentDashboard />
}