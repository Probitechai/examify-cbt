// SMS utility using Termii API
// Docs: https://developers.termii.com/messaging

const TERMII_API_KEY = process.env.TERMII_API_KEY
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID ?? 'N-Alert'
const TERMII_BASE_URL = 'https://v3.api.termii.com'

interface SendSmsParams {
  to: string | string[]
  message: string
}

// Normalize Nigerian phone numbers to international format
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('234')) return cleaned
  if (cleaned.startsWith('0')) return '234' + cleaned.slice(1)
  if (cleaned.length === 10) return '234' + cleaned
  return cleaned
}

export async function sendSms({ to, message }: SendSmsParams): Promise<{ success: boolean; error?: string }> {
  if (!TERMII_API_KEY) {
    console.warn('[SMS] TERMII_API_KEY not set — skipping SMS. Would have sent:', message.slice(0, 50))
    return { success: false, error: 'SMS service not configured' }
  }

  const recipients = Array.isArray(to) ? to : [to]
  const normalized = recipients.map(normalizePhone).filter(Boolean)

  if (normalized.length === 0) {
    console.warn('[SMS] No valid phone numbers provided')
    return { success: false, error: 'No valid phone numbers' }
  }

  try {
    const res = await fetch(`${TERMII_BASE_URL}/api/sms/send/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TERMII_API_KEY,
        to: normalized,
        from: TERMII_SENDER_ID,
        sms: message,
        type: 'plain',
        channel: 'generic',
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[SMS] Send failed:', res.status, error)
      return { success: false, error: `SMS send failed: ${res.status}` }
    }

    const data = await res.json()
    console.log('[SMS] Sent successfully to', normalized.length, 'recipient(s)')
    return { success: true }
  } catch (err: any) {
    console.error('[SMS] Exception:', err.message)
    return { success: false, error: err.message }
  }
}

export function absenceAlertSms(params: {
  schoolName: string
  studentName: string
  date: string
}): string {
  const { schoolName, studentName, date } = params
  return `${schoolName}: ${studentName} was marked ABSENT on ${date}. If this is an error, contact the school. - Examify`
}

export function feeReminderSms(params: {
  schoolName: string
  studentName: string
  balance: number
  termName: string
}): string {
  const { schoolName, studentName, balance, termName } = params
  return `${schoolName}: Dear Parent, ${studentName} has an outstanding fee balance of NGN${balance.toLocaleString()} for ${termName}. Please make payment. - Examify`
}

export function resultReleaseSms(params: {
  schoolName: string
  studentName: string
  termName: string
  loginUrl: string
}): string {
  const { schoolName, studentName, termName, loginUrl } = params
  return `${schoolName}: ${studentName}'s ${termName} results are now available. Login to view: ${loginUrl} - Examify`
}