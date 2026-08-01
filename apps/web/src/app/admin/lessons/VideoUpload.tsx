'use client'
import { useState, useRef } from 'react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

interface Props {
  onUploaded: (url: string, fileName: string, fileSizeBytes: number) => void
  onCancel: () => void
}

export default function VideoUpload({ onUploaded, onCancel }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const MAX_SIZE_MB = 500
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return
    if (selected.size > MAX_SIZE_BYTES) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`)
      return
    }
    if (!selected.type.startsWith('video/')) {
      setError('Only video files are allowed.')
      return
    }
    setFile(selected)
    setError('')
  }

  async function uploadVideo() {
    if (!file) return
    setUploading(true)
    setProgress(0)
    setError('')

    try {
      const ext = file.name.split('.').pop()
      const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            setProgress(pct)
          }
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed: ${xhr.status}`))
        })
        xhr.addEventListener('error', () => reject(new Error('Upload failed')))
        xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/lesson-videos/${path}`)
        xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)
        xhr.setRequestHeader('Content-Type', file.type)
        xhr.send(file)
      })

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/lesson-videos/${path}`
      onUploaded(publicUrl, file.name, file.size)
    } catch (e: any) {
      setError(e.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div style={{ background: '#f7f7f5', borderRadius: '12px', padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '0.2rem 0.625rem', borderRadius: 20, background: '#7e22ce', color: 'white' }}>PREMIUM</span>
        <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>Upload Video Directly</p>
      </div>

      {error && <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.825rem', color: '#dc2626' }}>{error}</div>}

      {!file ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ border: '2px dashed #e5e5e0', borderRadius: '12px', padding: '2.5rem', textAlign: 'center' as const, cursor: 'pointer', background: 'white' }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎬</p>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.375rem' }}>Click to select a video</p>
          <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>MP4, WebM, MOV · Max {MAX_SIZE_MB}MB</p>
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} style={{ display: 'none' }} />
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '1rem' }}>
            <div style={{ width: 44, height: 44, background: '#f0fdf4', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>🎬</div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
              <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>{formatSize(file.size)}</p>
            </div>
            {!uploading && (
              <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b6b65', fontSize: '1rem' }}>✕</button>
            )}
          </div>

          {uploading && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>Uploading...</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a6b4a' }}>{progress}%</span>
              </div>
              <div style={{ height: 6, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#1a6b4a', borderRadius: 3, transition: 'width 0.2s' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={uploadVideo} disabled={uploading}
              style={{ flex: 1, padding: '0.625rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: uploading ? 0.7 : 1 }}>
              {uploading ? `Uploading ${progress}%...` : '⬆️ Upload Video'}
            </button>
            <button onClick={onCancel} disabled={uploading}
              style={{ padding: '0.625rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}