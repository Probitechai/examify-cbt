'use client'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('examify_token='))?.split('=')[1] ?? ''
}
function getSubdomain() {
  try {
    const t = getToken()
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); if (p.schoolSubdomain) return p.schoolSubdomain }
    if (typeof window !== 'undefined') return window.localStorage.getItem('examify_school') ?? ''
  } catch {}
  return ''
}
function hdrs() {
  return { 'Authorization': `Bearer ${getToken()}`, 'X-School-Subdomain': getSubdomain(), 'Content-Type': 'application/json' }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

interface Props {
  lessonId: string
  currentUserId: string
  currentUserRole: string
  currentUserName: string
}

export default function LessonDiscussion({ lessonId, currentUserId, currentUserRole, currentUserName }: Props) {
  const [discussions, setDiscussions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newQuestion, setNewQuestion] = useState('')
  const [posting, setPosting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [postingReply, setPostingReply] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadDiscussions() }, [lessonId])

  async function loadDiscussions() {
    try {
      const res = await fetch(`${API}/lessons/${lessonId}/discussions`, { headers: hdrs() })
      const data = await res.json()
      setDiscussions(data.discussions ?? [])
    } catch {} finally { setLoading(false) }
  }

  async function postQuestion() {
    if (!newQuestion.trim()) return
    setPosting(true); setError('')
    try {
      await fetch(`${API}/lessons/${lessonId}/discussions`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ content: newQuestion.trim() })
      })
      setNewQuestion('')
      loadDiscussions()
    } catch { setError('Failed to post question') } finally { setPosting(false) }
  }

  async function postReply(parentId: string) {
    if (!replyText.trim()) return
    setPostingReply(true); setError('')
    try {
      await fetch(`${API}/lessons/${lessonId}/discussions`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ content: replyText.trim(), parentId })
      })
      setReplyText('')
      setReplyingTo(null)
      loadDiscussions()
    } catch { setError('Failed to post reply') } finally { setPostingReply(false) }
  }

  async function pinQuestion(id: string) {
    await fetch(`${API}/lessons/discussions/${id}/pin`, { method: 'PATCH', headers: hdrs() })
    loadDiscussions()
  }

  async function deleteDiscussion(id: string) {
    if (!window.confirm('Delete this message?')) return
    await fetch(`${API}/lessons/discussions/${id}`, { method: 'DELETE', headers: hdrs() })
    loadDiscussions()
  }

  const isTeacher = currentUserRole === 'school_admin' || currentUserRole === 'teacher'
  const inp = { padding: '0.75rem 1rem', background: '#f7f7f5', border: '1.5px solid #e5e5e0', borderRadius: '10px', fontSize: '0.875rem', color: '#1a1a18', outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, resize: 'vertical' as const }

  return (
    <div style={{ background: 'white', border: '1px solid #e5e5e0', borderRadius: '14px', padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a18', marginBottom: '1.25rem' }}>
        💬 Discussion & Q&A
        <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#6b6b65', marginLeft: '0.5rem' }}>
          {discussions.length} question{discussions.length !== 1 ? 's' : ''}
        </span>
      </h3>

      {error && <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.825rem', color: '#dc2626' }}>{error}</div>}

      {/* Post new question */}
      <div style={{ marginBottom: '1.5rem' }}>
        <textarea
          value={newQuestion}
          onChange={e => setNewQuestion(e.target.value)}
          rows={3}
          placeholder="Ask a question about this lesson..."
          style={inp}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) postQuestion() }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.72rem', color: '#a0a09a' }}>Ctrl+Enter to post</span>
          <button onClick={postQuestion} disabled={posting || !newQuestion.trim()}
            style={{ padding: '0.5rem 1.25rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', opacity: posting || !newQuestion.trim() ? 0.6 : 1 }}>
            {posting ? 'Posting...' : '📤 Post Question'}
          </button>
        </div>
      </div>

      {/* Discussions list */}
      {loading ? (
        <p style={{ fontSize: '0.875rem', color: '#6b6b65', textAlign: 'center' as const }}>Loading discussions...</p>
      ) : discussions.length === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '2rem', background: '#f7f7f5', borderRadius: '12px' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💬</p>
          <p style={{ fontSize: '0.875rem', color: '#6b6b65' }}>No questions yet. Be the first to ask!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {discussions.map(q => (
            <div key={q.id} style={{ border: `1px solid ${q.is_pinned ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '12px', overflow: 'hidden' }}>
              {/* Question */}
              <div style={{ padding: '1rem 1.25rem', background: q.is_pinned ? '#f0fdf4' : 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: q.user_role === 'student' ? '#eff6ff' : '#e8f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 700, color: q.user_role === 'student' ? '#1e40af' : '#0f4a32', flexShrink: 0 }}>
                      {q.user_name?.charAt(0)}
                    </div>
                    <div>
                      <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#1a1a18' }}>{q.user_name}</span>
                      <span style={{ fontSize: '0.68rem', color: '#a0a09a', marginLeft: '0.5rem' }}>{timeAgo(q.created_at)}</span>
                      {q.user_role !== 'student' && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 10, background: '#e8f5ee', color: '#0f4a32', marginLeft: '0.375rem', textTransform: 'capitalize' as const }}>
                          {q.user_role === 'school_admin' ? 'Teacher' : q.user_role}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                    {q.is_pinned && <span style={{ fontSize: '0.65rem', color: '#1a6b4a', fontWeight: 700 }}>📌 Pinned</span>}
                    {q.is_answered && <span style={{ fontSize: '0.65rem', color: '#1a6b4a', fontWeight: 700 }}>✓ Answered</span>}
                    {isTeacher && (
                      <button onClick={() => pinQuestion(q.id)}
                        style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'transparent', border: '1px solid #e5e5e0', borderRadius: 6, cursor: 'pointer', color: '#6b6b65' }}>
                        {q.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                    )}
                    {(q.user_id === currentUserId || isTeacher) && (
                      <button onClick={() => deleteDiscussion(q.id)}
                        style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: 'transparent', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#dc2626' }}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#1a1a18', lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>{q.content}</p>
              </div>

              {/* Replies */}
              {q.replies?.length > 0 && (
                <div style={{ borderTop: '1px solid #f0f0ee', background: '#f9f9f8' }}>
                  {q.replies.map((r: any) => (
                    <div key={r.id} style={{ padding: '0.75rem 1.25rem 0.75rem 2.5rem', borderBottom: '1px solid #f0f0ee' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: 26, height: 26, borderRadius: '50%', background: r.user_role === 'student' ? '#eff6ff' : '#e8f5ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: r.user_role === 'student' ? '#1e40af' : '#0f4a32', flexShrink: 0 }}>
                            {r.user_name?.charAt(0)}
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a1a18' }}>{r.user_name}</span>
                          {r.user_role !== 'student' && (
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: 10, background: '#e8f5ee', color: '#0f4a32', textTransform: 'capitalize' as const }}>
                              {r.user_role === 'school_admin' ? 'Teacher' : r.user_role}
                            </span>
                          )}
                          <span style={{ fontSize: '0.68rem', color: '#a0a09a' }}>{timeAgo(r.created_at)}</span>
                        </div>
                        {(r.user_id === currentUserId || isTeacher) && (
                          <button onClick={() => deleteDiscussion(r.id)}
                            style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem', background: 'transparent', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', color: '#dc2626' }}>
                            Delete
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: '0.825rem', color: '#3a3a36', lineHeight: 1.6, marginLeft: '2rem', whiteSpace: 'pre-wrap' as const }}>{r.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input */}
              <div style={{ borderTop: '1px solid #f0f0ee', padding: '0.75rem 1.25rem', background: '#f9f9f8' }}>
                {replyingTo === q.id ? (
                  <div>
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      rows={2}
                      placeholder={isTeacher ? 'Write your answer...' : 'Write a reply...'}
                      style={{ ...inp, fontSize: '0.825rem' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setReplyingTo(null); setReplyText('') }}
                        style={{ padding: '0.375rem 0.875rem', background: 'transparent', border: '1px solid #e5e5e0', borderRadius: '6px', fontSize: '0.78rem', color: '#6b6b65', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={() => postReply(q.id)} disabled={postingReply || !replyText.trim()}
                        style={{ padding: '0.375rem 0.875rem', background: isTeacher ? '#1a6b4a' : '#1e40af', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: postingReply || !replyText.trim() ? 0.6 : 1 }}>
                        {postingReply ? 'Posting...' : isTeacher ? '✓ Answer' : 'Reply'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setReplyingTo(q.id); setReplyText('') }}
                    style={{ fontSize: '0.78rem', color: isTeacher ? '#1a6b4a' : '#1e40af', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                    {isTeacher ? '↩ Answer this question' : '↩ Reply'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}