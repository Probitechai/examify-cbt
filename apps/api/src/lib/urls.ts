// Web addresses Examify puts in emails, SMS and Paystack payment returns.
//
// Live: each school has its own address, e.g. https://greensprings.examify.ng
// Staging: there is one website for every school, so set SCHOOL_SITE_URL to it
// (e.g. https://examify-cbt-web-clvb.vercel.app). Links then go there, and
// carry ?school=<subdomain> so the sign-in page picks the right school.

function siteOverride(): string | null {
  const url = (process.env.SCHOOL_SITE_URL ?? '').trim().replace(/\/+$/, '')
  return url || null
}

/** The base address of a school's website (no trailing slash) */
export function schoolUrl(subdomain: string): string {
  const site = siteOverride()
  if (site) return site
  const domain = process.env.APP_DOMAIN ?? 'examify.ng'
  return `https://${subdomain}.${domain}`
}

/** A link to a page on a school's website, for emails and SMS */
export function schoolLink(subdomain: string, path: string): string {
  const site = siteOverride()
  if (!site) return `${schoolUrl(subdomain)}${path}`
  const sep = path.includes('?') ? '&' : '?'
  return `${site}${path}${sep}school=${encodeURIComponent(subdomain)}`
}
