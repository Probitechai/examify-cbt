'use client'
// The school's plan and which paid features it includes, read from the API
// (GET /schools/plan). The API enforces the same table, so this only decides
// what the screens show; it can't unlock anything.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch, getToken } from '@/lib/auth'

export type Feature =
  | 'resultApproval' | 'gradebook' | 'curriculum' | 'lessons' | 'interactiveLessons' | 'lessonDiscussion' | 'learningPaths' | 'liveClasses'
  | 'examTimetable' | 'certificates' | 'conduct' | 'financeControls' | 'hostels' | 'transport'
  | 'hostelOperations' | 'transportOperations' | 'admissions' | 'analytics' | 'jambPrep' | 'smsAlerts'

export type Plan = {
  loaded: boolean
  tier: string
  planName: string
  features: Partial<Record<Feature, boolean>>
  featureTiers: Partial<Record<Feature, string>>
}

const PLAN_NAMES: Record<string, string> = { basic: 'Basic', standard: 'Standard', premium: 'Premium', enterprise: 'Enterprise' }
export const planName = (tier?: string) => PLAN_NAMES[tier ?? ''] ?? 'Basic'

// Screens that belong to a paid feature. A path matches itself and anything under it.
const PATH_FEATURES: [string, Feature][] = [
  ['/admin/curriculum', 'curriculum'], ['/admin/lessons', 'lessons'], ['/admin/timetable', 'examTimetable'],
  ['/admin/gradebook', 'gradebook'], ['/admin/learning-paths', 'learningPaths'], ['/admin/live-classes', 'liveClasses'],
  ['/admin/approvals', 'resultApproval'], ['/admin/conduct', 'conduct'], ['/admin/admissions', 'admissions'],
  ['/admin/hostels', 'hostels'], ['/admin/hostel-operations', 'hostelOperations'],
  ['/admin/transport', 'transport'], ['/admin/transport-ops', 'transportOperations'],
  ['/admin/certificates', 'certificates'], ['/admin/analytics', 'analytics'],
  ['/proprietor/curriculum', 'curriculum'], ['/proprietor/conduct', 'conduct'], ['/proprietor/admissions', 'admissions'],
  ['/proprietor/hostels', 'hostels'], ['/proprietor/hostel-operations', 'hostelOperations'],
  ['/proprietor/transport', 'transport'], ['/proprietor/transport-operations', 'transportOperations'],
  ['/proprietor/finance-audit', 'financeControls'], ['/proprietor/finance-access', 'financeControls'],
  ['/proprietor/bursars', 'financeControls'], ['/bursar', 'financeControls'],
  ['/student/exam-timetable', 'examTimetable'], ['/proprietor/exam-timetable', 'examTimetable'],
  ['/student/lessons', 'lessons'], ['/student/learning-paths', 'learningPaths'],
  ['/student/live-classes', 'liveClasses'], ['/student/certificates', 'certificates'],
  ['/student/jamb', 'jambPrep'], ['/admin/jamb-progress', 'jambPrep'], ['/proprietor/jamb-progress', 'jambPrep'],
  ['/proprietor/analytics', 'analytics'],
]

/** The paid feature a screen belongs to, if any */
export function featureForPath(path: string): Feature | null {
  const hit = PATH_FEATURES.find(([p]) => path === p || path.startsWith(p + '/'))
  return hit ? hit[1] : null
}

// One request per signed-in session; every screen shares it
let cache: { token: string; promise: Promise<Plan> } | null = null
function loadPlan(): Promise<Plan> {
  const token = getToken() ?? ''
  if (!cache || cache.token !== token) {
    cache = {
      token,
      promise: apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/schools/plan`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then(d => ({ loaded: true, tier: d.tier, planName: d.planName, features: d.features ?? {}, featureTiers: d.featureTiers ?? {} }))
        // If the plan can't be read, show everything; the API still refuses what the plan doesn't include
        .catch(() => { cache = null; return { loaded: true, tier: '', planName: '', features: {}, featureTiers: {} } }),
    }
  }
  return cache.promise
}
/** Call after the plan changes (e.g. after paying for an upgrade) */
export function refreshPlan() { cache = null }

export function usePlan(): Plan {
  const [plan, setPlan] = useState<Plan>({ loaded: false, tier: '', planName: '', features: {}, featureTiers: {} })
  useEffect(() => {
    let live = true
    loadPlan().then(p => { if (live) setPlan(p) })
    return () => { live = false }
  }, [])
  return plan
}

/** false only when the plan is known and doesn't include the feature */
export function hasFeature(plan: Plan, f: Feature): boolean {
  return plan.features[f] !== false
}

const FEATURE_LABELS: Record<Feature, string> = {
  resultApproval: 'Result approval', gradebook: 'The gradebook', curriculum: 'Curriculum', lessons: 'Lessons', interactiveLessons: 'Interactive lessons', lessonDiscussion: 'Lesson discussion',
  learningPaths: 'Learning paths', liveClasses: 'Live classes', examTimetable: 'The exam timetable',
  certificates: 'Certificates', conduct: 'Conduct reports', financeControls: 'Finance controls',
  hostels: 'Hostel management', transport: 'Transport', hostelOperations: 'Hostel operations',
  transportOperations: 'Transport operations', admissions: 'Online admissions', analytics: 'School analytics',
  jambPrep: 'JAMB Prep', smsAlerts: 'SMS alerts to parents',
}

const FEATURE_NOTES: Partial<Record<Feature, string>> = {
  jambPrep: 'JAMB Prep gives SS3 students past questions, timed mock UTMEs and AI practice questions.',
  analytics: 'School analytics shows results, attendance and fee collection by class and subject, and how each compares with earlier terms.',
  financeControls: 'This covers the Bursar role, discounts and waivers, debtors and SMS reminders, finance reports and the finance audit log. On your plan the School Admin manages fees, and parents can still pay online.',
}

/** Shown in place of a screen the school's plan doesn't include */
export function PlanLocked({ feature, plan, upgradeHref }: { feature: Feature; plan: Plan; upgradeHref?: string }) {
  const needs = planName(plan.featureTiers[feature])
  return (
    <div style={{ maxWidth: 520, margin: '4rem auto', padding: '2rem', background: 'white', border: '1px solid #e5e5e0', borderRadius: 12, textAlign: 'center' as const }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔒</div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1a1a18' }}>
        {FEATURE_LABELS[feature]} is part of the {needs} plan
      </h2>
      <p style={{ fontSize: '0.9rem', color: '#6b6b65', lineHeight: 1.5 }}>
        Your school is on the {plan.planName || 'Basic'} plan.{' '}
        {upgradeHref ? `Upgrade to ${needs} or higher to use it.` : 'Ask your school to upgrade if you need it.'}
      </p>
      {FEATURE_NOTES[feature] && <p style={{ fontSize: '0.82rem', color: '#6b6b65', lineHeight: 1.5, marginTop: '0.75rem' }}>{FEATURE_NOTES[feature]}</p>}
      {upgradeHref && (
        <Link href={upgradeHref} style={{ display: 'inline-block', marginTop: '1.25rem', padding: '0.6rem 1.25rem', borderRadius: 8, background: '#1a6b4a', color: 'white', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none' }}>
          See plans
        </Link>
      )}
    </div>
  )
}

/** Wraps a portal's pages: shows the locked notice on screens the plan doesn't include */
export function PlanGate({ pathname, upgradeHref, children }: { pathname: string; upgradeHref?: string; children: React.ReactNode }) {
  const plan = usePlan()
  const feature = featureForPath(pathname)
  if (!feature) return <>{children}</>
  if (!plan.loaded) return null
  if (!hasFeature(plan, feature)) return <PlanLocked feature={feature} plan={plan} upgradeHref={upgradeHref} />
  return <>{children}</>
}
