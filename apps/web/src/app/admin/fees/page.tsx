'use client'
import { useState, useEffect } from 'react'

interface Session { id: string; name: string; is_active: boolean }
interface Term { id: string; name: string; is_active: boolean }
interface FeeStructure { id: string; name: string; amount: number; class_level: string; is_mandatory: boolean }
interface LedgerRow {
  studentId: string
  studentName: string
  admissionNo: string
  classArm: string
  totalFees: number
  totalPaid: number
  balance: number
  isPaid: boolean
  feeDetails: { feeId: string; feeName: string; amount: number; paid: number; balance: number }[]
}
interface SummaryRow {
  class_level: string
  fee_per_student: number
  student_count: number
  total_expected: number
  total_collected: number
  total_outstanding: number
}

const CLASS_LEVELS = ['JSS1','JSS2','JSS3','SS1','SS2','SS3']
const CLASS_ARMS = ['A','B','C','D','E','Science','Arts','Commercial','Social Science']

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

function formatAmount(n: number) {
  return `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`
}

export default function FeesPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [terms, setTerms] = useState<Term[]>([])
  const [selectedSession, setSelectedSession] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [classLevel, setClassLevel] = useState('SS2')
  const [classArm, setClassArm] = useState('')
  const [activeTab, setActiveTab] = useState<'structures' | 'ledger' | 'summary'>('structures')

  // Fee structures
  const [structures, setStructures] = useState<FeeStructure[]>([])
  const [showStructureForm, setShowStructureForm] = useState(false)
  const [feeName, setFeeName] = useState('')
  const [feeAmount, setFeeAmount] = useState('')
  const [feeClassLevel, setFeeClassLevel] = useState('SS2')
  const [feeMandatory, setFeeMandatory] = useState(true)
  const [savingStructure, setSavingStructure] = useState(false)

  // Ledger
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [ledgerStructures, setLedgerStructures] = useState<FeeStructure[]>([])
  const [totalFees, setTotalFees] = useState(0)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)

  // Payment modal
  const [showPayment, setShowPayment] = useState(false)
  const [paymentStudent, setPaymentStudent] = useState<LedgerRow | null>(null)
  const [paymentFeeId, setPaymentFeeId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentNotes, setPaymentNotes] = useState('')
  const [payerName, setPayerName] = useState('')
  const [payerBank, setPayerBank] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [transferReference, setTransferReference] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [lastReceipt, setLastReceipt] = useState('')

  // Summary
  const [summary, setSummary] = useState<SummaryRow[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { loadSessions() }, [])
  useEffect(() => { if (selectedSession) loadTerms(selectedSession) }, [selectedSession])

  async function loadSessions() {
    const res = await fetch(`${API}/sessions`, { headers: hdrs() })
    const data = await res.json()
    const list = data.sessions ?? []
    setSessions(list)
    const active = list.find((s: Session) => s.is_active)
    if (active) setSelectedSession(active.id)
  }

  async function loadTerms(sessionId: string) {
    const res = await fetch(`${API}/sessions/${sessionId}/terms`, { headers: hdrs() })
    const data = await res.json()
    const list = data.terms ?? []
    setTerms(list)
    const active = list.find((t: Term) => t.is_active)
    if (active) setSelectedTerm(active.id)
  }

  async function loadStructures() {
    if (!selectedTerm) { setError('Please select a term'); return }
    setLoading(true); setError('')
    const params = new URLSearchParams({ termId: selectedTerm, classLevel })
    const res = await fetch(`${API}/fees/structures?${params}`, { headers: hdrs() })
    const data = await res.json()
    setStructures(data.structures ?? [])
    setLoading(false)
  }

  async function handleCreateStructure() {
    if (!feeName || !feeAmount || !selectedTerm) { setError('All fields required'); return }
    setSavingStructure(true); setError('')
    try {
      const res = await fetch(`${API}/fees/structures`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ termId: selectedTerm, classLevel: feeClassLevel, name: feeName, amount: parseFloat(feeAmount), isMandatory: feeMandatory })
      })
      if (!res.ok) throw new Error('Failed')
      setFeeName(''); setFeeAmount(''); setShowStructureForm(false)
      setSuccess('Fee structure created!'); setTimeout(() => setSuccess(''), 3000)
      loadStructures()
    } catch { setError('Failed to create fee structure') } finally { setSavingStructure(false) }
  }

  async function handleDeleteStructure(id: string, name: string) {
    if (!window.confirm(`Delete fee "${name}"?`)) return
    await fetch(`${API}/fees/structures/${id}`, { method: 'DELETE', headers: hdrs() })
    loadStructures()
  }

  async function loadLedger() {
    if (!selectedTerm || !classLevel) { setError('Please select a term and class'); return }
    setLoading(true); setError('')
    const params = new URLSearchParams({ termId: selectedTerm, classLevel })
    if (classArm) params.append('classArm', classArm)
    const res = await fetch(`${API}/fees/ledger?${params}`, { headers: hdrs() })
    const data = await res.json()
    setLedger(data.ledger ?? [])
    setLedgerStructures(data.structures ?? [])
    setTotalFees(data.totalFees ?? 0)
    setLoading(false)
  }

  async function loadSummary() {
    if (!selectedTerm) { setError('Please select a term'); return }
    setLoading(true); setError('')
    const res = await fetch(`${API}/fees/summary?termId=${selectedTerm}`, { headers: hdrs() })
    const data = await res.json()
    setSummary(data.summary ?? [])
    setLoading(false)
  }

  async function handleRecordPayment() {
    if (!paymentFeeId || !paymentAmount || !paymentStudent) return
    setSavingPayment(true); setError('')
    try {
      const res = await fetch(`${API}/fees/payments`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({
          feeStructureId: paymentFeeId,
          studentId: paymentStudent.studentId,
          amountPaid: parseFloat(paymentAmount),
          paymentMethod,
          paymentDate,
          notes: paymentNotes || undefined,
          payerName: payerName || undefined,
          payerBank: payerBank || undefined,
          accountNumber: accountNumber || undefined,
          transferReference: transferReference || undefined,
        })
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      setLastReceipt(data.receiptNo)
      setLastReceipt(data.receiptNo)
      setSuccess(`Payment recorded! Receipt No: ${data.receiptNo}`)
      setTimeout(() => setSuccess(''), 15000)
      setShowPayment(false)
      setPaymentAmount(''); setPaymentNotes(''); setPaymentFeeId('')
      setPayerName(''); setPayerBank(''); setAccountNumber(''); setTransferReference('')
      loadLedger()
    } catch { setError('Failed to record payment') } finally { setSavingPayment(false) }
  }

  const sel = { padding: '0.5rem 0.625rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '6px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' as const }
  const inp = { ...sel, cursor: 'text' as const }

  return (
    <div style={{ padding: '1.5rem', fontFamily: 'system-ui', maxWidth: 1100 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Fee Management</h1>
        <p style={{ color: '#6b6b65', fontSize: '0.875rem' }}>Set up fee structures, record payments and track outstanding balances.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', overflow: 'hidden', marginBottom: '1.5rem', width: 'fit-content' }}>
        {([
          { key: 'structures', label: '⚙️ Fee Structures' },
          { key: 'ledger', label: '💳 Payment Ledger' },
          { key: 'summary', label: '📊 Collection Summary' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '0.75rem 1.5rem', fontSize: '0.875rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: activeTab === tab.key ? '#1a6b4a' : 'transparent', color: activeTab === tab.key ? 'white' : '#6b6b65' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter panel */}
      <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'summary' ? '1fr 1fr auto' : 'repeat(4, 1fr) auto', gap: '1rem', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Session</label>
            <select style={sel} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
              <option value="">Select…</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}{s.is_active ? ' (Active)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Term</label>
            <select style={sel} value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)}>
              <option value="">Select…</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.name}{t.is_active ? ' (Active)' : ''}</option>)}
            </select>
          </div>
          {activeTab !== 'summary' && (
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Class</label>
              <select style={sel} value={classLevel} onChange={e => setClassLevel(e.target.value)}>
                {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          {activeTab === 'ledger' && (
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Arm</label>
              <select style={sel} value={classArm} onChange={e => setClassArm(e.target.value)}>
                <option value="">All arms</option>
                {CLASS_ARMS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          )}
          <div>
            <button onClick={activeTab === 'structures' ? loadStructures : activeTab === 'ledger' ? loadLedger : loadSummary}
              disabled={loading}
              style={{ padding: '0.625rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, whiteSpace: 'nowrap' as const, width: '100%' }}>
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginBottom: '1rem', fontSize: '0.875rem', color: '#dc2626' }}>{error}</div>}
      {success && (
        <div style={{ padding: '1rem 1.25rem', background: '#e8f5ee', border: '2px solid #1a6b4a', borderRadius: '10px', marginBottom: '1rem' }}>
          <p style={{ fontSize: '0.875rem', color: '#0f4a32', fontWeight: 600, marginBottom: '0.375rem' }}>✅ Payment recorded successfully!</p>
          {lastReceipt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'white', border: '1px solid #1a6b4a', borderRadius: '8px', padding: '0.625rem 1rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#6b6b65', fontWeight: 500 }}>Receipt Number:</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f4a32', letterSpacing: '0.05em' }}>{lastReceipt}</span>
              <button onClick={() => navigator.clipboard.writeText(lastReceipt)}
                style={{ marginLeft: 'auto', padding: '0.25rem 0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
                Copy
              </button>
            </div>
          )}
          <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginTop: '0.5rem' }}>This message will disappear in 15 seconds.</p>
        </div>
      )}

      {/* ── FEE STRUCTURES TAB ── */}
      {activeTab === 'structures' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>{structures.length} fee item{structures.length !== 1 ? 's' : ''} for {classLevel}</p>
            <button onClick={() => setShowStructureForm(true)}
              style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
              + Add fee item
            </button>
          </div>

          {showStructureForm && (
            <div style={{ background: 'white', border: '1.5px solid #1a6b4a', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1rem' }}>New Fee Item</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Fee name</label>
                  <input style={inp} value={feeName} onChange={e => setFeeName(e.target.value)} placeholder="e.g. Tuition Fee, PTA Levy…" autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Amount (₦)</label>
                  <input style={inp} type="number" value={feeAmount} onChange={e => setFeeAmount(e.target.value)} placeholder="e.g. 50000" min={0} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Class level</label>
                  <select style={sel} value={feeClassLevel} onChange={e => setFeeClassLevel(e.target.value)}>
                    {CLASS_LEVELS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <input type="checkbox" id="mandatory" checked={feeMandatory} onChange={e => setFeeMandatory(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a6b4a' }} />
                <label htmlFor="mandatory" style={{ fontSize: '0.875rem', color: '#1a1a18', cursor: 'pointer' }}>Mandatory fee</label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleCreateStructure} disabled={savingStructure}
                  style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: savingStructure ? 0.6 : 1 }}>
                  {savingStructure ? 'Saving…' : 'Save fee item'}
                </button>
                <button onClick={() => { setShowStructureForm(false); setError('') }}
                  style={{ padding: '0.5rem 1.25rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {structures.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💰</p>
              <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>No fee structures yet</p>
              <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>Add fee items like Tuition, PTA Levy, Exam Fee, etc.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              {structures.map((f, i) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderTop: i > 0 ? '1px solid #e5e5e0' : 'none' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>{f.name}</span>
                      {f.is_mandatory && <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: 20, background: '#e8f5ee', color: '#0f4a32' }}>MANDATORY</span>}
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#6b6b65' }}>{f.class_level}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18' }}>{formatAmount(f.amount)}</span>
                    <button onClick={() => handleDeleteStructure(f.id, f.name)}
                      style={{ padding: '0.3rem 0.75rem', background: '#fef2f2', border: 'none', borderRadius: '6px', fontSize: '0.78rem', color: '#dc2626', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ padding: '0.875rem 1.25rem', background: '#f7f7f5', borderTop: '2px solid #e5e5e0', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1a1a18' }}>Total per student ({classLevel})</span>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1a6b4a' }}>
                  {formatAmount(structures.reduce((s, f) => s + Number(f.amount), 0))}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PAYMENT LEDGER TAB ── */}
      {activeTab === 'ledger' && (
        <>
          {ledger.length === 0 && !loading ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💳</p>
              <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Select filters and click Load</p>
              <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>View payment status for each student and record payments.</p>
            </div>
          ) : (
            <>
              {/* Ledger stats */}
              {ledger.length > 0 && (
                <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                  <button onClick={async () => {
                    if (!window.confirm('Send fee reminder SMS to all parents with outstanding balances?')) return
                    const res = await fetch(`${API}/fees/remind-sms`, {
                      method: 'POST', headers: hdrs(),
                      body: JSON.stringify({ termId: selectedTerm, classLevel, classArm: classArm || undefined })
                    })
                    const data = await res.json()
                    setSuccess(data.message ?? 'SMS reminders sent!')
                    setTimeout(() => setSuccess(''), 5000)
                  }}
                    style={{ padding: '0.5rem 1.25rem', background: '#7e22ce', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
                    📱 Send fee reminder SMS
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                  {[
                    { label: 'Total Expected', value: formatAmount(ledger.reduce((s, r) => s + r.totalFees, 0)), color: '#1a1a18' },
                    { label: 'Total Collected', value: formatAmount(ledger.reduce((s, r) => s + r.totalPaid, 0)), color: '#1a6b4a' },
                    { label: 'Outstanding', value: formatAmount(ledger.reduce((s, r) => s + r.balance, 0)), color: '#dc2626' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                      <p style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b6b65', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '0.375rem' }}>{item.label}</p>
                      <p style={{ fontSize: '1.25rem', fontWeight: 700, color: item.color }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 1fr 1fr 1fr 80px auto', gap: '0.75rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                  <span>#</span><span>Student</span><span>Adm. No.</span>
                  <span style={{ textAlign: 'right' as const }}>Total Fees</span>
                  <span style={{ textAlign: 'right' as const }}>Paid</span>
                  <span style={{ textAlign: 'right' as const }}>Balance</span>
                  <span style={{ textAlign: 'center' as const }}>Status</span>
                  <span></span>
                </div>
                {ledger.map((row, i) => (
                  <div key={row.studentId}>
                    <div style={{ display: 'grid', gridTemplateColumns: '32px 2fr 1fr 1fr 1fr 1fr 80px auto', gap: '0.75rem', padding: '0.875rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center', cursor: 'pointer', background: expandedStudent === row.studentId ? '#f9f9f8' : 'white' }}
                      onClick={() => setExpandedStudent(expandedStudent === row.studentId ? null : row.studentId)}>
                      <span style={{ fontSize: '0.78rem', color: '#a0a09a', fontWeight: 600 }}>{i + 1}</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#1a1a18' }}>{row.studentName}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6b6b65' }}>{row.admissionNo ?? '—'}</span>
                      <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, color: '#1a1a18' }}>{formatAmount(row.totalFees)}</span>
                      <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, color: '#1a6b4a', fontWeight: 600 }}>{formatAmount(row.totalPaid)}</span>
                      <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, color: row.balance > 0 ? '#dc2626' : '#1a6b4a', fontWeight: 600 }}>
                        {row.balance > 0 ? formatAmount(row.balance) : '✓ Paid'}
                      </span>
                      <span style={{ textAlign: 'center' as const }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 20, background: row.isPaid ? '#e8f5ee' : '#fef2f2', color: row.isPaid ? '#0f4a32' : '#dc2626' }}>
                          {row.isPaid ? 'PAID' : 'OWING'}
                        </span>
                      </span>
                      <button onClick={e => { e.stopPropagation(); setPaymentStudent(row); setShowPayment(true); setPaymentFeeId(row.feeDetails[0]?.feeId ?? '') }}
                        style={{ padding: '0.375rem 0.875rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                        + Record payment
                      </button>
                    </div>
                    {expandedStudent === row.studentId && (
                      <div style={{ background: '#f9f9f8', borderTop: '1px solid #e5e5e0', padding: '0.875rem 1.25rem 0.875rem 3rem' }}>
                        {row.feeDetails.map(f => (
                          <div key={f.feeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.375rem 0', borderBottom: '1px solid #e5e5e0' }}>
                            <span style={{ fontSize: '0.825rem', color: '#3a3a36' }}>{f.feeName}</span>
                            <div style={{ display: 'flex', gap: '2rem', fontSize: '0.825rem' }}>
                              <span style={{ color: '#6b6b65' }}>Due: {formatAmount(f.amount)}</span>
                              <span style={{ color: '#1a6b4a', fontWeight: 600 }}>Paid: {formatAmount(f.paid)}</span>
                              <span style={{ color: f.balance > 0 ? '#dc2626' : '#1a6b4a', fontWeight: 600 }}>
                                {f.balance > 0 ? `Owed: ${formatAmount(f.balance)}` : '✓ Cleared'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── COLLECTION SUMMARY TAB ── */}
      {activeTab === 'summary' && (
        <>
          {summary.length === 0 && !loading ? (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</p>
              <p style={{ fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Select a term and click Load</p>
              <p style={{ fontSize: '0.825rem', color: '#6b6b65' }}>View fee collection totals across all classes.</p>
            </div>
          ) : (
            <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 1fr 1fr', gap: '1rem', padding: '0.625rem 1.25rem', background: '#f7f7f5', fontSize: '0.72rem', fontWeight: 600, color: '#a0a09a', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '1px solid #e5e5e0' }}>
                <span>Class</span>
                <span style={{ textAlign: 'right' as const }}>Fee/Student</span>
                <span style={{ textAlign: 'center' as const }}>Students</span>
                <span style={{ textAlign: 'right' as const }}>Expected</span>
                <span style={{ textAlign: 'right' as const }}>Collected</span>
                <span style={{ textAlign: 'right' as const }}>Outstanding</span>
              </div>
              {summary.map((s, i) => {
                const collectionRate = Number(s.total_expected) > 0 ? Math.round((Number(s.total_collected) / Number(s.total_expected)) * 100) : 0
                return (
                  <div key={s.class_level} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 1fr 1fr', gap: '1rem', padding: '1rem 1.25rem', borderTop: '1px solid #e5e5e0', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1a1a18' }}>{s.class_level}</span>
                      <div style={{ marginTop: '0.25rem', height: 4, background: '#e5e5e0', borderRadius: 2, overflow: 'hidden', width: 80 }}>
                        <div style={{ width: `${collectionRate}%`, height: '100%', background: collectionRate >= 75 ? '#1a6b4a' : collectionRate >= 50 ? '#d97706' : '#dc2626', borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#6b6b65', marginTop: '0.1rem', display: 'block' }}>{collectionRate}% collected</span>
                    </div>
                    <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, color: '#1a1a18' }}>{formatAmount(s.fee_per_student)}</span>
                    <span style={{ fontSize: '0.875rem', textAlign: 'center' as const, color: '#6b6b65' }}>{s.student_count}</span>
                    <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, color: '#1a1a18' }}>{formatAmount(s.total_expected)}</span>
                    <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, color: '#1a6b4a', fontWeight: 600 }}>{formatAmount(s.total_collected)}</span>
                    <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, color: Number(s.total_outstanding) > 0 ? '#dc2626' : '#1a6b4a', fontWeight: 600 }}>{formatAmount(s.total_outstanding)}</span>
                  </div>
                )
              })}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 1fr 1fr', gap: '1rem', padding: '0.875rem 1.25rem', background: '#f7f7f5', borderTop: '2px solid #e5e5e0' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1a1a18' }}>TOTAL</span>
                <span></span>
                <span style={{ fontSize: '0.875rem', textAlign: 'center' as const, fontWeight: 700, color: '#1a1a18' }}>{summary.reduce((s, r) => s + Number(r.student_count), 0)}</span>
                <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, fontWeight: 700, color: '#1a1a18' }}>{formatAmount(summary.reduce((s, r) => s + Number(r.total_expected), 0))}</span>
                <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, fontWeight: 700, color: '#1a6b4a' }}>{formatAmount(summary.reduce((s, r) => s + Number(r.total_collected), 0))}</span>
                <span style={{ fontSize: '0.875rem', textAlign: 'right' as const, fontWeight: 700, color: '#dc2626' }}>{formatAmount(summary.reduce((s, r) => s + Number(r.total_outstanding), 0))}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Payment modal */}
      {showPayment && paymentStudent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' as const }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '0.25rem' }}>Record Payment</h2>
            <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginBottom: '1.25rem' }}>{paymentStudent.studentName}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Fee item</label>
                <select style={sel} value={paymentFeeId} onChange={e => {
                  setPaymentFeeId(e.target.value)
                  const fee = paymentStudent.feeDetails.find(f => f.feeId === e.target.value)
                  if (fee) setPaymentAmount(String(fee.balance > 0 ? fee.balance : fee.amount))
                }}>
                  {paymentStudent.feeDetails.map(f => (
                    <option key={f.feeId} value={f.feeId}>
                      {f.feeName} (Balance: {formatAmount(f.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Amount paid (₦)</label>
                <input style={inp} type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="Enter amount" min={0} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Payment method</label>
                <select style={sel} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as any)}>
                  <option value="cash">💵 Cash</option>
                  <option value="bank_transfer">🏦 Bank Transfer</option>
                  <option value="card">💳 Card / POS</option>
                  <option value="cheque">📄 Cheque</option>
                </select>
              </div>
              {(paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'card') && (
                <div style={{ background: paymentMethod === 'cheque' ? '#fefce8' : paymentMethod === 'card' ? '#f5f3ff' : '#f0f7ff', border: `1.5px solid ${paymentMethod === 'cheque' ? '#fde68a' : paymentMethod === 'card' ? '#ddd6fe' : '#bfdbfe'}`, borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Header changes per method */}
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e40af', marginBottom: '0.25rem' }}>
                    {paymentMethod === 'bank_transfer' ? '🏦 Bank Transfer Details' : paymentMethod === 'cheque' ? '📄 Cheque Details' : '💳 Card / POS Details'}
                  </p>

                  {/* Payer name — all three methods */}
                  <div>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Payer's full name</label>
                    <input style={inp} value={payerName} onChange={e => setPayerName(e.target.value)} placeholder="e.g. John Adebayo" />
                  </div>

                  {/* Bank name — bank transfer and cheque */}
                  {(paymentMethod === 'bank_transfer' || paymentMethod === 'cheque') && (
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>
                        {paymentMethod === 'cheque' ? 'Issuing bank' : 'Payer\'s bank'}
                      </label>
                      <select style={sel} value={payerBank} onChange={e => setPayerBank(e.target.value)}>
                        <option value="">Select bank…</option>
                        {['Access Bank','Citibank','Ecobank','Fidelity Bank','First Bank','First City Monument Bank','Globus Bank','Guaranty Trust Bank','Heritage Bank','Keystone Bank','Lotus Bank','Polaris Bank','Providus Bank','Stanbic IBTC Bank','Standard Chartered','Sterling Bank','Titan Trust Bank','Union Bank','United Bank for Africa','Unity Bank','Wema Bank','Zenith Bank'].map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Bank Transfer specific fields */}
                  {paymentMethod === 'bank_transfer' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Account number (last 4 digits)</label>
                        <input style={inp} value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="e.g. 1234" maxLength={10} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Transfer reference</label>
                        <input style={inp} value={transferReference} onChange={e => setTransferReference(e.target.value)} placeholder="e.g. TRF123456" />
                      </div>
                    </div>
                  )}

                  {/* Cheque specific fields */}
                  {paymentMethod === 'cheque' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Cheque number</label>
                        <input style={inp} value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="e.g. 000123" />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Cheque date</label>
                        <input style={inp} type="date" value={transferReference} onChange={e => setTransferReference(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {/* Card/POS specific fields */}
                  {paymentMethod === 'card' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Card type</label>
                          <select style={sel} value={payerBank} onChange={e => setPayerBank(e.target.value)}>
                            <option value="">Select…</option>
                            <option value="Verve">Verve</option>
                            <option value="Mastercard">Mastercard</option>
                            <option value="Visa">Visa</option>
                            <option value="American Express">American Express</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Last 4 digits of card</label>
                          <input style={inp} value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="e.g. 4521" maxLength={4} />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Approval/transaction code</label>
                          <input style={inp} value={transferReference} onChange={e => setTransferReference(e.target.value)} placeholder="e.g. 123456" />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>POS terminal ID (optional)</label>
                          <input style={inp} value={payerName.includes('|') ? payerName.split('|')[1] : ''} onChange={e => setPayerName(prev => prev.split('|')[0] + '|' + e.target.value)} placeholder="e.g. TID001" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Payment date</label>
                <input style={inp} type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b6b65', display: 'block', marginBottom: '0.375rem' }}>Notes (optional)</label>
                <input style={inp} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. Part payment, reference number…" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={handleRecordPayment} disabled={savingPayment}
                style={{ flex: 1, padding: '0.75rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: savingPayment ? 0.6 : 1 }}>
                {savingPayment ? 'Saving…' : '💾 Record payment'}
              </button>
              <button onClick={() => { setShowPayment(false); setError('') }}
                style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#6b6b65', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}