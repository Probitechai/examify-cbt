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

export const TIER_STUDENT_LIMITS: Record<Tier, number> = {
  basic: 200,
  standard: 500,
  premium: 800,
  enterprise: 999999,
}

export function getStudentLimit(tier: unknown): number {
  return TIER_STUDENT_LIMITS[normalizeTier(tier)]
}
