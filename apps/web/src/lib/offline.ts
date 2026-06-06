'use client'
import { openDB } from 'idb'

const DB_NAME = 'examify-offline'
const DB_VERSION = 1

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Stores pending answer syncs
      if (!db.objectStoreNames.contains('answer-queue')) {
        db.createObjectStore('answer-queue', { keyPath: 'id', autoIncrement: true })
      }
      // Caches exam questions for offline access
      if (!db.objectStoreNames.contains('exam-cache')) {
        db.createObjectStore('exam-cache', { keyPath: 'examId' })
      }
    },
  })
}

/**
 * Save answers locally immediately, then attempt server sync.
 * If offline, answers stay in the queue and are synced when back online.
 */
export async function saveAnswersOffline(
  sessionId: string,
  answers: Record<string, string>
): Promise<'synced' | 'queued'> {
  const db = await getDb()

  // Always persist locally first
  await db.put('answer-queue', {
    sessionId,
    answers,
    savedAt: new Date().toISOString(),
    synced: false,
  })

  // Try to sync immediately
  if (navigator.onLine) {
    try {
      const { api } = await import('./api')
      await api.saveAnswers(sessionId, answers)
      // Mark all entries for this session as synced
      const tx = db.transaction('answer-queue', 'readwrite')
      const all = await tx.store.getAll()
      for (const entry of all) {
        if (entry.sessionId === sessionId) {
          await tx.store.put({ ...entry, synced: true })
        }
      }
      return 'synced'
    } catch {
      return 'queued'
    }
  }
  return 'queued'
}

/**
 * Flush all unsynced answers for a session — called when connection is restored
 * and on exam submission.
 */
export async function flushOfflineQueue(sessionId: string): Promise<void> {
  const db = await getDb()
  const all = await db.getAll('answer-queue')
  const pending = all.filter(e => e.sessionId === sessionId && !e.synced)

  if (pending.length === 0) return

  // Merge all pending answers (latest wins)
  const merged: Record<string, string> = {}
  for (const entry of pending) {
    Object.assign(merged, entry.answers)
  }

  try {
    const { api } = await import('./api')
    await api.saveAnswers(sessionId, merged)

    const tx = db.transaction('answer-queue', 'readwrite')
    const all2 = await tx.store.getAll()
    for (const entry of all2) {
      if (entry.sessionId === sessionId) {
        await tx.store.put({ ...entry, synced: true })
      }
    }
  } catch (err) {
    console.warn('Offline flush failed — will retry', err)
  }
}

/**
 * Cache exam questions locally so students can continue offline
 */
export async function cacheExamQuestions(
  examId: string,
  data: { session: unknown; questions: unknown[]; totalQuestions: number }
) {
  const db = await getDb()
  await db.put('exam-cache', { examId, data, cachedAt: new Date().toISOString() })
}

export async function getCachedExam(examId: string) {
  const db = await getDb()
  return db.get('exam-cache', examId)
}
