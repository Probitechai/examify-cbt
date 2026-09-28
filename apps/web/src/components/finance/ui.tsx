'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks for the Bursar portal and the Proprietor finance pages.
// Same look as the rest of Examify: inline styles, green #1a6b4a, grey borders.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { apiFetch } from '@/lib/auth'

export const API = process.env.NEXT_PUBLIC_API_URL

// ── API helper: never throws on 4xx/5xx, always returns parsed JSON ─────────
export async function call<T = any>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const method = (init.method ?? 'GET').toUpperCase()
  // Railway: non-GET requests must always carry a JSON body
  const body = method === 'GET' ? undefined : (init.body ?? JSON.stringify({}))
  const res = await apiFetch(`${API}${path}`, { ...init, body })
  let data: any = {}
  try { data = await res.json() } catch {}
  return { ok: res.ok, status: res.status, data }
}

export function errorText(data: any, fallback = 'Something went wrong. Please try again.'): string {
  if (!data) return fallback
  if (data.message) return data.message
  const issues = data.issues?.fieldErrors
  if (issues) {
    const first = Object.values(issues).flat()[0]
    if (first) return String(first)
  }
  if (data.error) return String(data.error).replace(/_/g, ' ').toLowerCase()
  return fallback
}

// ── Formatting ───────────────────────────────────────────────────────────────
export function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0)
  return `₦${v.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
export function today(): string {
  return new Date().toISOString().split('T')[0]
}
export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
export const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank transfer', pos: 'POS', card: 'Card', cheque: 'Cheque', paystack: 'Paystack',
}

// ── CSV export (done in the browser) ─────────────────────────────────────────
export function downloadCsv(filename: string, columns: { key: string; label: string }[], rows: any[]) {
  const esc = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map(c => esc(c.label)).join(',')]
  for (const r of rows) lines.push(columns.map(c => esc(r[c.key])).join(','))
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Sessions & terms (defaults to the active term) ───────────────────────────
export interface Term { id: string; name: string; is_active: boolean }
export interface Session { id: string; name: string; is_active: boolean }

export function useTerms() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [sessionId, setSessionId] = useState('')
  const [termId, setTermId] = useState('')

  useEffect(() => {
    call('/sessions').then(r => {
      const list: Session[] = r.data.sessions ?? []
      setSessions(list)
      const active = list.find(s => s.is_active) ?? list[0]
      if (active) setSessionId(active.id)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!sessionId) return
    call(`/sessions/${sessionId}/terms`).then(r => {
      const list: Term[] = r.data.terms ?? []
      setTerms(list)
      const active = list.find(t => t.is_active) ?? list[0]
      setTermId(active ? active.id : '')
    }).catch(() => {})
  }, [sessionId])

  return { sessions, terms, sessionId, setSessionId, termId, setTermId }
}

// ── Styles ───────────────────────────────────────────────────────────────────
export const S = {
  page: { padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1150 } as CSSProperties,
  h1: { fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' } as CSSProperties,
  sub: { color: '#6b6b65', fontSize: '0.875rem' } as CSSProperties,
  card: { background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: '1.25rem' } as CSSProperties,
  label: { fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' } as CSSProperties,
  input: { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: 6, fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' } as CSSProperties,
  btn: { padding: '0.55rem 1.1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnGhost: { padding: '0.55rem 1.1rem', background: 'white', color: '#3a3a36', border: '1px solid #e5e5e0', borderRadius: 8, fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnSmall: { padding: '0.3rem 0.6rem', border: '1px solid #e5e5e0', borderRadius: 6, background: 'white', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  btnDanger: { padding: '0.3rem 0.6rem', border: '1px solid #fecaca', borderRadius: 6, background: 'white', color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  th: { textAlign: 'left', padding: '0.6rem 0.75rem', fontSize: '0.68rem', fontWeight: 700, color: '#a0a09a', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f7f7f5', borderBottom: '1px solid #e5e5e0', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '0.65rem 0.75rem', fontSize: '0.84rem', color: '#1a1a18', borderTop: '1px solid #f0f0ee', verticalAlign: 'top' } as CSSProperties,
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as CSSProperties,
}

// ── Components ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
      <div>
        <h1 style={S.h1}>{title}</h1>
        {subtitle && <p style={S.sub}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  )
}

type Tone = 'success' | 'error' | 'info' | 'warning'
const TONES: Record<Tone, { bg: string; border: string; color: string }> = {
  success: { bg: '#e8f5ee', border: '#a7d7bf', color: '#0f4a32' },
  error: { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
  info: { bg: '#f3f4f6', border: '#e5e7eb', color: '#374151' },
  warning: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
}
export function Banner({ tone = 'info', children, onClose }: { tone?: Tone; children: ReactNode; onClose?: () => void }) {
  const t = TONES[tone]
  return (
    <div style={{ padding: '0.8rem 1rem', background: t.bg, border: `1px solid ${t.border}`, color: t.color, borderRadius: 10, marginBottom: '1rem', fontSize: '0.86rem', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
      <div>{children}</div>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: t.color, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>}
    </div>
  )
}

export function Pill({ children, tone = 'info' }: { children: ReactNode; tone?: Tone }) {
  const t = TONES[tone]
  return (
    <span style={{ padding: '0.18rem 0.55rem', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: t.bg, color: t.color, border: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

export function statusTone(status: string): Tone {
  if (status === 'approved' || status === 'success' || status === 'active') return 'success'
  if (status === 'rejected' || status === 'failed') return 'error'
  if (status === 'pending') return 'warning'
  return 'info'
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'warning' | 'danger' }) {
  let color = '#1a1a18'
  if (tone === 'warning') color = '#92400e'
  if (tone === 'danger') color = '#b91c1c'
  return (
    <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, padding: '1rem 1.25rem' }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>{label}</p>
      <p style={{ fontSize: '1.35rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {hint && <p style={{ fontSize: '0.75rem', color: '#a0a09a', marginTop: '0.25rem' }}>{hint}</p>}
    </div>
  )
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>{children}</div>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: '0.72rem', color: '#a0a09a', marginTop: '0.25rem' }}>{hint}</p>}
    </div>
  )
}

export function TermPicker({ t, extra }: { t: ReturnType<typeof useTerms>; extra?: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
      <Field label="Session">
        <select style={S.input} value={t.sessionId} onChange={e => t.setSessionId(e.target.value)}>
          {t.sessions.length === 0 && <option value="">No sessions</option>}
          {t.sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (Active)' : ''}</option>)}
        </select>
      </Field>
      <Field label="Term">
        <select style={S.input} value={t.termId} onChange={e => t.setTermId(e.target.value)}>
          {t.terms.length === 0 && <option value="">No terms</option>}
          {t.terms.map(x => <option key={x.id} value={x.id}>{x.name}{x.is_active ? ' (Active)' : ''}</option>)}
        </select>
      </Field>
      {extra}
    </div>
  )
}

export function DateRange({ from, to, setFrom, setTo, extra }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void; extra?: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
      <Field label="From"><input type="date" style={S.input} value={from} onChange={e => setFrom(e.target.value)} /></Field>
      <Field label="To"><input type="date" style={S.input} value={to} onChange={e => setTo(e.target.value)} /></Field>
      {extra}
    </div>
  )
}

export function Table({ head, children, empty, loading, colSpan }: { head: ReactNode; children: ReactNode; empty?: boolean; loading?: boolean; colSpan: number }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: 14, overflowX: 'auto', marginBottom: '1.25rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head}</tr></thead>
        <tbody>
          {/* Only show "Loading…" when there is nothing on screen yet: a refresh keeps the
              current rows (and anything open inside them) mounted */}
          {loading && empty ? (
            <tr><td colSpan={colSpan} style={{ ...S.td, textAlign: 'center', color: '#6b6b65', padding: '1.5rem' }}>Loading…</td></tr>
          ) : empty ? (
            <tr><td colSpan={colSpan} style={{ ...S.td, textAlign: 'center', color: '#6b6b65', padding: '1.5rem' }}>Nothing to show.</td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  )
}

export function Modal({ title, children, onClose, width = 460 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, padding: '1.5rem', width, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '1rem' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

// ── "Can I change fee records?" — drives read-only UI ───────────────────────
export interface FinanceAccess { canWrite: boolean; reason: string; grantExpiresAt: string | null }

export function useFinanceAccess() {
  const [access, setAccess] = useState<FinanceAccess | null>(null)
  useEffect(() => {
    call<FinanceAccess>('/finance/access').then(r => {
      if (r.ok) setAccess(r.data)
      else setAccess({ canWrite: false, reason: 'role', grantExpiresAt: null })
    }).catch(() => setAccess({ canWrite: false, reason: 'role', grantExpiresAt: null }))
  }, [])
  // Fail closed: until we know, treat as read-only
  return { access, readOnly: access ? !access.canWrite : true }
}

export function AccessBanner({ access }: { access: FinanceAccess | null }) {
  if (!access) return null
  if (access.reason === 'bursar_active') {
    return <Banner tone="info">Fees are managed by the Bursar. You can view everything here but can't make changes. If the Bursar is unavailable, ask the Proprietor for temporary access.</Banner>
  }
  if (access.reason === 'emergency_grant') {
    return <Banner tone="warning"><strong>Temporary fee access</strong> granted by the Proprietor, until {fmtDateTime(access.grantExpiresAt)}. Every action is logged.</Banner>
  }
  if (access.reason === 'inactive') {
    return <Banner tone="error">Your account has been deactivated.</Banner>
  }
  return null
}
