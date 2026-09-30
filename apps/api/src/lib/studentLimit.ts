// Student limit per plan, checked the same way wherever active students are added:
// one at a time, CSV import, enrolment from Admissions, and reactivation.
import { getStudentLimit, normalizeTier, TIER_NAMES } from '../middleware/tier'

export type Capacity = { tier: string; limit: number; current: number; room: number }

/**
 * Call inside the transaction that adds the students. Locks the school's row so
 * two admins adding students at the same moment can't both pass the check.
 */
export async function studentCapacity(tx: any, schoolId: string): Promise<Capacity> {
  const [s] = await tx`SELECT subscription_tier FROM schools WHERE id = ${schoolId}::uuid FOR UPDATE` as any[]
  const tier = normalizeTier(s?.subscription_tier)
  const limit = getStudentLimit(tier)
  const [c] = await tx`
    SELECT COUNT(*)::int AS n FROM users
    WHERE school_id = ${schoolId}::uuid AND role = 'student' AND is_active = true
  ` as any[]
  const current = Number(c?.n ?? 0)
  return { tier, limit, current, room: Math.max(0, limit - current) }
}

/** The 403 body when adding `adding` students would pass the limit */
export function limitError(cap: Capacity, adding: number) {
  const plan = TIER_NAMES[normalizeTier(cap.tier)]
  const has = `The school has ${cap.current} active student${cap.current === 1 ? '' : 's'}`
  const message = adding <= 1
    ? `Your ${plan} plan allows up to ${cap.limit} students. ${has}. Upgrade the plan, or deactivate students who have left, to add more.`
    : `This would add ${adding} students, but your ${plan} plan allows up to ${cap.limit}. ${has}, so there is room for ${cap.room}. Nothing was added. Upgrade the plan, or import fewer students.`
  return { error: 'STUDENT_LIMIT_REACHED', message, limit: cap.limit, current: cap.current, room: cap.room, adding }
}
