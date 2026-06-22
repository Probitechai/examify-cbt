// Email HTML templates for Examify notifications
// All templates use inline styles for maximum email client compatibility

const BRAND_COLOR = '#1a6b4a'
const BRAND_DARK = '#0f4a32'

function wrapper(schoolName: string, content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f7f7f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f5; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e5e5e0;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%); padding: 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="display:inline-block; width:32px; height:32px; background:rgba(255,255,255,0.2); border-radius:8px; color:#ffffff; font-weight:700; font-size:16px; text-align:center; line-height:32px; vertical-align:middle;">E</span>
                    <span style="color:#ffffff; font-weight:700; font-size:16px; margin-left:10px; vertical-align:middle;">Examify</span>
                  </td>
                </tr>
              </table>
              <p style="color:rgba(255,255,255,0.85); font-size:13px; margin:8px 0 0;">${schoolName}</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color:#f7f7f5; border-top:1px solid #e5e5e0;">
              <p style="color:#a0a09a; font-size:12px; margin:0; text-align:center; line-height:1.6;">
                This is an automated message from Examify CBT Platform.<br>
                Sent on behalf of ${schoolName}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

function button(text: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="background-color:${BRAND_COLOR}; border-radius:10px;">
          <a href="${url}" style="display:inline-block; padding:12px 28px; color:#ffffff; font-weight:600; font-size:14px; text-decoration:none;">${text}</a>
        </td>
      </tr>
    </table>
  `.trim()
}

// ─────────────────────────────────────────────────────────────────────────
// 1. LOGIN CREDENTIALS EMAIL
// ─────────────────────────────────────────────────────────────────────────
export function loginCredentialsEmail(params: {
  schoolName: string
  fullName: string
  email: string
  password: string
  loginUrl: string
  role: string
}): { subject: string; html: string } {
  const { schoolName, fullName, email, password, loginUrl, role } = params
  const roleLabel = role === 'teacher' ? 'Teacher' : role === 'school_admin' ? 'Administrator' : 'Student'

  const content = `
    <h1 style="color:#1a1a18; font-size:20px; font-weight:700; margin:0 0 16px;">Welcome to Examify, ${fullName.split(' ')[0]}! 👋</h1>
    <p style="color:#3a3a36; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Your ${roleLabel.toLowerCase()} account has been created for <strong>${schoolName}</strong> on the Examify CBT Platform. Here are your login details:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f5; border-radius:10px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin:0 0 8px; font-size:13px; color:#6b6b65;">Email address</p>
          <p style="margin:0 0 16px; font-size:15px; color:#1a1a18; font-weight:600;">${email}</p>
          <p style="margin:0 0 8px; font-size:13px; color:#6b6b65;">Temporary password</p>
          <p style="margin:0; font-size:15px; color:#1a1a18; font-weight:600; font-family: 'Courier New', monospace;">${password}</p>
        </td>
      </tr>
    </table>

    <p style="color:#3a3a36; font-size:14px; line-height:1.6; margin:0 0 8px;">
      ⚠️ <strong>Important:</strong> Please change your password after your first login.
    </p>

    ${button('Log in to Examify →', loginUrl)}

    <p style="color:#a0a09a; font-size:13px; line-height:1.6; margin:20px 0 0;">
      If you didn't expect this email, please contact your school administrator.
    </p>
  `

  return {
    subject: `Your Examify login details — ${schoolName}`,
    html: wrapper(schoolName, content),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. EXAM REMINDER EMAIL
// ─────────────────────────────────────────────────────────────────────────
export function examReminderEmail(params: {
  schoolName: string
  fullName: string
  examTitle: string
  subject: string
  scheduledAt: string
  durationMinutes: number
  loginUrl: string
}): { subject: string; html: string } {
  const { schoolName, fullName, examTitle, subject, scheduledAt, durationMinutes, loginUrl } = params

  const examDate = new Date(scheduledAt)
  const formattedDate = examDate.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const formattedTime = examDate.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })

  const content = `
    <h1 style="color:#1a1a18; font-size:20px; font-weight:700; margin:0 0 16px;">📅 Upcoming Exam Reminder</h1>
    <p style="color:#3a3a36; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Hi ${fullName.split(' ')[0]}, this is a reminder that you have an exam scheduled soon.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb; border:1.5px solid #fde68a; border-radius:10px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 18px 20px;">
          <p style="margin:0 0 4px; font-size:12px; color:#92400e; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">${subject}</p>
          <p style="margin:0 0 14px; font-size:17px; color:#1a1a18; font-weight:700;">${examTitle}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:13px; color:#6b6b65; padding-bottom:4px;">📆 Date</td>
              <td style="font-size:13px; color:#1a1a18; font-weight:600; text-align:right;">${formattedDate}</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:#6b6b65; padding-bottom:4px;">🕐 Time</td>
              <td style="font-size:13px; color:#1a1a18; font-weight:600; text-align:right;">${formattedTime}</td>
            </tr>
            <tr>
              <td style="font-size:13px; color:#6b6b65;">⏱ Duration</td>
              <td style="font-size:13px; color:#1a1a18; font-weight:600; text-align:right;">${durationMinutes} minutes</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="color:#3a3a36; font-size:14px; line-height:1.6; margin:0 0 8px;"><strong>Before the exam:</strong></p>
    <ul style="color:#3a3a36; font-size:14px; line-height:1.7; margin:0 0 20px; padding-left:20px;">
      <li>Make sure you know your login details</li>
      <li>Use a stable internet connection</li>
      <li>Find a quiet place to take the exam</li>
      <li>Log in a few minutes early</li>
    </ul>

    ${button('Go to Examify →', loginUrl)}
  `

  return {
    subject: `Reminder: ${examTitle} — ${formattedDate}`,
    html: wrapper(schoolName, content),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. RESULT READY EMAIL
// ─────────────────────────────────────────────────────────────────────────
export function resultReadyEmail(params: {
  schoolName: string
  fullName: string
  examTitle: string
  subject: string
  score: number
  totalMarks: number
  percentage: number
  passed: boolean
  loginUrl: string
}): { subject: string; html: string } {
  const { schoolName, fullName, examTitle, subject, score, totalMarks, percentage, passed, loginUrl } = params

  const resultColor = passed ? '#1a6b4a' : '#dc2626'
  const resultBg = passed ? '#e8f5ee' : '#fef2f2'
  const resultLabel = passed ? 'PASSED ✓' : 'NOT PASSED'

  const content = `
    <h1 style="color:#1a1a18; font-size:20px; font-weight:700; margin:0 0 16px;">📊 Your Result is Ready</h1>
    <p style="color:#3a3a36; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Hi ${fullName.split(' ')[0]}, your result for the following exam has been released:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f5; border-radius:10px; margin: 0 0 16px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin:0 0 4px; font-size:12px; color:#6b6b65; text-transform:uppercase; letter-spacing:0.05em;">${subject}</p>
          <p style="margin:0; font-size:16px; color:#1a1a18; font-weight:700;">${examTitle}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${resultBg}; border-radius:10px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 24px; text-align:center;">
          <p style="margin:0 0 4px; font-size:36px; font-weight:800; color:${resultColor}; letter-spacing:-0.02em;">${Math.round(percentage)}%</p>
          <p style="margin:0 0 12px; font-size:13px; color:#6b6b65;">${score} out of ${totalMarks} marks</p>
          <span style="display:inline-block; padding:6px 16px; background-color:#ffffff; border-radius:20px; font-size:12px; font-weight:700; color:${resultColor};">${resultLabel}</span>
        </td>
      </tr>
    </table>

    ${button('View full result →', loginUrl)}

    <p style="color:#a0a09a; font-size:13px; line-height:1.6; margin:20px 0 0;">
      Log in to see your answer review and track your progress across all subjects.
    </p>
  `

  return {
    subject: `Result ready: ${examTitle} — ${Math.round(percentage)}%`,
    html: wrapper(schoolName, content),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. WEEKLY PROGRESS REPORT EMAIL
// ─────────────────────────────────────────────────────────────────────────
export function weeklyProgressEmail(params: {
  schoolName: string
  fullName: string
  weekRange: string
  examsTaken: number
  examsPassed: number
  avgScore: number
  bestSubject: { subject: string; score: number } | null
  weakestSubject: { subject: string; score: number } | null
  loginUrl: string
}): { subject: string; html: string } {
  const { schoolName, fullName, weekRange, examsTaken, examsPassed, avgScore, bestSubject, weakestSubject, loginUrl } = params

  const content = `
    <h1 style="color:#1a1a18; font-size:20px; font-weight:700; margin:0 0 6px;">📈 Weekly Progress Report</h1>
    <p style="color:#6b6b65; font-size:13px; margin:0 0 20px;">${weekRange}</p>
    <p style="color:#3a3a36; font-size:14px; line-height:1.6; margin:0 0 20px;">
      Hi ${fullName.split(' ')[0]}, here's a summary of your exam activity this week.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 20px;">
      <tr>
        <td width="33%" style="background-color:#f7f7f5; border-radius:10px; padding:16px; text-align:center;">
          <p style="margin:0 0 2px; font-size:24px; font-weight:700; color:#1a6b4a;">${examsTaken}</p>
          <p style="margin:0; font-size:11px; color:#6b6b65;">Exams taken</p>
        </td>
        <td width="2%"></td>
        <td width="33%" style="background-color:#f7f7f5; border-radius:10px; padding:16px; text-align:center;">
          <p style="margin:0 0 2px; font-size:24px; font-weight:700; color:#1a6b4a;">${examsPassed}</p>
          <p style="margin:0; font-size:11px; color:#6b6b65;">Passed</p>
        </td>
        <td width="2%"></td>
        <td width="33%" style="background-color:#f7f7f5; border-radius:10px; padding:16px; text-align:center;">
          <p style="margin:0 0 2px; font-size:24px; font-weight:700; color:#7e22ce;">${avgScore}%</p>
          <p style="margin:0; font-size:11px; color:#6b6b65;">Avg score</p>
        </td>
      </tr>
    </table>

    ${bestSubject ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8f5ee; border-radius:10px; margin: 0 0 12px;">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="margin:0; font-size:13px; color:#0f4a32;">⭐ <strong>Strongest subject:</strong> ${bestSubject.subject} (${bestSubject.score}%)</p>
        </td>
      </tr>
    </table>
    ` : ''}

    ${weakestSubject ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2; border-radius:10px; margin: 0 0 20px;">
      <tr>
        <td style="padding: 14px 18px;">
          <p style="margin:0; font-size:13px; color:#991b1b;">📚 <strong>Needs improvement:</strong> ${weakestSubject.subject} (${weakestSubject.score}%)</p>
        </td>
      </tr>
    </table>
    ` : ''}

    ${button('View full progress →', loginUrl)}
  `

  return {
    subject: `Weekly progress report — ${weekRange}`,
    html: wrapper(schoolName, content),
  }
}
