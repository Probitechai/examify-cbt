// Older code saved some jsonb columns as JSON *strings* ("[{...}]" instead of [{...}]).
// Migration 013 repairs stored rows; these helpers keep reads safe either way.

/** Parse a jsonb value that may have been stored as a JSON string. */
export function asJson<T = any>(v: any, fallback: T): T {
  let out = v
  for (let i = 0; i < 2 && typeof out === 'string'; i++) {
    try { out = JSON.parse(out) } catch { return fallback }
  }
  return (out ?? fallback) as T
}

/**
 * CBT answers: normally { questionId: "A" }. Old autosaves turned the column into an
 * array of snapshots (objects or JSON strings); later snapshots win.
 */
export function mergeAnswers(v: any): Record<string, string> {
  const val = asJson<any>(v, {})
  if (Array.isArray(val)) {
    const out: Record<string, string> = {}
    for (const snap of val) {
      const s = asJson<any>(snap, {})
      if (s && typeof s === 'object' && !Array.isArray(s)) Object.assign(out, s)
    }
    return out
  }
  return val && typeof val === 'object' ? val : {}
}
