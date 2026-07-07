'use client'
import { useState, useEffect, useRef } from 'react'

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}
function getSubdomain() {
  try {
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? 'greensprings'
  } catch {}
  return 'greensprings'
}
function hdrs() {
  return { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}

const API = process.env.NEXT_PUBLIC_API_URL
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default function SettingsPage() {
  const [logoUrl, setLogoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolId, setSchoolId] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadSettings() }, [])

  async function loadSettings() {
    try {
      const res = await fetch(`${API}/auth/me`, { headers: hdrs() })
      const data = await res.json()
      const school = data.user?.school
      setSchoolName(school?.name ?? '')
      setSchoolId(school?.id ?? '')

      // Load current logo
      const schoolRes = await fetch(`${API}/schools/settings`, { headers: hdrs() })
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

  async function handleSaveLogo() {
    if (!logoUrl) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`${API}/schools/settings`, {
        method: 'PATCH',
        headers: hdrs(),
        body: JSON.stringify({ logoUrl })
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
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
