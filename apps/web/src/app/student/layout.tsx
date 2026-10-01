'use client'
// Student screens that belong to a paid feature show a notice when the school's plan doesn't include it
import { usePathname } from 'next/navigation'
import { PlanGate } from '@/lib/plan'

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <PlanGate pathname={pathname}>{children}</PlanGate>
}
