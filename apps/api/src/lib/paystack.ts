import { db } from '../db/client'
// Paystack helpers shared by fees, subscriptions and admissions
import { createHmac, timingSafeEqual } from 'crypto'

const BASE = process.env.PAYSTACK_API_URL ?? 'https://api.paystack.co'   // override only for tests

export function paystackSecret(): string {
  return process.env.PAYSTACK_SECRET_KEY ?? ''
}

/** 'live' | 'test' | 'unset', from the secret key's prefix */
export function paystackMode(): 'live' | 'test' | 'unset' {
  const k = paystackSecret()
  if (k.startsWith('sk_live_')) return 'live'
  if (k.startsWith('sk_test_')) return 'test'
  return 'unset'
}

/** The demo school never takes real money: with a live key, its online payments are refused */
export async function demoPaymentBlocked(schoolId: string): Promise<boolean> {
  if (paystackMode() !== 'live') return false
  try {
    const rows = await db()`SELECT is_demo FROM schools WHERE id = ${schoolId}::uuid` as any[]
    return rows[0]?.is_demo === true
  } catch { return false }
}
export const DEMO_PAYMENT_REPLY = { error: 'DEMO_SCHOOL', message: 'Online payments are switched off in the demo school.' }

export async function paystackRequest(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${paystackSecret()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

// schoolUrl moved to lib/urls.ts (kept exported here for older imports)
export { schoolUrl } from './urls'

/** Checks Paystack's webhook signature against the exact bytes Paystack sent */
export function validSignature(rawBody: string, signature: unknown): boolean {
  if (typeof signature !== 'string' || !paystackSecret()) return false
  const expected = createHmac('sha512', paystackSecret()).update(rawBody).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** A school's saved subaccount is usable only in the mode it was created in */
export function usableSubaccount(school: { payment_preference?: string; paystack_subaccount_code?: string | null; paystack_subaccount_mode?: string | null }): string | null {
  if (school.payment_preference !== 'direct' || !school.paystack_subaccount_code) return null
  if ((school.paystack_subaccount_mode ?? 'test') !== paystackMode()) return null
  return school.paystack_subaccount_code
}
