'use client'

export async function saveAnswersOffline(
  sessionId: string,
  answers: Record<string, string>
): Promise<'synced' | 'queued'> {
  try {
    const { api } = await import('./api')
    await api.saveAnswers(sessionId, answers)
    return 'synced'
  } catch {
    return 'queued'
  }
}

export async function flushOfflineQueue(sessionId: string): Promise<void> {
  // No-op in this version — answers saved directly
}

export async function cacheExamQuestions(
  examId: string,
  data: any
): Promise<void> {
  // No-op in this version
}

export async function getCachedExam(examId: string): Promise<any> {
  return null
}