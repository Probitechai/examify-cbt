// Which school a page is for, read from the web address:
//   https://greensprings.examify.ng/login         → "greensprings"
//   https://<any-site>/login?school=greensprings  → "greensprings"
// The second form is used where one website serves every school
// (staging, or the plain Vercel address), e.g. links in emails.
export function schoolFromUrl(): string {
  if (typeof window === 'undefined') return ''
  const parts = window.location.hostname.split('.')
  if (parts.length === 3 && parts[1] === 'examify') return parts[0]
  const fromQuery = new URLSearchParams(window.location.search).get('school') ?? ''
  return /^[a-z0-9-]{1,63}$/i.test(fromQuery) ? fromQuery.toLowerCase() : ''
}
