import Cookies from 'js-cookie'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = Cookies.get('examify_token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-School-Subdomain': 'greensprings',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  } catch (err) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Please check your connection.')
  }

  let data: any = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }

  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'UNKNOWN', data.message ?? 'Something went wrong')
  }
  return data as T
}

export const api = {
  // Auth
  login: async (email: string, password: string) => {
    const data = await request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    // Normalise response — ensure school object always exists
    const user = data.user ?? {}
    return {
      token: data.token,
      user: {
        id: user.id ?? '',
        role: user.role ?? 'student',
        email: user.email ?? email,
        fullName: user.fullName ?? user.full_name ?? '',
        classLevel: user.classLevel ?? user.class_level,
        classArm: user.classArm ?? user.class_arm,
        school: user.school ?? {
          id: '',
          name: 'Greensprings Academy',
          subdomain: 'greensprings',
        },
      },
    }
  },

  me: async () => {
    const data = await request<any>('/auth/me')
    const user = data.user ?? {}
    return {
      user: {
        id: user.id ?? '',
        role: user.role ?? 'student',
        email: user.email ?? '',
        fullName: user.fullName ?? user.full_name ?? '',
        classLevel: user.classLevel ?? user.class_level,
        classArm: user.classArm ?? user.class_arm,
        school: user.school ?? {
          id: '',
          name: 'Greensprings Academy',
          subdomain: 'greensprings',
        },
      },
    }
  },

  // Exams (student)
  getAvailableExams: () =>
    request<{ exams: any[] }>('/exams/available'),

  startExam: (examId: string) =>
  request<{ sessionId: string; resumed: boolean }>(`/exams/${examId}/start`, { 
    method: 'POST',
    body: JSON.stringify({}),
  }),
  getExamSession: (examId: string) =>
    request<{ session: any; questions: any[]; totalQuestions: number }>(`/exams/${examId}/session`),

  saveAnswers: (sessionId: string, answers: Record<string, string>) =>
    request<{ saved: boolean }>(`/sessions/${sessionId}/answers`, {
      method: 'PATCH',
      body: JSON.stringify({ answers }),
    }),

  submitExam: (sessionId: string) =>
  request<{ submitted: boolean; result: any }>(`/sessions/${sessionId}/submit`, { 
    method: 'POST',
    body: JSON.stringify({}),
  }),
  // Admin / Teacher
  getExams: () =>
    request<{ exams: any[] }>('/exams'),

  getResults: (examId: string) =>
    request<{ results: any[]; stats: any }>(`/exams/${examId}/results`),

  getUsers: (role?: string) =>
    request<{ users: any[] }>(`/users${role ? `?role=${role}` : ''}`),

  createUser: (data: any) =>
    request<{ userId: string }>('/users', { method: 'POST', body: JSON.stringify(data) }),

  getQuestions: () =>
    request<{ questions: any[] }>('/questions'),

  createQuestion: (data: any) =>
    request<{ questionId: string }>('/questions', { method: 'POST', body: JSON.stringify(data) }),
}
