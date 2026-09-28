// Records every successful Paystack collection for the settlement ledger
import { paystackMode } from './paystack'

/** Paystack's local-card price, used only if Paystack doesn't report the fee:
 *  1.5% + ₦100 (₦100 waived under ₦2,500), capped at ₦2,000. */
export function estimatePaystackFee(amount: number): number {
  let fee = amount * 0.015 + (amount >= 2500 ? 100 : 0)
  if (fee > 2000) fee = 2000
  return Math.round(fee * 100) / 100
}

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Metadata added when a payment starts, so the ledger knows later how it was
 * routed and at what rate — even if the school's settings change meanwhile.
 */
export function routingMetadata(school: { platform_fee_percent?: any }, subaccount: string | null, amountKobo: number) {
  const rate = Number(school.platform_fee_percent ?? 0.4)
  return {
    routing: subaccount ? 'direct' : 'probitechai',
    platform_rate: rate,
    platform_fee_kobo: Math.round(amountKobo * rate / 100),
  }
}

/** Inside the settling transaction. Idempotent on the Paystack reference. */
export async function recordCollection(tx: any, p: {
  schoolId: string
  source: 'school_fee' | 'admission_fee'
  reference: string
  feePaymentId?: string | null
  data: any                       // Paystack transaction (verify response or webhook data)
}) {
  const d = p.data ?? {}
  const meta = d.metadata ?? {}
  const amount = r2(Number(d.amount ?? 0) / 100)
  const reported = d.fees != null && !Number.isNaN(Number(d.fees))
  const paystackFee = reported ? r2(Number(d.fees) / 100) : estimatePaystackFee(amount)

  let rate = Number(meta.platform_rate)
  if (Number.isNaN(rate) || meta.platform_rate == null) {
    const [s] = await tx`SELECT platform_fee_percent FROM schools WHERE id = ${p.schoolId}::uuid` as any[]
    rate = Number(s?.platform_fee_percent ?? 0.4)
  }
  let routed: 'direct' | 'probitechai' = meta.routing === 'direct' || meta.routing === 'probitechai'
    ? meta.routing
    : (d.subaccount?.subaccount_code ? 'direct' : 'probitechai')
  let platformFee = r2(amount * rate / 100)
  if (routed === 'direct' && meta.platform_fee_kobo != null) platformFee = r2(Number(meta.platform_fee_kobo) / 100)
  const schoolShare = r2(amount - paystackFee - platformFee)

  await tx`
    INSERT INTO platform_collections (school_id, source, reference, fee_payment_id, routed_via, paystack_mode,
      amount, paystack_fee, fee_estimated, platform_fee, platform_rate, school_share)
    VALUES (${p.schoolId}::uuid, ${p.source}, ${p.reference}, ${p.feePaymentId ?? null}, ${routed}, ${paystackMode()},
      ${amount}, ${paystackFee}, ${!reported}, ${platformFee}, ${rate}, ${schoolShare})
    ON CONFLICT (reference) DO NOTHING
  `
}
