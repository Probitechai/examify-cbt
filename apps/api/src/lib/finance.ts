import { randomBytes } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Finance helpers shared by fees, finance, paystack and proprietor routes
// ─────────────────────────────────────────────────────────────────────────────

// Atomic per-school, per-year receipt counter. Call INSIDE a transaction:
// if the payment insert fails, the number is rolled back too.
export async function nextReceiptNo(tx: any, schoolId: string): Promise<string> {
  const year = new Date().getFullYear()
  const rows = await tx`
    INSERT INTO receipt_counters (school_id, year, last_no)
    VALUES (${schoolId}::uuid, ${year}, 1)
    ON CONFLICT (school_id, year)
    DO UPDATE SET last_no = receipt_counters.last_no + 1
    RETURNING last_no
  ` as any[]
  return `RCP-${String(rows[0].last_no).padStart(5, '0')}-${year}`
}

type AuditEntry = {
  action: string            // 'payment.recorded', 'waiver.requested', 'reversal.approved', ...
  entityType: string        // 'fee_payment' | 'fee_waiver' | 'fee_reversal' | 'fee_structure' | 'grant' | 'settings' | 'user'
  entityId?: string | null
  before?: unknown
  after?: unknown
  reason?: string | null
}

// Always call with the SAME tx as the change, so a change without its log line can't commit.
// Pass request = null for system actions (Paystack webhook).
export async function logFinance(tx: any, request: any | null, schoolId: string, e: AuditEntry) {
  const actorId = request?.user?.id ?? null
  const actorRole = request?.user?.role ?? 'system'
  const viaGrant = !!request?.financeViaGrant
  const ip = request?.ip ?? null
  // Pass objects through tx.json() so they are stored as real jsonb, not quoted strings
  let before: any = null
  let after: any = null
  if (e.before !== undefined && e.before !== null) before = tx.json(e.before)
  if (e.after !== undefined && e.after !== null) after = tx.json(e.after)

  await tx`
    INSERT INTO fee_audit_log
      (school_id, actor_id, actor_role, action, entity_type, entity_id,
       before_data, after_data, reason, via_grant, ip_address)
    VALUES
      (${schoolId}::uuid, ${actorId}::uuid, ${actorRole}, ${e.action}, ${e.entityType},
       ${e.entityId ?? null}::uuid, ${before}, ${after},
       ${e.reason ?? null}, ${viaGrant}, ${ip})
  `
}

// Cryptographically random temporary password for staff accounts
export function tempPassword(): string {
  return randomBytes(9).toString('base64url')
}
