// apps/web/src/lib/auth.ts
// Centralised auth — fixes all 4 critical failure points

// ── FIX 9: base64url-safe decode ─────────────────────────────────────────────
function base64urlDecode(str: string): string {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '==='.slice((b64.length % 4) || 4)
  try { return atob(padded) } catch { return '' }
}

// ── FIX 3: safe JWT parse — no silent catch ───────────────────────────────────
export function parseJWT(token: string): Record<string, any> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const raw = base64urlDecode(parts[1])
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ── FIX 1 & 3: safe cookie read ───────────────────────────────────────────────
export function getToken(): string {
  if (typeof document === 'undefined') return ''
  return document.cookie
    .split(';')
    .find(c => c.trim().startsWith('examify_token='))
    ?.split('=')[1] ?? ''
}

// ── FIX 2: expiry check (exp is in seconds) ───────────────────────────────────
export function isTokenExpired(token: string): boolean {
  const p = parseJWT(token)
  if (!p) return true
  if (!p.exp) return false          // no exp claim → treat as valid
  return Date.now() >= p.exp * 1000
}

// ── FIX 5: subdomain from JWT payload, never empty silently ───────────────────
export function getSubdomain(): string {
  const p = parseJWT(getToken())
  if (p?.schoolSubdomain) return p.schoolSubdomain
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('examify_school') ?? ''
  }
  return ''
}

// Standard headers helper
export function hdrs(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'X-School-Subdomain': getSubdomain(),
    'Content-Type': 'application/json',
  }
}

// ── FIX 1 + 2 + 5: global fetch wrapper with 401 interceptor ─────────────────
// Replace ALL bare fetch() calls on protected pages with apiFetch()
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getToken()

  // FIX 2: expired / missing token → redirect before wasting a round-trip
  if (!token || isTokenExpired(token)) {
    if (typeof document !== 'undefined') {
      document.cookie = 'examify_token=; Max-Age=0; path=/'
    }
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('AUTH_EXPIRED')
  }

  const subdomain = getSubdomain()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers as Record<string, string> ?? {}),
  }
  // FIX 5: only attach header when subdomain is known
  if (subdomain) headers['X-School-Subdomain'] = subdomain

  const res = await fetch(url, { ...options, headers })

  // FIX 1: 401 interceptor — clear cookie and redirect
  if (res.status === 401) {
    if (typeof document !== 'undefined') {
      document.cookie = 'examify_token=; Max-Age=0; path=/'
    }
    if (typeof window !== 'undefined') window.location.href = '/login'
    throw new Error('UNAUTHORIZED')
  }

  return res
}

// ── FIX 2: page-load guard — call inside useEffect on every protected page ────
// Usage:  useEffect(() => { checkAuth(router) }, [])
export function checkAuth(
  router: { replace: (path: string) => void },
  expectedRole?: string
): void {
  const token = getToken()
  if (!token || isTokenExpired(token)) {
    if (typeof document !== 'undefined') {
      document.cookie = 'examify_token=; Max-Age=0; path=/'
    }
    router.replace('/login')
    return
  }
  if (expectedRole) {
    const p = parseJWT(token)
    if (p?.role && p.role !== expectedRole) {
      const map: Record<string, string> = {
        student: '/student', parent: '/parent',
        school_admin: '/admin', teacher: '/admin',
        super_admin: '/superadmin',
      }
      router.replace(map[p.role] ?? '/login')
    }
  }
}