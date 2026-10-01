'use client'
// A student's published exam timetable: their class's paper and CBT sittings
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkAuth } from '@/lib/auth'
import { call } from '@/components/finance/ui'
import { ExamTimetableView, PrintStyles, Sitting } from '@/components/examTimetable'

export default function StudentExamTimetablePage() {
  const router = useRouter()
  const [data, setData] = useState<{ term: { name: string } | null; timetable: { title: string; instructions: string | null } | null; students: { name: string; classLevel: string; classArm: string; entries: Sitting[] }[] } | null>(null)
  useEffect(() => { checkAuth(router, 'student') }, [])
  useEffect(() => { call('/exam-timetable/mine').then(r => setData(r.ok ? r.data : { term: null, timetable: null, students: [] })) }, [])
  const me = data?.students?.[0]
  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f5', fontFamily: 'system-ui' }}>
      <PrintStyles />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem' }}>
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button onClick={() => router.push('/student')} style={{ background: 'none', border: 'none', color: '#1a6b4a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>← Dashboard</button>
          {!!me?.entries.length && <button onClick={() => window.print()} style={{ padding: '0.5rem 1rem', background: 'white', border: '1px solid #e5e5e0', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>🖨 Print</button>}
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a18' }}>{data?.timetable?.title ?? 'Exam Timetable'}</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          {[data?.term?.name, me ? `${me.classLevel}${me.classArm ? ' ' + me.classArm : ''}` : ''].filter(Boolean).join(' · ')}
        </p>
        {data?.timetable?.instructions && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.85rem 1rem', margin: '1rem 0', fontSize: '0.88rem', color: '#78350f', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {data.timetable.instructions}
          </div>
        )}
        <div style={{ marginTop: '1rem' }}>
          {!data ? <p style={{ color: '#6b6b65' }}>Loading…</p> : (
            <ExamTimetableView entries={me?.entries ?? []} hideClass
              empty={data.timetable ? 'You have no exams on this timetable.' : 'The exam timetable hasn’t been published yet. Check back closer to the exams.'} />
          )}
        </div>
      </div>
    </div>
  )
}
