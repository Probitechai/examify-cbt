// SMS utility using EbulkSMS API
// Docs: https://www.ebulksms.com/pages/json-api

const EBULKSMS_USERNAME = process.env.EBULKSMS_USERNAME
const EBULKSMS_API_KEY = process.env.EBULKSMS_API_KEY
const EBULKSMS_SENDER_ID = process.env.EBULKSMS_SENDER_ID ?? 'Examify'
// Only set to '1' once you've registered a NUMERIC sender ID for DND-bypass with EbulkSMS —
// using '1' with an unregistered/alphanumeric sender ID will not reliably bypass DND.
const EBULKSMS_DND_BYPASS = process.env.EBULKSMS_DND_BYPASS ?? '0'
const EBULKSMS_URL = 'https://api.ebulksms.com/sendsms.json'

interface SendSmsParams {
  to: string | string[]
  message: string
}

// Normalize Nigerian phone numbers to international format (unchanged — same format EbulkSMS expects)
function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('234')) return cleaned
  if (cleaned.startsWith('0')) return '234' + cleaned.slice(1)
  if (cleaned.length === 10) return '234' + cleaned
  return cleaned
}

export async function sendSms({ to, message }: SendSmsParams): Promise<{ success: boolean; error?: string }> {
  if (!EBULKSMS_USERNAME || !EBULKSMS_API_KEY) {
    console.warn('[SMS] EBULKSMS_USERNAME/EBULKSMS_API_KEY not set — skipping SMS. Would have sent:', message.slice(0, 50))
    return { success: false, error: 'SMS service not configured' }
  }

  const recipients = Array.isArray(to) ? to : [to]
  const normalized = recipients.map(normalizePhone).filter(Boolean)

  if (normalized.length === 0) {
    console.warn('[SMS] No valid phone numbers provided')
    return { success: false, error: 'No valid phone numbers' }
  }

  try {
    const res = await fetch(EBULKSMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SMS: {
          auth: {
            username: EBULKSMS_USERNAME,
            apikey: EBULKSMS_API_KEY,
          },
          message: {
            sender: EBULKSMS_SENDER_ID,
            messagetext: message,
            flash: '0',
          },
          recipients: {
            gsm: normalized.map((msidn, i) => ({
              msidn,
              msgid: `${Date.now()}-${i}`,
            })),
          },
          dndsender: EBULKSMS_DND_BYPASS,
        },
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[SMS] Send failed:', res.status, error)
      return { success: false, error: `SMS send failed: ${res.status}` }
    }

    const data = await res.json()
    const status = data?.response?.status

    if (status !== 'SUCCESS') {
      console.error('[SMS] EbulkSMS returned non-success status:', status)
      return { success: false, error: status ?? 'UNKNOWN_ERROR' }
    }

    console.log('[SMS] Sent successfully to', data?.response?.totalsent ?? normalized.length, 'recipient(s), cost:', data?.response?.cost)
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