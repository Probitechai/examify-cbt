// Subscription plans. A school's plan is always one of these (the database enforces it).
export const TIERS = ['basic', 'standard', 'premium', 'enterprise'] as const
export type Tier = typeof TIERS[number]

const TIER_ORDER: Record<Tier, number> = {
  basic: 1,
  standard: 2,
  premium: 3,
  enterprise: 4,
}

export const TIER_NAMES: Record<Tier, string> = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
  enterprise: 'Enterprise',
}

export function isTier(v: unknown): v is Tier {
  return typeof v === 'string' && (TIERS as readonly string[]).includes(v)
}

/** A school's plan; anything missing or unrecognised is treated as Basic */
export function normalizeTier(v: unknown): Tier {
  return isTier(v) ? v : 'basic'
}

/** true when the school's plan is `min` or higher */
export function tierAtLeast(tier: unknown, min: Tier): boolean {
  return TIER_ORDER[normalizeTier(tier)] >= TIER_ORDER[min]
}

/** The plan fee management needs (fees, payments, Bursar, approvals, online payments) */
export const FEES_TIER: Tier = 'standard'

export function requireTier(minTier: Tier) {
  return async function checkTier(request: any, reply: any) {
    const schoolTier = normalizeTier(request.school?.subscriptionTier)
    if (TIER_ORDER[schoolTier] < TIER_ORDER[minTier]) {
      return reply.status(403).send({
        error: 'UPGRADE_REQUIRED',
        message: `This feature requires the ${TIER_NAMES[minTier]} plan or higher. Your school is currently on the ${TIER_NAMES[schoolTier]} plan.`,
        currentTier: schoolTier,
        requiredTier: minTier,
      })
    }
  }
}

// ── Features sold by plan ────────────────────────────────────────────────────
// The lowest plan each paid feature starts at. Everything not listed is on
// every plan. The API refuses these features below their plan, and the web
// app reads the same table (GET /schools/plan) to lock its pages.
export const FEATURE_TIERS = {
  resultApproval:      'standard',
  gradebook:           'standard',
  curriculum:          'standard', // subjects, schemes of work, delivery tracking
  lessons:             'standard', // lessons, resources, interactive, assignments, discussion
  learningPaths:       'standard',
  liveClasses:         'standard',
  timetable:           'standard',
  certificates:        'standard',
  conduct:             'standard',
  fees:                'standard',
  announcements:       'standard',
  hostels:             'standard',
  transport:           'standard',
  hostelOperations:    'premium',  // exeats, visitors, roll calls, meal plans
  transportOperations: 'premium',  // trip roll calls, incidents, maintenance
  admissions:          'premium',
  analytics:           'premium',
} as const satisfies Record<string, Tier>
export type Feature = keyof typeof FEATURE_TIERS

export const FEATURE_NAMES: Record<Feature, string> = {
  resultApproval: 'Result approval', gradebook: 'Gradebook', curriculum: 'Curriculum',
  lessons: 'Lessons', learningPaths: 'Learning paths', liveClasses: 'Live classes',
  timetable: 'Class timetable', certificates: 'Certificates', conduct: 'Conduct reports',
  fees: 'Fee management', announcements: 'Announcements', hostels: 'Hostel management',
  transport: 'Transport', hostelOperations: 'Hostel operations',
  transportOperations: 'Transport operations', admissions: 'Online admissions', analytics: 'Analytics',
}

/** Which features a school's plan includes */
export function featuresFor(tier: unknown): Record<Feature, boolean> {
  const out = {} as Record<Feature, boolean>
  for (const f of Object.keys(FEATURE_TIERS) as Feature[]) out[f] = tierAtLeast(tier, FEATURE_TIERS[f])
  return out
}

export function requireFeature(feature: Feature) {
  const min = FEATURE_TIERS[feature]
  return async function checkFeature(request: any, reply: any) {
    const schoolTier = normalizeTier(request.school?.subscriptionTier)
    if (!tierAtLeast(schoolTier, min)) {
      return reply.status(403).send({
        error: 'UPGRADE_REQUIRED',
        message: `${FEATURE_NAMES[feature]} is part of the ${TIER_NAMES[min]} plan. Your school is on the ${TIER_NAMES[schoolTier]} plan.`,
        feature, currentTier: schoolTier, requiredTier: min,
      })
    }
  }
}

/**
 * Put every route a module registers behind a plan. `pick` names the feature
 * for a route (or null to leave it open). The check runs after the route's
 * own login and role checks, so a signed-out caller still gets 401.
 */
export function gateRoutes(app: any, pick: Feature | ((url: string) => Feature | null)) {
  app.addHook('onRoute', (opts: any) => {
    const feature = typeof pick === 'function' ? pick(String(opts.url)) : pick
    if (!feature) return
    const pre = opts.preHandler == null ? [] : Array.isArray(opts.preHandler) ? opts.preHandler : [opts.preHandler]
    opts.preHandler = [...pre, requireFeature(feature)]
  })
}

export const TIER_STUDENT_LIMITS: Record<Tier, number> = {
  basic: 200,
  standard: 500,
  premium: 800,
  enterprise: 999999,
}

export function getStudentLimit(tier: unknown): number {
  return TIER_STUDENT_LIMITS[normalizeTier(tier)]
}
