export type UserRole = 'super_admin' | 'school_admin' | 'teacher' | 'student' | 'parent'

export interface AuthUser {
  id: string
  role: UserRole
  email: string
  fullName: string
  classLevel?: string
  classArm?: string
  school: {
    id: string
    name: string
    subdomain: string
  }
}

export interface ExamSummary {
  id: string
  title: string
  subject: string
  durationMinutes: number
  scheduledAt: string
  endsAt: string
  status: 'scheduled' | 'active' | 'completed' | 'cancelled'
  sessionStatus: 'not_started' | 'in_progress' | 'submitted' | 'timed_out' | null
}

export interface Question {
  id: string
  type: 'mcq' | 'true_false' | 'short_answer'
  questionText: string
  imageUrl?: string
  options?: Array<{ key: string; text: string }>
  marks: number
}

export interface ExamSession {
  id: string
  status: string
  serverDeadline: string
  answers: Record<string, string>
}

export interface ExamResult {
  score: number
  percentage: number
  passed: boolean
  totalMarks: number
}
