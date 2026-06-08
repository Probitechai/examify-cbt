'use client'
import { useState } from 'react'

interface StudentRow {
  fullName: string
  email: string
  admissionNo: string
  classLevel: string
  classArm: string
  password: string
  valid: boolean
  error: string
}

export default function ImportStudentsPage() {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload')
  const [rows, setRows] = useState<StudentRow[]>([])
  const [imported, setImported] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  function downloadTemplate() {
    const csv = [
      'fullName,email,admissionNo,classLevel,classArm,password',
      'Amara Obi,amara.obi@school.examify.ng,SCH/2024/001,SS2,A,Student@1234',
      'Tunde Adeyemi,tunde.adeyemi@school.examify.ng,SCH/2024/002,SS2,B,Student@1234',
      'Ngozi Eze,ngozi.eze@school.examify.ng,SCH/2024/003,SS3,Science,Student@1234',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'students-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCSV(text: string): StudentRow[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    
    // Skip header row
    const dataLines = lines.slice(1)
    
    return dataLines.map((line, i) => {
      // Handle quoted CSV values
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const [fullName, email, admissionNo, classLevel, classArm, password] = cols
      
      let error = ''
      if (!fullName) error = 'Full name is required'
      else if (!email || !email.includes('@')) error = 'Valid email is required'
      else if (!classLevel) error = 'Class level is required'
      else if (!classArm) error = 'Class arm is required'

      return {
        fullName: fullName ?? '',
        email: email ?? '',
        admissionNo: admissionNo ?? '',
        classLevel: classLevel ?? '',
        classArm: classArm ?? '',
        password: password || 'Student@1234',
        valid: !error,
        error,
      }
    }).filter(r => r.fullName || r.email) // Skip empty rows
  }

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      if (parsed.length === 0) {
        alert('No student data found in the CSV file')
        return
      }
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  async function handleImport() {
    setStep('importing')
    const validRows = rows.filter(r => r.valid)
    let successCount = 0
    const importErrors: string[] = []

    const token = document.cookie.split(';')
      .find(c => c.trim().startsWith('examify_token='))?.split('=')[1]

    // Import in batches of 10
    for (let i = 0; i < validRows.length; i += 10) {
      const batch = validRows.slice(i, i + 10)
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/bulk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-School-Subdomain': 'greensprings',
          },
          body: JSON.stringify({
            students: batch.map(r => ({
              fullName: r.fullName,
              email: r.email,
              admissionNo: r.admissionNo || undefined,
              classLevel: r.classLevel,
              classArm: r.classArm,
              password: r.password,
            }))
          })
        })
        const data = await res.json()
        if (res.ok) {
          successCount += data.imported ?? batch.length
        } else {
          importErrors.push(`Batch ${Math.floor(i/10) + 1}: ${data.message ?? 'Failed'}`)
        }
      } catch (err) {
        importErrors.push(`Batch ${Math.floor(i/10) + 1}: Network error`)
      }
      setImported(successCount)
    }

    setErrors(importErrors)
    setStep('done')
  }

  const validCount = rows.filter(r => r.valid).length
  const invalidCount = rows.filter(r => !r.valid).length

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          Import Students
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Upload a CSV file to add multiple students at once
        </p>
      </div>

      {/* Step 1 — Upload */}
      {step === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Download template */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 500, color: '#1e40af', marginBottom: '0.25rem' }}>
                📥 Start with the template
              </p>
              <p style={{ fontSize: '0.8rem', color: '#3b82f6' }}>
                Download the CSV template, fill in your student details, then upload it here.
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              style={{ padding: '0.625rem 1.25rem', background: '#1e40af', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              Download template
            </button>
          </div>

          {/* Upload area */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            style={{
              border: `2px dashed ${dragOver ? '#1a6b4a' : '#e5e5e0'}`,
              borderRadius: '16px',
              padding: '3rem',
              textAlign: 'center',
              background: dragOver ? '#e8f5ee' : 'white',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }}
            onClick={() => document.getElementById('csvInput')?.click()}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📂</div>
            <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              Drop your CSV file here
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              or click to browse your files
            </p>
            <button
              style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
              Choose CSV file
            </button>
            <input
              id="csvInput"
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>

          {/* CSV format guide */}
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.875rem' }}>
              CSV format
            </p>
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem 1rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-secondary)', overflowX: 'auto' }}>
              fullName,email,admissionNo,classLevel,classArm,password<br/>
              Amara Obi,amara@school.ng,SCH/001,SS2,A,Student@1234
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.875rem' }}>
              {[
                { col: 'fullName', req: true, desc: "Student's full name" },
                { col: 'email', req: true, desc: 'Login email address' },
                { col: 'admissionNo', req: false, desc: 'School admission number' },
                { col: 'classLevel', req: true, desc: 'SS1, SS2, or SS3' },
                { col: 'classArm', req: true, desc: 'A, B, Science, Arts, etc.' },
                { col: 'password', req: false, desc: 'Default: Student@1234' },
              ].map(f => (
                <div key={f.col} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.78rem' }}>
                  <span style={{ fontFamily: 'monospace', color: '#1a6b4a', fontWeight: 600 }}>{f.col}</span>
                  <span style={{ color: f.req ? '#dc2626' : 'var(--text-tertiary)' }}>{f.req ? '(required)' : '(optional)'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>— {f.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — Preview */}
      {step === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Total rows</p>
              <p style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--text-primary)' }}>{rows.length}</p>
            </div>
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Ready to import</p>
              <p style={{ fontSize: '2rem', fontWeight: 600, color: '#1a6b4a' }}>{validCount}</p>
            </div>
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Errors</p>
              <p style={{ fontSize: '2rem', fontWeight: 600, color: invalidCount > 0 ? '#dc2626' : 'var(--text-tertiary)' }}>{invalidCount}</p>
            </div>
          </div>

          {/* Preview table */}
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 0.8fr 0.8fr 1.5fr', gap: '0.75rem', padding: '0.625rem 1.25rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              <span>Name</span><span>Email</span><span>Adm. No.</span><span>Class</span><span>Arm</span><span>Status</span>
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 0.8fr 0.8fr 1.5fr', gap: '0.75rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.825rem', background: !row.valid ? '#fef2f2' : 'transparent', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.fullName || '—'}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{row.email || '—'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{row.admissionNo || '—'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{row.classLevel || '—'}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{row.classArm || '—'}</span>
                  <span>
                    {row.valid ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '20px', background: '#e8f5ee', color: '#0f4a32' }}>
                        ✓ Ready
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '20px', background: '#fef2f2', color: '#dc2626' }}>
                        ✗ {row.error}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setRows([]); setStep('upload') }}
              style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}>
              ← Upload different file
            </button>
            {validCount > 0 && (
              <button
                onClick={handleImport}
                style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                Import {validCount} student{validCount > 1 ? 's' : ''} →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3 — Importing */}
      {step === 'importing' && (
        <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '3rem', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '3px solid #e5e5e0', borderTopColor: '#1a6b4a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 1.5rem' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Importing students…
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {imported} of {validCount} imported
          </p>
        </div>
      )}

      {/* Step 4 — Done */}
      {step === 'done' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '2.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              {errors.length === 0 ? '🎉' : '⚠️'}
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
              {errors.length === 0 ? 'Import complete!' : 'Import finished with some errors'}
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              {imported} student{imported > 1 ? 's' : ''} successfully imported
            </p>
            {errors.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                {errors.map((e, i) => (
                  <p key={i} style={{ fontSize: '0.825rem', color: '#dc2626' }}>{e}</p>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center' }}>
              <button
                onClick={() => { setStep('upload'); setRows([]); setErrors([]); setImported(0) }}
                style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', background: 'transparent', cursor: 'pointer' }}>
                Import more students
              </button>
              <a href="/admin/users" style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', fontSize: '0.875rem', fontWeight: 500, borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }}>
                View all students →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
