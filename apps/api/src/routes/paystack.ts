import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'
import { nextReceiptNo, logFinance } from '../lib/finance'
import { paystackRequest, paystackMode, schoolUrl, validSignature, usableSubaccount } from '../lib/paystack'
import { recordCollection, routingMetadata } from '../lib/settlements'
import { requireTier, FEES_TIER, tierAtLeast } from '../middleware/tier'

export { paystackRequest }

const TIER_PRICES_KOBO: Record<string, number> = {
  basic: 5000000,     // ₦50,000
  standard: 7500000,  // ₦75,000
  premium: 12000000,  // ₦120,000
}

// ── Settle a subscription payment (idempotent) ────────────────────────────────
// Shared by the webhook and the verify endpoint. Only a PENDING payment for the
// same school and the full price activates the plan, so an old reference can't
// be replayed to extend a subscription. Renewing early adds to the time left.
async function settleSubscription(reference: string, data: any): Promise<{ ok: boolean; reason?: string; tier?: string; termName?: string; expiresAt?: string }> {
  const meta = data?.metadata ?? {}
  if (meta.type !== 'subscription') return { ok: false, reason: 'NOT_A_SUBSCRIPTION' }
  return db().begin(async (tx: any) => {
    const rows = await tx`
      SELECT id, school_id, tier, term_name, amount, status FROM subscription_payments
      WHERE paystack_reference = ${reference} FOR UPDATE
    ` as any[]
    const p = rows[0]
    if (!p) return { ok: false, reason: 'NOT_FOUND' }
    if (p.school_id !== meta.school_id) return { ok: false, reason: 'SCHOOL_MISMATCH' }
    if (p.status !== 'pending') return { ok: p.status === 'success', reason: 'ALREADY_SETTLED', tier: p.tier, termName: p.term_name }
    if (Math.round(Number(p.amount) * 100) !== Number(data.amount)) return { ok: false, reason: 'AMOUNT_MISMATCH' }
    const [s] = await tx`SELECT subscription_expires_at FROM schools WHERE id = ${p.school_id}::uuid FOR UPDATE` as any[]
    const start = new Date(Math.max(Date.now(), s?.subscription_expires_at ? new Date(s.subscription_expires_at).getTime() : 0))
    start.setMonth(start.getMonth() + 4)   // one term
    const expiresAt = start.toISOString()
    await tx`UPDATE subscription_payments SET status = 'success', paid_at = now() WHERE id = ${p.id}::uuid`
    await tx`
      UPDATE schools SET subscription_tier = ${p.tier}, subscription_expires_at = ${expiresAt}, subscription_term = ${p.term_name}
      WHERE id = ${p.school_id}::uuid
    `
    return { ok: true, tier: p.tier, termName: p.term_name, expiresAt }
  })
}

// ── Settle a pending Paystack fee payment (idempotent) ────────────────────────
// Shared by the webhook and the verify endpoint: whichever arrives first settles
// the payment and issues ONE receipt; the second finds it settled and does nothing.
async function settleFeePayment(schoolId: string, reference: string, data: any) {
  const paidKobo = Number(data?.amount)
  const tdb = tenantDb(schoolId)
  return tdb.transaction(async (tx: any) => {
    const rows = await tx`
      SELECT id, amount_paid, receipt_number, status FROM fee_payments
      WHERE paystack_reference = ${reference} AND school_id = ${schoolId}::uuid
      FOR UPDATE
    ` as any[]
    const row = rows[0]
    if (!row) return { found: false, receiptNo: null as string | null, status: null as string | null }
    if (row.status !== 'pending') {
      return { found: true, receiptNo: row.receipt_number as string, status: row.status as string }
    }

    const expectedKobo = Math.round(Number(row.amount_paid) * 100)
    const actual = paidKobo / 100
    const receiptNo = await nextReceiptNo(tx, schoolId)

    // Paystack's charged amount is the truth; record exactly what was received
    await tx`
      UPDATE fee_payments
      SET status = 'success', receipt_number = ${receiptNo},
          payment_date = CURRENT_DATE, amount_paid = ${actual}
      WHERE id = ${row.id}::uuid
    `
    let action = 'payment.paystack_confirmed'
    if (expectedKobo !== paidKobo) action = 'payment.paystack_amount_mismatch'
    await logFinance(tx, null, schoolId, {
      action,
      entityType: 'fee_payment',
      entityId: row.id,
      before: { status: 'pending', amount: Number(row.amount_paid) },
      after: { status: 'success', amount: actual, receiptNo },
      reason: reference,
    })
    // Settlement ledger: what came in, Paystack's fee, Probitechai's share, what the school is owed
    await recordCollection(tx, { schoolId, source: 'school_fee', reference, feePaymentId: row.id, data })
    return { found: true, receiptNo, status: 'success' }
  })
}

export async function paystackRoutes(app: FastifyInstance) {
  // Keep the raw JSON body (only for routes in this plugin) so the webhook
  // signature can be checked against exactly what Paystack signed.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req: any, body: any, done: any) => {
    req.rawBody = body
    if (body === '' || body == null) {
      const err: any = new Error("Body cannot be empty when content-type is set to 'application/json'")
      err.statusCode = 400; err.code = 'FST_ERR_CTP_EMPTY_JSON_BODY'
      return done(err, undefined)
    }
    try { done(null, JSON.parse(body)) } catch (e: any) { e.statusCode = 400; done(e, undefined) }
  })

  // ── SCHOOL SUBSCRIPTION ───────────────────────────────────────────────────

  // Initialize subscription payment
  app.post('/paystack/subscription/initialize', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        tier: z.enum(['basic', 'standard', 'premium', 'enterprise']),
        termName: z.string().min(1), // e.g. "Third Term 2025/2026"
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data

      if (!TIER_PRICES_KOBO[d.tier]) {
        return reply.status(400).send({ error: 'CUSTOM_PRICING', message: 'Enterprise is priced per school. Please contact Examify to arrange it.' })
      }

      const TIER_NAMES: Record<string, string> = {
        basic: 'Basic Plan',
        standard: 'Standard Plan',
        premium: 'Premium Plan',
        enterprise: 'Enterprise Plan',
      }

      // Get school and admin email
      const schoolRows = await db()`
        SELECT s.id, s.name, u.email
        FROM schools s
        JOIN users u ON u.school_id = s.id AND u.role = 'school_admin'
        WHERE s.id = ${request.schoolId}::uuid
        LIMIT 1
      ` as any[]

      const school = schoolRows[0]
      if (!school) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })

      const amount = TIER_PRICES_KOBO[d.tier]
      const reference = `SUB-${request.schoolId.slice(0, 8)}-${Date.now()}`

      // Initialize with Paystack
      const paystackRes = await paystackRequest('POST', '/transaction/initialize', {
        email: school.email,
        amount,
        reference,
        currency: 'NGN',
        metadata: {
          type: 'subscription',
          school_id: request.schoolId,
          school_name: school.name,
          tier: d.tier,
          term_name: d.termName,
        },
        callback_url: `${schoolUrl(request.school.subdomain)}/subscription/callback`,
      })

      if (!paystackRes.status) {
        return reply.status(500).send({ error: 'PAYSTACK_ERROR', message: paystackRes.message })
      }

      // Save pending payment record
      await db()`
        INSERT INTO subscription_payments (
          school_id, amount, tier, term_name, paystack_reference,
          paystack_access_code, status, paystack_mode
        )
        VALUES (
          ${request.schoolId}::uuid,
          ${amount / 100},
          ${d.tier},
          ${d.termName},
          ${reference},
          ${paystackRes.data.access_code},
          'pending',
          ${paystackMode()}
        )
      `

      return reply.send({
        authorizationUrl: paystackRes.data.authorization_url,
        accessCode: paystackRes.data.access_code,
        reference,
      })
    })

  // Verify subscription payment
  app.get('/paystack/subscription/verify', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const { reference } = request.query as any
      if (!reference) return reply.status(400).send({ error: 'reference required' })

      const paystackRes = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(String(reference))}`)

      if (!paystackRes.status || paystackRes.data.status !== 'success') {
        return reply.send({ success: false, message: paystackRes.data?.gateway_response ?? 'Payment not successful' })
      }
      if (paystackRes.data.metadata?.school_id !== request.schoolId) {
        return reply.status(403).send({ success: false, error: 'FORBIDDEN', message: 'This payment belongs to another school.' })
      }

      const r = await settleSubscription(String(reference), paystackRes.data)
      if (!r.ok) {
        const message = r.reason === 'AMOUNT_MISMATCH'
          ? 'The amount paid does not match the plan price. Please contact Examify support.'
          : 'This payment could not be applied. Please contact Examify support.'
        return reply.send({ success: false, message })
      }

      return reply.send({
        success: true,
        tier: r.tier,
        termName: r.termName,
        expiresAt: r.expiresAt,
        message: `Your school is on the ${r.tier} plan for ${r.termName}.`,
      })
    })

  // Get subscription history
  app.get('/paystack/subscription/history', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const rows = await db()`
        SELECT id, amount, tier, term_name, status, paid_at, created_at
        FROM subscription_payments
        WHERE school_id = ${request.schoolId}::uuid
        ORDER BY created_at DESC
        LIMIT 20
      ` as any[]
      return reply.send({ payments: rows })
    })
  // ── DIRECT PAYMENT SETUP (subaccounts) ────────────────────────────────────


  // Get list of Nigerian banks (for the bank selection dropdown)
  app.get('/paystack/banks', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const res = await paystackRequest('GET', '/bank?country=nigeria&currency=NGN')
      if (!res.status) return reply.status(500).send({ error: 'PAYSTACK_ERROR', message: res.message })
      const banks = res.data.map((b: any) => ({ name: b.name, code: b.code }))
      return reply.send({ banks })
    })

  // Verify an account number resolves to a real account before creating the subaccount
  app.post('/paystack/resolve-account', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        accountNumber: z.string().min(10).max(10),
        bankCode: z.string().min(1),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const res = await paystackRequest('GET', `/bank/resolve?account_number=${d.accountNumber}&bank_code=${d.bankCode}`)
      if (!res.status) return reply.status(400).send({ error: 'RESOLVE_FAILED', message: res.message ?? 'Could not verify this account number.' })

      return reply.send({ accountName: res.data.account_name, accountNumber: res.data.account_number })
    })

  // Create the Paystack subaccount and switch this school to direct payments
  app.post('/paystack/subaccount/create', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        accountNumber: z.string().min(10).max(10),
        bankCode: z.string().min(1),
        bankName: z.string().min(1),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data

      const schoolRows = await db()`
        SELECT name, platform_fee_percent FROM schools WHERE id = ${request.schoolId}::uuid
      ` as any[]
      const school = schoolRows[0]
      if (!school) return reply.status(404).send({ error: 'SCHOOL_NOT_FOUND' })

      const subRes = await paystackRequest('POST', '/subaccount', {
        business_name: school.name,
        settlement_bank: d.bankCode,
        account_number: d.accountNumber,
        // Default split on Paystack's side; each payment also sets its own charge from the school's current rate
        percentage_charge: Number(school.platform_fee_percent ?? 0.4),
      })

      if (!subRes.status) {
        return reply.status(500).send({ error: 'SUBACCOUNT_FAILED', message: subRes.message ?? 'Failed to create subaccount with Paystack.' })
      }

      await db()`
        UPDATE schools SET
          paystack_subaccount_code = ${subRes.data.subaccount_code},
          paystack_subaccount_bank = ${d.bankName},
          paystack_subaccount_account_number = ${d.accountNumber},
          paystack_subaccount_mode = ${paystackMode()},
          payment_preference = 'direct'
        WHERE id = ${request.schoolId}::uuid
      `

      return reply.send({
        success: true,
        subaccountCode: subRes.data.subaccount_code,
        message: 'Direct payments set up successfully. Fees will now be paid straight into your school\u2019s account, minus a small platform fee.',
      })
    })

  // Switch back to receiving payments through Probitechai (doesn't delete the subaccount)
  app.patch('/paystack/payment-preference', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const schema = z.object({ preference: z.enum(['direct', 'probitechai']) })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      if (body.data.preference === 'direct') {
        const rows = await db()`SELECT paystack_subaccount_code, paystack_subaccount_mode FROM schools WHERE id = ${request.schoolId}::uuid` as any[]
        if (!rows[0]?.paystack_subaccount_code) {
          return reply.status(400).send({ error: 'NO_SUBACCOUNT', message: 'Set up your bank account first before switching to direct payments.' })
        }
        if ((rows[0].paystack_subaccount_mode ?? 'test') !== paystackMode()) {
          return reply.status(400).send({ error: 'SUBACCOUNT_NEEDS_SETUP', message: 'Your bank account was set up before live payments started. Please enter it again.' })
        }
      }

      await db()`UPDATE schools SET payment_preference = ${body.data.preference} WHERE id = ${request.schoolId}::uuid`
      return reply.send({ success: true, preference: body.data.preference })
    })

  // Get current payment setup status (for the settings page to display)
  app.get('/paystack/payment-preference', { preHandler: [authenticate, requireRole('school_admin', 'proprietor')] },
    async (request: any, reply: any) => {
      const rows = await db()`
        SELECT payment_preference, paystack_subaccount_code, paystack_subaccount_bank, paystack_subaccount_account_number,
               paystack_subaccount_mode
        FROM schools WHERE id = ${request.schoolId}::uuid
      ` as any[]
      const r = rows[0] ?? {}
      // A bank account set up in test mode doesn't exist on live Paystack: ask for it again
      const needsSetup = !!r.paystack_subaccount_code && (r.paystack_subaccount_mode ?? 'test') !== paystackMode()
      if (needsSetup) {
        return reply.send({
          payment_preference: 'probitechai', paystack_subaccount_code: null,
          paystack_subaccount_bank: null, paystack_subaccount_account_number: null,
          needs_bank_setup: true, paystack_mode: paystackMode(),
        })
      }
      return reply.send({ ...r, needs_bank_setup: false, paystack_mode: paystackMode() })
    })
  // ── STUDENT FEE PAYMENTS ──────────────────────────────────────────────────

  // Initialize fee payment (called by parent portal)
  app.post('/paystack/fees/initialize', { preHandler: [authenticate, requireRole('parent'), requireTier(FEES_TIER)] },
    async (request: any, reply: any) => {
      const schema = z.object({
        feeStructureId: z.string().uuid(),
        studentId: z.string().uuid(),
        amount: z.number().positive(),
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data
      const tdb = tenantDb(request.schoolId)

      // Verify parent is linked to this student
      const linkRows = await tdb.query`
        SELECT id FROM parent_student_links
        WHERE parent_id = ${request.user.id}::uuid
        AND student_id = ${d.studentId}::uuid
        AND school_id = ${request.schoolId}::uuid
      ` as any[]
      if (!linkRows[0]) return reply.status(403).send({ error: 'NOT_LINKED' })

      // Get fee structure and student details
      const feeRows = await tdb.query`
        SELECT fs.name AS fee_name, fs.amount AS fee_amount,
               u.full_name AS student_name, u.email AS student_email,
               s.name AS school_name, s.payment_preference, s.paystack_subaccount_code, s.paystack_subaccount_mode,
               s.platform_fee_percent
        FROM fee_structures fs
        JOIN users u ON u.id = ${d.studentId}::uuid AND u.school_id = ${request.schoolId}::uuid
        JOIN schools s ON s.id = ${request.schoolId}::uuid
        WHERE fs.id = ${d.feeStructureId}::uuid AND fs.school_id = ${request.schoolId}::uuid
          AND EXISTS (SELECT 1 FROM student_fee_bill b
                      WHERE b.fee_structure_id = fs.id AND b.student_id = ${d.studentId}::uuid)
      ` as any[]

      const fee = feeRows[0]
      if (!fee) return reply.status(404).send({ error: 'FEE_NOT_FOUND' })

      // Get parent email
      const parentRows = await tdb.query`
        SELECT email FROM users WHERE id = ${request.user.id}::uuid
      ` as any[]
      const parentEmail = parentRows[0]?.email

      const amountKobo = Math.round(d.amount * 100)
      const reference = `FEE-${d.studentId.slice(0, 8)}-${Date.now()}`

      const subaccount = usableSubaccount(fee)
      const routing = routingMetadata(fee, subaccount, amountKobo)
      const paystackPayload: any = {
        email: parentEmail,
        amount: amountKobo,
        reference,
        currency: 'NGN',
        metadata: {
          type: 'fee_payment',
          school_id: request.schoolId,
          student_id: d.studentId,
          fee_structure_id: d.feeStructureId,
          student_name: fee.student_name,
          fee_name: fee.fee_name,
          school_name: fee.school_name,
          ...routing,
        },
        callback_url: `${schoolUrl(request.school.subdomain)}/parent`,
      }

      if (subaccount) {
        paystackPayload.subaccount = subaccount
        paystackPayload.transaction_charge = routing.platform_fee_kobo   // Probitechai's share, per school rate
        paystackPayload.bearer = 'subaccount'
      }

      const paystackRes = await paystackRequest('POST', '/transaction/initialize', paystackPayload)

      if (!paystackRes.status) {
        return reply.status(500).send({ error: 'PAYSTACK_ERROR', message: paystackRes.message })
      }

      // Save pending fee payment record
      await tdb.query`
        INSERT INTO fee_payments (
          school_id, fee_structure_id, student_id, amount_paid,
          payment_method, paystack_reference, paystack_access_code,
          receipt_number, payment_date, recorded_by, status
        )
        VALUES (
          ${request.schoolId}::uuid, ${d.feeStructureId}::uuid,
          ${d.studentId}::uuid, ${d.amount},
          'paystack', ${reference}, ${paystackRes.data.access_code},
          'PENDING', CURRENT_DATE, ${request.user.id}::uuid, 'pending'
        )
      `

      return reply.send({
        authorizationUrl: paystackRes.data.authorization_url,
        accessCode: paystackRes.data.access_code,
        reference,
      })
    })

  // Verify fee payment
  app.get('/paystack/fees/verify', { preHandler: [authenticate, requireRole('parent', 'bursar', 'school_admin')] },
    async (request: any, reply: any) => {
      const { reference } = request.query as any
      if (!reference) return reply.status(400).send({ error: 'reference required' })

      const paystackRes = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`)
      if (!paystackRes.status || paystackRes.data.status !== 'success') {
        return reply.send({ success: false, message: 'Payment not confirmed yet' })
      }

      const meta = paystackRes.data.metadata
      if (meta?.type !== 'fee_payment' || meta.school_id !== request.schoolId) {
        return reply.status(403).send({ error: 'FORBIDDEN' })
      }

      const r = await settleFeePayment(request.schoolId, reference, paystackRes.data)
      if (!r.found) return reply.status(404).send({ error: 'NOT_FOUND' })

      return reply.send({
        success: r.status === 'success',
        receiptNo: r.receiptNo,
        studentName: meta.student_name,
        feeName: meta.fee_name,
        message: `Payment confirmed! Receipt: ${r.receiptNo}`,
      })
    })

  // ── PAYSTACK WEBHOOK ─────────────────────────────────────────────────────
  // Paystack calls this URL when payment events happen
  app.post('/webhooks/paystack', async (request: any, reply: any) => {
    // Verify the signature against the exact bytes Paystack sent
    if (!validSignature(request.rawBody ?? '', request.headers['x-paystack-signature'])) {
      return reply.status(401).send({ error: 'Invalid signature' })
    }

    const event = request.body
    console.log('[PAYSTACK WEBHOOK]', event.event)

    if (event.event === 'charge.success') {
      const meta = event.data.metadata
      const reference = event.data.reference

      if (meta?.type === 'subscription') {
        const r = await settleSubscription(reference, event.data)
        console.log('[PAYSTACK WEBHOOK] Subscription', reference, r)

      } else if (meta?.type === 'fee_payment') {
        const r = await settleFeePayment(meta.school_id, reference, event.data)
        console.log('[PAYSTACK WEBHOOK] Fee payment', reference, r)
      }
    }

    return reply.send({ received: true })
  })
}
