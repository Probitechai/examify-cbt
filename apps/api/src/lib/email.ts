// Email utility using Resend API
// Docs: https://resend.com/docs/api-reference/emails/send-email

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'Examify <onboarding@resend.dev>'

interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not set — skipping email send. Would have sent:', subject, 'to', to)
    return { success: false, error: 'Email service not configured' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const error = await res.text()
      console.error('[EMAIL] Send failed:', res.status, error)
      return { success: false, error: `Email send failed: ${res.status}` }
    }

    const data = await res.json()
    console.log('[EMAIL] Sent successfully:', data.id, 'to', to)
    return { success: true }
  } catch (err: any) {
    console.error('[EMAIL] Exception:', err.message)
    return { success: false, error: err.message }
  }
}

// Send multiple emails in parallel, but cap concurrency to avoid rate limits
export async function sendBulkEmails(emails: SendEmailParams[]): Promise<{ sent: number; failed: number }> {
  const BATCH_SIZE = 10
  let sent = 0
  let failed = 0

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(e => sendEmail(e)))
    sent += results.filter(r => r.success).length
    failed += results.filter(r => !r.success).length
    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return { sent, failed }
}
