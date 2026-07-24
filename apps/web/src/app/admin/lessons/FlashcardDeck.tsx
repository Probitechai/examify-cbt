'use client'
import { useState } from 'react'

interface Flashcard {
  id: string
  front: string
  back: string
  hint: string | null
}

interface Props {
  cards: Flashcard[]
  isTeacher?: boolean
  onDelete?: (id: string) => void
}

export default function FlashcardDeck({ cards, isTeacher, onDelete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [unknown, setUnknown] = useState<Set<string>>(new Set())
  const [completed, setCompleted] = useState(false)

  if (cards.length === 0) return (
    <div style={{ textAlign: 'center' as const, padding: '2rem', background: '#f7f7f5', borderRadius: '12px', color: '#6b6b65', fontSize: '0.875rem' }}>
      No flashcards yet.
    </div>
  )

  const card = cards[currentIndex]
  const progress = ((currentIndex) / cards.length) * 100

  function next() {
    setFlipped(false)
    setShowHint(false)
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(i => i + 1)
    } else {
      setCompleted(true)
    }
  }

  function prev() {
    setFlipped(false)
    setShowHint(false)
    if (currentIndex > 0) setCurrentIndex(i => i - 1)
  }

  function markKnown() {
    setKnown(prev => new Set([...prev, card.id]))
    setUnknown(prev => { const s = new Set(prev); s.delete(card.id); return s })
    next()
  }

  function markUnknown() {
    setUnknown(prev => new Set([...prev, card.id]))
    setKnown(prev => { const s = new Set(prev); s.delete(card.id); return s })
    next()
  }

  function restart() {
    setCurrentIndex(0)
    setFlipped(false)
    setShowHint(false)
    setCompleted(false)
    setKnown(new Set())
    setUnknown(new Set())
  }

  if (completed) return (
    <div style={{ textAlign: 'center' as const, padding: '2rem' }}>
      <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎉</p>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1a1a18', marginBottom: '0.5rem' }}>Session Complete!</h3>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', margin: '1rem 0 1.5rem' }}>
        <div style={{ textAlign: 'center' as const }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a6b4a' }}>{known.size}</p>
          <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Known ✓</p>
        </div>
        <div style={{ textAlign: 'center' as const }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{unknown.size}</p>
          <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Need review</p>
        </div>
        <div style={{ textAlign: 'center' as const }}>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a18' }}>{cards.length}</p>
          <p style={{ fontSize: '0.72rem', color: '#6b6b65' }}>Total cards</p>
        </div>
      </div>
      <button onClick={restart}
        style={{ padding: '0.625rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
        🔄 Study Again
      </button>
    </div>
  )

  return (
    <div>
      {/* Progress bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.78rem', color: '#6b6b65' }}>Card {currentIndex + 1} of {cards.length}</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.72rem', color: '#1a6b4a', fontWeight: 600 }}>✓ {known.size}</span>
          <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600 }}>✗ {unknown.size}</span>
        </div>
      </div>
      <div style={{ height: 4, background: '#f0f0ee', borderRadius: 2, marginBottom: '1.25rem', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: '#1a6b4a', borderRadius: 2, transition: 'width 0.3s' }} />
      </div>

      {/* Card */}
      <div onClick={() => setFlipped(f => !f)}
        style={{ background: flipped ? '#1a6b4a' : 'white', border: `2px solid ${flipped ? '#1a6b4a' : '#e5e5e0'}`, borderRadius: '16px', padding: '2.5rem 2rem', minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center' as const, marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: flipped ? 'rgba(255,255,255,0.7)' : '#a0a09a', marginBottom: '1rem' }}>
          {flipped ? 'ANSWER' : 'QUESTION'}
        </p>
        <p style={{ fontSize: '1.1rem', fontWeight: 600, color: flipped ? 'white' : '#1a1a18', lineHeight: 1.5 }}>
          {flipped ? card.back : card.front}
        </p>
        {!flipped && card.hint && showHint && (
          <p style={{ fontSize: '0.825rem', color: '#6b6b65', marginTop: '1rem', fontStyle: 'italic' }}>💡 {card.hint}</p>
        )}
        {!flipped && (
          <p style={{ fontSize: '0.72rem', color: '#a0a09a', marginTop: '1.5rem' }}>Click to reveal answer</p>
        )}
      </div>

      {/* Hint button */}
      {!flipped && card.hint && !showHint && (
        <div style={{ textAlign: 'center' as const, marginBottom: '0.75rem' }}>
          <button onClick={e => { e.stopPropagation(); setShowHint(true) }}
            style={{ fontSize: '0.78rem', color: '#d97706', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            💡 Show hint
          </button>
        </div>
      )}

      {/* Action buttons */}
      {flipped ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <button onClick={markUnknown}
            style={{ padding: '0.75rem', background: '#fef2f2', border: '2px solid #fecaca', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
            ✗ Still learning
          </button>
          <button onClick={markKnown}
            style={{ padding: '0.75rem', background: '#e8f5ee', border: '2px solid #1a6b4a', borderRadius: '12px', fontSize: '0.875rem', fontWeight: 600, color: '#0f4a32', cursor: 'pointer' }}>
            ✓ Got it!
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={prev} disabled={currentIndex === 0}
            style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer', opacity: currentIndex === 0 ? 0.4 : 1 }}>
            ← Previous
          </button>
          <button onClick={() => setFlipped(true)}
            style={{ padding: '0.5rem 1.5rem', background: '#1a6b4a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}>
            Flip Card
          </button>
          <button onClick={next}
            style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1.5px solid #e5e5e0', borderRadius: '8px', fontSize: '0.825rem', color: '#6b6b65', cursor: 'pointer' }}>
            Skip →
          </button>
        </div>
      )}

      {/* Teacher delete view */}
      {isTeacher && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #f0f0ee' }}>
          <p style={{ fontSize: '0.72rem', color: '#6b6b65', marginBottom: '0.5rem' }}>All cards ({cards.length}):</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {cards.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: i === currentIndex ? '#f0fdf4' : '#f7f7f5', borderRadius: '8px', border: i === currentIndex ? '1px solid #1a6b4a' : '1px solid transparent' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#1a1a18' }}>{c.front}</span>
                  <span style={{ fontSize: '0.72rem', color: '#6b6b65', marginLeft: '0.5rem' }}>→ {c.back}</span>
                </div>
                {onDelete && (
                  <button onClick={() => onDelete(c.id)}
                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', background: '#fef2f2', border: 'none', borderRadius: 4, cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                    Del
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
