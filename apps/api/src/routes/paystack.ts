import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createHmac } from 'crypto'
import { db, tenantDb } from '../db/client'
import { authenticate, requireRole } from '../middleware/auth'

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY
const PAYSTACK_BASE = 'https://api.paystack.co'

// ── Paystack API helper ───────────────────────────────────────────────────────
async function paystackRequest(method: string, path: string, body?: any) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// ── Generate receipt number ───────────────────────────────────────────────────
async function generateReceiptNo(schoolId: string): Promise<string> {
  const rows = await db()`
    SELECT COUNT(*) AS total FROM fee_payments WHERE school_id = ${schoolId}::uuid
  ` as any[]
  const count = Number(rows[0]?.total ?? 0) + 1
  return `RCP-${String(count).padStart(5, '0')}-${new Date().getFullYear()}`
}

export async function paystackRoutes(app: FastifyInstance) {

  // ── SCHOOL SUBSCRIPTION ───────────────────────────────────────────────────

  // Initialize subscription payment
  app.post('/paystack/subscription/initialize', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const schema = z.object({
        tier: z.enum(['starter', 'growth', 'premium']),
        termName: z.string().min(1), // e.g. "Third Term 2025/2026"
      })
      const body = schema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: 'VALIDATION_ERROR' })

      const d = body.data

      const TIER_PRICES: Record<string, number> = {
        starter: 8000000,  // ₦80,000 in kobo
        growth: 15000000,  // ₦150,000 in kobo
        premium: 25000000, // ₦250,000 in kobo
      }

      const TIER_NAMES: Record<string, string> = {
        starter: 'Starter Plan',
        growth: 'Growth Plan',
        premium: 'Premium Plan',
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

      const amount = TIER_PRICES[d.tier]
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
        callback_url: `${process.env.FRONTEND_URL ?? 'https://examify-cbt-web.vercel.app'}/admin/subscription/callback`,
      })

      if (!paystackRes.status) {
        return reply.status(500).send({ error: 'PAYSTACK_ERROR', message: paystackRes.message })
      }

      // Save pending payment record
      await db()`
        INSERT INTO subscription_payments (
          school_id, amount, tier, term_name, paystack_reference,
          paystack_access_code, status
        )
        VALUES (
          ${request.schoolId}::uuid,
          ${amount / 100},
          ${d.tier},
          ${d.termName},
          ${reference},
          ${paystackRes.data.access_code},
          'pending'
        )
      `

      return reply.send({
        authorizationUrl: paystackRes.data.authorization_url,
        accessCode: paystackRes.data.access_code,
        reference,
      })
    })

  // Verify subscription payment
  app.get('/paystack/subscription/verify', { preHandler: [authenticate, requireRole('school_admin')] },
    async (request: any, reply: any) => {
      const { reference } = request.query as any
      if (!reference) return reply.status(400).send({ error: 'reference required' })

      const paystackRes = await paystackRequest('GET', `/transaction/verify/${reference}`)

      if (!paystackRes.status || paystackRes.data.status !== 'success') {
        return reply.send({ success: false, message: paystackRes.data?.gateway_response ?? 'Payment not successful' })
      }

      const meta = paystackRes.data.metadata
      const schoolId = meta.school_id
      const tier = meta.tier
      const termName = meta.term_name

      // Update subscription payment record
      await db()`
        UPDATE subscription_payments
        SET status = 'success', paid_at = now()
        WHERE paystack_reference = ${reference}
      `

      // Update school subscription tier and expiry (one term = ~4 months)
      const expiresAt = new Date()
      expiresAt.setMonth(expiresAt.getMonth() + 4)

      await db()`
        UPDATE schools
        SET subscription_tier = ${tier},
            subscription_expires_at = ${expiresAt.toISOString()},
            subscription_term = ${termName}
        WHERE id = ${schoolId}::uuid
      `

      return reply.send({
        success: true,
        tier,
        termName,
        expiresAt: expiresAt.toISOString(),
        message: `Your school has been upgraded to the ${tier} plan for ${termName}.`,
      })
    })

  // Get subscription history
  app.get('/paystack/subscription/history', { preHandler: [authenticate, requireRole('school_admin')] },
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

  // ── STUDENT FEE PAYMENTS ──────────────────────────────────────────────────

  // Initialize fee payment (called by parent portal)
  app.post('/paystack/fees/initialize', { preHandler: [authenticate, requireRole('parent')] },
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
               s.name AS school_name
        FROM fee_structures fs
        JOIN users u ON u.id = ${d.studentId}::uuid
        JOIN schools s ON s.id = ${request.schoolId}::uuid
        WHERE fs.id = ${d.feeStructureId}::uuid
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

      const paystackRes = await paystackRequest('POST', '/transaction/initialize', {
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
        },
        callback_url: `${process.env.FRONTEND_URL ?? 'https://examify-cbt-web.vercel.app'}/parent`,
      })

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
  app.get('/paystack/fees/verify', { preHandler: [authenticate] },
    async (request: any, reply: any) => {
      const { reference } = request.query as any
      if (!reference) return reply.status(400).send({ error: 'reference required' })

      const paystackRes = await paystackRequest('GET', `/transaction/verify/${reference}`)

      if (!paystackRes.status || paystackRes.data.status !== 'success') {
        return reply.send({ success: false, message: 'Payment not confirmed yet' })
      }

      const meta = paystackRes.data.metadata
      const schoolId = meta.school_id
      const tdb = tenantDb(schoolId)

      // Generate receipt number
      const receiptNo = await generateReceiptNo(schoolId)

      // Update fee payment to success
      await tdb.query`
        UPDATE fee_payments
        SET status = 'success', receipt_number = ${receiptNo}, payment_date = CURRENT_DATE
        WHERE paystack_reference = ${reference}
        AND school_id = ${schoolId}::uuid
      `

      return reply.send({
        success: true,
        receiptNo,
        studentName: meta.student_name,
        feeName: meta.fee_name,
        message: `Payment confirmed! Receipt: ${receiptNo}`,
      })
    })

  // ── PAYSTACK WEBHOOK ─────────────────────────────────────────────────────
  // Paystack calls this URL when payment events happen
  app.post('/webhooks/paystack', async (request: any, reply: any) => {
    // Verify webhook signature
    const hash = createHmac('sha512', PAYSTACK_SECRET ?? '')
      .update(JSON.stringify(request.body))
      .digest('hex')

    if (hash !== request.headers['x-paystack-signature']) {
      return reply.status(401).send({ error: 'Invalid signature' })
    }

    const event = request.body
    console.log('[PAYSTACK WEBHOOK]', event.event)

    if (event.event === 'charge.success') {
      const meta = event.data.metadata
      const reference = event.data.reference

      if (meta?.type === 'subscription') {
        // Activate school subscription
        const tier = meta.tier
        const expiresAt = new Date()
        expiresAt.setMonth(expiresAt.getMonth() + 4)

        await db()`
          UPDATE subscription_payments
          SET status = 'success', paid_at = now()
          WHERE paystack_reference = ${reference}
        `

        await db()`
          UPDATE schools
          SET subscription_tier = ${tier},
              subscription_expires_at = ${expiresAt.toISOString()},
              subscription_term = ${meta.term_name}
          WHERE id = ${meta.school_id}::uuid
        `
        console.log('[PAYSTACK WEBHOOK] Subscription activated for school:', meta.school_id, 'tier:', tier)

      } else if (meta?.type === 'fee_payment') {
        // Confirm fee payment
        const tdb = tenantDb(meta.school_id)
        const receiptNo = await generateReceiptNo(meta.school_id)

        await tdb.query`
          UPDATE fee_payments
          SET status = 'success', receipt_number = ${receiptNo}, payment_date = CURRENT_DATE
          WHERE paystack_reference = ${reference}
          AND school_id = ${meta.school_id}::uuid
        `
        console.log('[PAYSTACK WEBHOOK] Fee payment confirmed:', receiptNo)
      }
    }

    return reply.send({ received: true })
  })
}
