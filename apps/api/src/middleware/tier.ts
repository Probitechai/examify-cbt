const TIER_ORDER: Record<string, number> = {
  starter: 1,
  growth: 2,
  premium: 3,
}

const TIER_NAMES: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  premium: 'Premium',
}

export function requireTier(minTier: 'starter' | 'growth' | 'premium') {
  return async function checkTier(request: any, reply: any) {
    const schoolTier = request.school?.subscriptionTier ?? 'starter'
    const currentOrder = TIER_ORDER[schoolTier] ?? 1
    const requiredOrder = TIER_ORDER[minTier] ?? 1

    if (currentOrder < requiredOrder) {
      return reply.status(403).send({
        error: 'UPGRADE_REQUIRED',
        message: `This feature requires the ${TIER_NAMES[minTier]} plan or higher. Your school is currently on the ${TIER_NAMES[schoolTier]} plan.`,
        currentTier: schoolTier,
        requiredTier: minTier,
      })
    }
  }
}

export const TIER_STUDENT_LIMITS: Record<string, number> = {
  starter: 200,
  growth: 500,
  premium: 999999,
}

export function getStudentLimit(tier: string): number {
  return TIER_STUDENT_LIMITS[tier] ?? 200
}