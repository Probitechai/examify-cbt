'use client'
// The old /teacher pages were an early mock-up (sample data, nothing saved).
// Teachers work in the staff portal (/admin), which shows them their own
// classes, exams and questions; anyone landing here is sent to the real page.
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const MOVED: Record<string, string> = {
  '/teacher': '/admin',
  '/teacher/questions': '/admin/qbank',
  '/teacher/questions/new': '/admin/qbank/add',
  '/teacher/exams': '/admin/exams',
  '/teacher/exams/new': '/admin/exams/new',
  '/teacher/results': '/admin/results',
}

export default function TeacherLayout(_: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => { router.replace(MOVED[pathname.replace(/\/$/, '')] ?? '/admin') }, [pathname])
  return <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'system-ui', color: '#6b6b65' }}>Opening…</div>
}
