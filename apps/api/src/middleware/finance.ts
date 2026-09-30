import type { FastifyReply } from 'fastify'
import { tenantDb } from '../db/client'
import { requireRole } from './auth'
import { tierAtLeast, FEES_TIER, TIER_NAMES } from './tier'

// ─────────────────────────────────────────────────────────────────────────────
// Finance permission model
//   READ    : school_admin, bursar, proprietor
//   WRITE   : bursar always; school_admin only when the school has NO active
//             bursar, or holds an unexpired emergency grant from the proprietor
//   APPROVE : proprietor; school_admin only if the school has no active proprietor
// All checks read the database on every request (not the 12h JWT), so a
// deactivated user loses access immediately.
// ─────────────────────────────────────────────────────────────────────────────

export const requireFinanceRead = requireRole('school_admin', 'bursar', 'proprietor')

export type FinanceAccess = {
  canWrite: boolean
  reason: 'bursar' | 'no_bursar' | 'emergency_grant' | 'bursar_active' | 'inactive' | 'role' | 'plan'
  grantExpiresAt: string | null
}

export async function getFinanceAccess(request: any): Promise<FinanceAccess> {
  // Below the plan that includes fee management, fee records are view-only for everyone
  if (!tierAtLeast(request.school?.subscriptionTier, FEES_TIER)) {
    return { canWrite: false, reason: 'plan', grantExpiresAt: null }
  }
  const role = request.user?.role
  if (role !== 'bursar' && role !== 'school_admin') {
    return { canWrite: false, reason: 'role', grantExpiresAt: null }
  }

  const tdb = tenantDb(request.schoolId)
  const rows = await tdb.query`
    SELECT
      (SELECT is_active FROM users
        WHERE id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid) AS self_active,
      EXISTS (SELECT 1 FROM users
        WHERE school_id = ${request.schoolId}::uuid AND role = 'bursar' AND is_active = true) AS has_bursar,
      (SELECT MAX(expires_at) FROM finance_access_grants
        WHERE school_id = ${request.schoolId}::uuid
          AND granted_to = ${request.user.id}::uuid
          AND revoked_at IS NULL AND expires_at > now()) AS grant_expires_at
  ` as any[]
  const r = rows[0] ?? {}

  if (!r.self_active) return { canWrite: false, reason: 'inactive', grantExpiresAt: null }
  if (role === 'bursar') return { canWrite: true, reason: 'bursar', grantExpiresAt: null }
  if (!r.has_bursar) return { canWrite: true, reason: 'no_bursar', grantExpiresAt: null }
  if (r.grant_expires_at) {
    return { canWrite: true, reason: 'emergency_grant', grantExpiresAt: new Date(r.grant_expires_at).toISOString() }
  }
  return { canWrite: false, reason: 'bursar_active', grantExpiresAt: null }
}

const PLAN_MESSAGE = `Fee management needs the ${TIER_NAMES[FEES_TIER]} plan or higher. Existing fee records can still be viewed, but nothing can be added or changed until the school upgrades.`

const DENY_MESSAGES: Record<string, string> = {
  plan: PLAN_MESSAGE,
  bursar_active: 'Fee records are managed by the Bursar. If the Bursar is unavailable, ask the Proprietor for temporary access.',
  inactive: 'Your account has been deactivated.',
  role: 'Your role cannot change fee records.',
}

// Use AFTER authenticate + requireRole('school_admin', 'bursar') on every fee write route
export async function requireFinanceWrite(request: any, reply: FastifyReply) {
  const access = await getFinanceAccess(request)
  if (access.canWrite) {
    request.financeViaGrant = access.reason === 'emergency_grant'
    return
  }
  if (access.reason === 'plan') {
    return reply.status(403).send({ error: 'UPGRADE_REQUIRED', reason: 'plan', requiredTier: FEES_TIER, message: PLAN_MESSAGE })
  }
  return reply.status(403).send({
    error: 'FINANCE_READ_ONLY',
    reason: access.reason,
    message: DENY_MESSAGES[access.reason] ?? 'Not allowed.',
  })
}

// Approves waivers above threshold and ALL reversals.
// "Not your own request" is checked in each handler and by a DB CHECK constraint.
export async function requireFinanceApprover(request: any, reply: FastifyReply) {
  if (!tierAtLeast(request.school?.subscriptionTier, FEES_TIER)) {
    return reply.status(403).send({ error: 'UPGRADE_REQUIRED', reason: 'plan', requiredTier: FEES_TIER, message: PLAN_MESSAGE })
  }
  const role = request.user?.role
  const tdb = tenantDb(request.schoolId)
  const rows = await tdb.query`
    SELECT
      (SELECT is_active FROM users
        WHERE id = ${request.user.id}::uuid AND school_id = ${request.schoolId}::uuid) AS self_active,
      EXISTS (SELECT 1 FROM users
        WHERE school_id = ${request.schoolId}::uuid AND role = 'proprietor' AND is_active = true) AS has_proprietor
  ` as any[]
  const r = rows[0] ?? {}
  if (!r.self_active) return reply.status(403).send({ error: 'ACCOUNT_INACTIVE' })
  if (role === 'proprietor') return
  if (role === 'school_admin' && !r.has_proprietor) return
  return reply.status(403).send({ error: 'NOT_APPROVER', message: 'Only the Proprietor can approve this.' })
}
