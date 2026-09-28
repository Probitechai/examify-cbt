// Settlement ledger: what each school's online payments brought in, Probitechai's
// share, what Probitechai owes schools whose fees come through its account, and
// the payouts made against that.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { paystackMode } from '../lib/paystack'

type Mode = 'live' | 'test'
const num = (v: any) => Math.round(Number(v ?? 0) * 100) / 100

function period(q: any): { from: string | null; to: string | null } {
  const ok = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  return { from: ok(q.from) ? q.from : null, to: ok(q.to) ? q.to : null }
}
function modeOf(q: any): Mode {
  if (q.mode === 'live' || q.mode === 'test') return q.mode
  return paystackMode() === 'live' ? 'live' : 'test'
}

/** Per-school figures. Period figures honour from/to; the balance is always all-time. */
async function summaries(mode: Mode, from: string | null, to: string | null, schoolId: string | null) {
  const rows = await db()`
    WITH c AS (
      SELECT pc.*,
             EXISTS (SELECT 1 FROM fee_reversals fr WHERE fr.payment_id = pc.fee_payment_id AND fr.status = 'approved') AS reversed,
             (pc.collected_at >= COALESCE(${from}::date, '-infinity'::date)
              AND pc.collected_at < COALESCE(${to}::date + 1, 'infinity'::date)) AS in_period
      FROM platform_collections pc
      WHERE pc.paystack_mode = ${mode}
    )
    SELECT s.id, s.name, s.subdomain, s.platform_fee_percent, s.payment_preference, s.is_active,
      COUNT(c.id) FILTER (WHERE c.in_period AND NOT c.reversed)                                      AS payments,
      COALESCE(SUM(c.amount)       FILTER (WHERE c.in_period AND NOT c.reversed), 0)                 AS collected,
      COALESCE(SUM(c.paystack_fee) FILTER (WHERE c.in_period AND NOT c.reversed), 0)                 AS paystack_fees,
      COALESCE(SUM(c.platform_fee) FILTER (WHERE c.in_period AND NOT c.reversed), 0)                 AS platform_fees,
      COALESCE(SUM(c.school_share) FILTER (WHERE c.in_period AND NOT c.reversed AND c.routed_via = 'direct'), 0)      AS paid_directly,
      COALESCE(SUM(c.school_share) FILTER (WHERE c.in_period AND NOT c.reversed AND c.routed_via = 'probitechai'), 0) AS owed_in_period,
      COALESCE(SUM(c.amount)       FILTER (WHERE c.in_period AND c.reversed), 0)                     AS reversed_amount,
      COALESCE(SUM(c.school_share) FILTER (WHERE NOT c.reversed AND c.routed_via = 'probitechai'), 0) AS owed_all_time,
      BOOL_OR(c.fee_estimated) FILTER (WHERE c.in_period)                                            AS has_estimates,
      (SELECT COALESCE(SUM(p.amount), 0) FROM school_payouts p WHERE p.school_id = s.id AND p.voided_at IS NULL) AS paid_out
    FROM schools s
    LEFT JOIN c ON c.school_id = s.id
    WHERE (${schoolId}::uuid IS NULL OR s.id = ${schoolId}::uuid)
    GROUP BY s.id
    ORDER BY s.name
  ` as any[]
  return rows.map(r => {
    const owedAll = num(r.owed_all_time), paidOut = mode === 'live' ? num(r.paid_out) : 0
    return {
      id: r.id, name: r.name, subdomain: r.subdomain, isActive: r.is_active,
      platformFeePercent: Number(r.platform_fee_percent),
      paymentPreference: r.payment_preference ?? 'probitechai',
      payments: Number(r.payments),
      collected: num(r.collected), paystackFees: num(r.paystack_fees), platformFees: num(r.platform_fees),
      paidDirectly: num(r.paid_directly), owedInPeriod: num(r.owed_in_period), reversedAmount: num(r.reversed_amount),
      hasEstimates: !!r.has_estimates,
      owedAllTime: owedAll, paidOut, balanceDue: num(owedAll - paidOut),
    }
  })
}

async function collectionsFor(schoolId: string, mode: Mode, from: string | null, to: string | null) {
  return db()`
    SELECT pc.id, pc.source, pc.reference, pc.routed_via, pc.amount, pc.paystack_fee, pc.fee_estimated,
           pc.platform_fee, pc.platform_rate, pc.school_share, pc.collected_at,
           fp.receipt_number, st.full_name AS student_name, fs.name AS fee_name,
           (a.first_name || ' ' || a.last_name) AS applicant_name,
           EXISTS (SELECT 1 FROM fee_reversals fr WHERE fr.payment_id = pc.fee_payment_id AND fr.status = 'approved') AS reversed
    FROM platform_collections pc
    LEFT JOIN fee_payments fp ON fp.id = pc.fee_payment_id
    LEFT JOIN users st ON st.id = fp.student_id
    LEFT JOIN fee_structures fs ON fs.id = fp.fee_structure_id
    LEFT JOIN admission_applications aa ON pc.source = 'admission_fee' AND aa.paystack_reference = pc.reference AND aa.school_id = pc.school_id
    LEFT JOIN applicants a ON a.id = aa.applicant_id
    WHERE pc.school_id = ${schoolId}::uuid AND pc.paystack_mode = ${mode}
      AND pc.collected_at >= COALESCE(${from}::date, '-infinity'::date)
      AND pc.collected_at < COALESCE(${to}::date + 1, 'infinity'::date)
    ORDER BY pc.collected_at DESC
    LIMIT 2000
  ` as Promise<any[]>
}

async function payoutsFor(schoolId: string) {
  return db()`
    SELECT id, amount, paid_on, bank_reference, note, created_at, voided_at, void_reason
    FROM school_payouts WHERE school_id = ${schoolId}::uuid
    ORDER BY paid_on DESC, created_at DESC
  ` as Promise<any[]>
}

export async function settlementRoutes(app: FastifyInstance) {
  async function superAuth(request: any, reply: any) {
    try {
      await request.jwtVerify()
      if (request.user.role !== 'super_admin') return reply.status(403).send({ error: 'FORBIDDEN' })
    } catch {
      return reply.status(401).send({ error: 'UNAUTHORIZED' })
    }
  }

  // ── Super admin: every school ─────────────────────────────────────────────
  app.get('/superadmin/settlements', { preHandler: [superAuth] }, async (request: any, reply: any) => {
    const q = request.query as any
    const mode = modeOf(q); const { from, to } = period(q)
    const schools = await summaries(mode, from, to, null)
    const [sub] = await db()`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS n FROM subscription_payments
      WHERE status = 'success' AND COALESCE(paystack_mode, 'test') = ${mode}
        AND paid_at >= COALESCE(${from}::date, '-infinity'::date) AND paid_at < COALESCE(${to}::date + 1, 'infinity'::date)
    ` as any[]
    const sum = (k: string) => num(schools.reduce((a: number, s: any) => a + s[k], 0))
    return reply.send({
      mode, from, to, currentMode: paystackMode(),
      totals: {
        collected: sum('collected'), paystackFees: sum('paystackFees'), platformFees: sum('platformFees'),
        paidDirectly: sum('paidDirectly'), owedInPeriod: sum('owedInPeriod'),
        subscriptions: num(sub.total), subscriptionCount: sub.n,
        platformRevenue: num(sum('platformFees') + num(sub.total)),
        balanceDue: num(schools.reduce((a: number, s: any) => a + Math.max(0, s.balanceDue), 0)),
      },
      schools,
    })
  })

  app.get('/superadmin/settlements/:schoolId', { preHandler: [superAuth] }, async (request: any, reply: any) => {
    const q = request.query as any
    const mode = modeOf(q); const { from, to } = period(q)
    const id = (request.params as any).schoolId
    const [summary] = await summaries(mode, from, to, id)
    if (!summary) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })
    return reply.send({ mode, from, to, summary, collections: await collectionsFor(id, mode, from, to), payouts: await payoutsFor(id) })
  })

  // Record a transfer Probitechai made to a school
  app.post('/superadmin/settlements/:schoolId/payouts', { preHandler: [superAuth] }, async (request: any, reply: any) => {
    const body = z.object({
      amount: z.number().positive(),
      paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      bankReference: z.string().trim().min(3),
      note: z.string().trim().max(500).optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Enter the amount, the date paid and the bank reference.' })
    const d = body.data
    const id = (request.params as any).schoolId
    if (new Date(d.paidOn) > new Date()) return reply.status(400).send({ error: 'FUTURE_DATE', message: 'The payout date can’t be in the future.' })

    const result = await db().begin(async (tx: any) => {
      // one payout at a time per school, so two people can't both pay the same balance
      const [s] = await tx`SELECT id FROM schools WHERE id = ${id}::uuid FOR UPDATE` as any[]
      if (!s) return { status: 404, body: { error: 'SCHOOL_NOT_FOUND' } }
      const [b] = await tx`
        SELECT
          (SELECT COALESCE(SUM(pc.school_share), 0) FROM platform_collections pc
            WHERE pc.school_id = ${id}::uuid AND pc.paystack_mode = 'live' AND pc.routed_via = 'probitechai'
              AND NOT EXISTS (SELECT 1 FROM fee_reversals fr WHERE fr.payment_id = pc.fee_payment_id AND fr.status = 'approved')) AS owed,
          (SELECT COALESCE(SUM(amount), 0) FROM school_payouts WHERE school_id = ${id}::uuid AND voided_at IS NULL) AS paid
      ` as any[]
      const balance = num(Number(b.owed) - Number(b.paid))
      if (d.amount > balance + 0.004) {
        return { status: 400, body: { error: 'EXCEEDS_BALANCE', balance, message: `That’s more than the balance due (₦${balance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}).` } }
      }
      const [p] = await tx`
        INSERT INTO school_payouts (school_id, amount, paid_on, bank_reference, note, recorded_by)
        VALUES (${id}::uuid, ${d.amount}, ${d.paidOn}::date, ${d.bankReference}, ${d.note ?? null}, ${request.user.id}::uuid)
        RETURNING id
      ` as any[]
      return { status: 201, body: { id: p.id, balanceAfter: num(balance - d.amount) } }
    })
    return reply.status(result.status).send(result.body)
  })

  app.post('/superadmin/payouts/:id/void', { preHandler: [superAuth] }, async (request: any, reply: any) => {
    const body = z.object({ reason: z.string().trim().min(5) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Give a reason (at least 5 characters).' })
    const rows = await db()`
      UPDATE school_payouts SET voided_at = now(), voided_by = ${request.user.id}::uuid, void_reason = ${body.data.reason}
      WHERE id = ${(request.params as any).id}::uuid AND voided_at IS NULL
      RETURNING id
    ` as any[]
    if (!rows[0]) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Payout not found, or already voided.' })
    return reply.send({ voided: true })
  })

  app.patch('/superadmin/schools/:id/platform-fee', { preHandler: [superAuth] }, async (request: any, reply: any) => {
    const body = z.object({ percent: z.number().min(0).max(10) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Enter a rate between 0 and 10%.' })
    const rows = await db()`
      UPDATE schools SET platform_fee_percent = ${body.data.percent} WHERE id = ${(request.params as any).id}::uuid RETURNING platform_fee_percent
    ` as any[]
    if (!rows[0]) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })
    return reply.send({ platformFeePercent: Number(rows[0].platform_fee_percent) })
  })

  // ── A school's own view (Proprietor and Bursar) ──────────────────────────
  app.get('/settlements/mine', { preHandler: [authenticate, requireRole('proprietor', 'bursar')] }, async (request: any, reply: any) => {
    const q = request.query as any
    const mode = modeOf({}); const { from, to } = period(q)
    const [summary] = await summaries(mode, from, to, request.schoolId)
    return reply.send({ mode, from, to, summary, collections: await collectionsFor(request.schoolId, mode, from, to), payouts: await payoutsFor(request.schoolId) })
  })
}
