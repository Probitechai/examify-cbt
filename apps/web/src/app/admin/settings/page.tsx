'use client'
import { apiFetch, checkAuth, getToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

 

function getSubdomain() {
  try {
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? 'greensprings'
  } catch {}
  return 'greensprings'
}
const API = process.env.NEXT_PUBLIC_API_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default function SettingsPage() {
  const router = useRouter()
  const [logoUrl, setLogoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
    const logoInputRef = useRef<HTMLInputElement>(null)
  const [paymentPreference, setPaymentPreference] = useState('probitechai')
  const [subaccountBank, setSubaccountBank] = useState('')
  const [subaccountAccountNumber, setSubaccountAccountNumber] = useState('')
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([])
  const [selectedBankCode, setSelectedBankCode] = useState('')
  const [newAccountNumber, setNewAccountNumber] = useState('')
  const [resolvedAccountName, setResolvedAccountName] = useState('')
  const [resolving, setResolving] = useState(false)
  const [settingUpDirect, setSettingUpDirect] = useState(false)
  const [switchingPref, setSwitchingPref] = useState(false)
  const [showDirectSetup, setShowDirectSetup] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [paymentSuccess, setPaymentSuccess] = useState('')

  useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { checkAuth(router, 'school_admin') }, [])

  useEffect(() => { loadSettings(); loadPaymentSettings(); loadBanks() }, [])

  async function loadSettings() {
    try {
      const res = await apiFetch(`${API}/auth/me`)
      const data = await res.json()
      const school = data.user?.school
      setSchoolName(school?.name ?? '')
      setSchoolId(school?.id ?? '')

      // Load current logo
      const schoolRes = await apiFetch(`${API}/schools/settings`)
      if (schoolRes.ok) {
        const schoolData = await schoolRes.json()
        setLogoUrl(schoolData.logo_url ?? '')
      }
    } catch {}
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setError('Logo must be smaller than 2MB')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)')
      return
    }

    setUploading(true); setError('')

    try {
      const ext = file.name.split('.').pop()
      const fileName = `${getSubdomain()}-logo-${Date.now()}.${ext}`

      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/school-logos/${fileName}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': file.type,
          },
          body: file,
        }
      )

      if (!uploadRes.ok) throw new Error('Upload failed')

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/school-logos/${fileName}`
      setLogoUrl(publicUrl)
    } catch (e: any) {
      setError('Failed to upload logo. Please try again.')
    } finally {
      setUploading(false)
    }
  }
  async function loadPaymentSettings() {
    try {
      const res = await apiFetch(`${API}/paystack/payment-preference`)
      const data = await res.json()
      setPaymentPreference(data.payment_preference ?? 'probitechai')
      setSubaccountBank(data.paystack_subaccount_bank ?? '')
      setSubaccountAccountNumber(data.paystack_subaccount_account_number ?? '')
    } catch {}
  }

  async function loadBanks() {
    try {
      const res = await apiFetch(`${API}/paystack/banks`)
      const data = await res.json()
      setBanks(data.banks ?? [])
    } catch {}
  }

  async function handleResolveAccount() {
    if (!selectedBankCode || newAccountNumber.length !== 10) {
      setPaymentError('Select a bank and enter a valid 10-digit account number.')
      return
    }
    setResolving(true); setPaymentError(''); setResolvedAccountName('')
    try {
      const res = await apiFetch(`${API}/paystack/resolve-account`, {
        method: 'POST',
        body: JSON.stringify({ accountNumber: newAccountNumber, bankCode: selectedBankCode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Could not verify this account.')
      setResolvedAccountName(data.accountName)
    } catch (e: any) {
      setPaymentError(e.message)
    } finally {
      setResolving(false)
    }
  }

  async function handleSetUpDirect() {
    if (!resolvedAccountName) return
    const bankName = banks.find(b => b.code === selectedBankCode)?.name ?? ''
    setSettingUpDirect(true); setPaymentError('')
    try {
      const res = await apiFetch(`${API}/paystack/subaccount/create`, {
        method: 'POST',
        body: JSON.stringify({ accountNumber: newAccountNumber, bankCode: selectedBankCode, bankName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to set up direct payments.')
      setPaymentSuccess(data.message)
      setShowDirectSetup(false)
      loadPaymentSettings()
    } catch (e: any) {
      setPaymentError(e.message)
    } finally {
      setSettingUpDirect(false)
    }
  }

  async function handleSwitchToProbitechai() {
    setSwitchingPref(true); setPaymentError('')
    try {
      const res = await apiFetch(`${API}/paystack/payment-preference`, {
        method: 'PATCH',
        body: JSON.stringify({ preference: 'probitechai' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to switch.')
      setPaymentSuccess('Switched to receiving payments through Probitechai.')
      loadPaymentSettings()
    } catch (e: any) {
      setPaymentError(e.message)
    } finally {
      setSwitchingPref(false)
    }
  }

  async function handleSwitchToDirect() {
    setSwitchingPref(true); setPaymentError('')
    try {
      const res = await apiFetch(`${API}/paystack/payment-preference`, {
        method: 'PATCH',
        body: JSON.stringify({ preference: 'direct' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Failed to switch.')
      setPaymentSuccess('Switched to direct payments.')
      loadPaymentSettings()
    } catch (e: any) {
      setPaymentError(e.message)
    } finally {
      setSwitchingPref(false)
    }
  }
  async function handleSaveLogo() {
    if (!logoUrl) return
    setSaving(true); setError('')
    try {
      const res = await apiFetch(`${API}/schools/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ logoUrl })
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      // Reload to confirm saved state
      await loadSettings()
    } catch {
      setError('Failed to save logo URL')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 700 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>School Settings</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Manage your school's profile and branding.</p>
      </div>

      {/* School info */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>School Information</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: '#f7f7f5', borderRadius: '10px' }}>
          <div style={{ width: 48, height: 48, background: '#1a6b4a', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '1.25rem', flexShrink: 0 }}>
            {schoolName.charAt(0)}
          </div>
          <div>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18' }}>{schoolName}</p>
            <p style={{ fontSize: '0.78rem', color: '#6b6b65', marginTop: '0.2rem' }}>Subdomain: {getSubdomain()}</p>
          </div>
        </div>
      </div>

      {/* School Logo */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>School Logo</h2>
        <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>
          This logo will appear on all report cards and broadsheets. Use PNG with transparent background for best results. Max 2MB.
        </p>

        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' as const }}>
          {/* Logo preview */}
          <div style={{ width: 140, height: 140, border: '2px dashed #e5e5e0', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7f5', flexShrink: 0, overflow: 'hidden' }}>
            {logoUrl ? (
              <img src={logoUrl} alt="School logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ textAlign: 'center', color: '#a0a09a' }}>
                <p style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>🏫</p>
                <p style={{ fontSize: '0.72rem' }}>No logo yet</p>
              </div>
            )}
          </div>

          {/* Upload controls */}
          <div style={{ flex: 1 }}>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploading}
                style={{ padding: '0.75rem 1.25rem', background: 'white', border: '1.5px solid #1a6b4a', color: '#1a6b4a', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: uploading ? 0.6 : 1, textAlign: 'left' as const }}>
                {uploading ? '⏳ Uploading…' : '📁 Choose logo file'}
              </button>
              {logoUrl && (
                <button
                  onClick={handleSaveLogo}
                  disabled={saving}
                  style={{ padding: '0.75rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : '💾 Save logo'}
                </button>
              )}
              {saved && (
                <p style={{ fontSize: '0.875rem', color: '#0f4a32', fontWeight: 500 }}>✅ Logo saved successfully!</p>
              )}
              {error && (
                <p style={{ fontSize: '0.825rem', color: '#dc2626' }}>{error}</p>
              )}
              <p style={{ fontSize: '0.75rem', color: '#a0a09a', lineHeight: 1.5 }}>
                Supported formats: PNG, JPG, GIF, SVG<br />
                Recommended size: 200×200px or larger<br />
                PNG with transparent background works best
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Payment Settings */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Fee Payment Settings</h2>
        <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>
          Choose how online fee payments from parents reach your school.
        </p>

        {paymentSuccess && (
          <p style={{ fontSize: '0.825rem', color: '#0f4a32', background: '#e8f5ee', padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>{paymentSuccess}</p>
        )}
        {paymentError && (
          <p style={{ fontSize: '0.825rem', color: '#dc2626', background: '#fef2f2', padding: '0.6rem 0.75rem', borderRadius: '8px', marginBottom: '1rem' }}>{paymentError}</p>
        )}

        {paymentPreference === 'direct' && subaccountAccountNumber ? (
          <div>
            <div style={{ background: '#f0faf4', border: '1.5px solid #1a6b4a', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f4a32' }}>✅ Direct payments active</p>
              <p style={{ fontSize: '0.8rem', color: '#3a3a36', marginTop: '0.25rem' }}>
                Fees are paid straight into: {subaccountBank} — ****{subaccountAccountNumber.slice(-4)}
              </p>
            </div>
            <button onClick={handleSwitchToProbitechai} disabled={switchingPref}
              style={{ padding: '0.6rem 1.1rem', background: 'white', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              {switchingPref ? 'Switching…' : 'Switch to receiving through Probitechai instead'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ background: '#f7f7f5', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>Currently: payments go through Probitechai</p>
              <p style={{ fontSize: '0.8rem', color: '#6b6b65', marginTop: '0.25rem' }}>Probitechai receives fee payments and settles with your school separately.</p>
            </div>

            {subaccountAccountNumber ? (
              <button onClick={handleSwitchToDirect} disabled={switchingPref}
                style={{ padding: '0.6rem 1.1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                {switchingPref ? 'Switching…' : `Switch back to direct (${subaccountBank} — ****${subaccountAccountNumber.slice(-4)})`}
              </button>
            ) : !showDirectSetup ? (
              <button onClick={() => setShowDirectSetup(true)}
                style={{ padding: '0.6rem 1.1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                Set up direct payments to my school's account
              </button>
            ) : (
              <div style={{ border: '1.5px solid #1a6b4a', borderRadius: '10px', padding: '1.25rem' }}>
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Bank</label>
                  <select value={selectedBankCode} onChange={e => { setSelectedBankCode(e.target.value); setResolvedAccountName('') }}
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem' }}>
                    <option value="">Select bank…</option>
                    {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: '0.875rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Account number</label>
                  <input value={newAccountNumber} onChange={e => { setNewAccountNumber(e.target.value); setResolvedAccountName('') }}
                    maxLength={10} placeholder="10-digit account number"
                    style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #e5e5e0', borderRadius: '8px', fontSize: '0.875rem' }} />
                </div>
                {!resolvedAccountName ? (
                  <button onClick={handleResolveAccount} disabled={resolving}
                    style={{ padding: '0.6rem 1.1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                    {resolving ? 'Verifying…' : 'Verify account'}
                  </button>
                ) : (
                  <>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f4a32', marginBottom: '0.875rem' }}>Account name: {resolvedAccountName}</p>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button onClick={handleSetUpDirect} disabled={settingUpDirect}
                        style={{ padding: '0.6rem 1.1rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                        {settingUpDirect ? 'Setting up…' : 'Confirm & activate'}
                      </button>
                      <button onClick={() => { setShowDirectSetup(false); setResolvedAccountName('') }}
                        style={{ padding: '0.6rem 1.1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Result Configuration link */}
      <div style={{ background: '#f0faf4', border: '1.5px solid #1a6b4a', borderRadius: '14px', padding: '1.25rem 1.5rem' }}>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f4a32', marginBottom: '0.25rem' }}>⚙️ Result Configuration</p>
        <p style={{ fontSize: '0.825rem', color: '#3a3a36', marginBottom: '0.75rem' }}>
          Set CA/Exam weighting, grade boundaries and class position settings for your school.
        </p>
        <a href="/admin/result-config"
          style={{ display: 'inline-block', padding: '0.5rem 1rem', background: '#1a6b4a', color: 'white', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, textDecoration: 'none' }}>
          Configure grading →
        </a>
      </div>
    </div>
  )
}
