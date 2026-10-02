// The plan cards on both Subscription pages (School Admin and Proprietor).
// Keep in step with the API: FEATURE_TIERS and TIER_STUDENT_LIMITS in
// apps/api/src/middleware/tier.ts, and the prices Paystack is asked to charge.
export type PlanCard = {
  tier: 'basic' | 'standard' | 'premium' | 'enterprise'
  name: string
  price: number            // per term, in naira; 0 = priced on request
  color: string
  bg: string
  popular?: boolean
  features: string[]
  missing: string[]
}

export const PLANS: PlanCard[] = [
  {
    tier: 'basic', name: 'Basic Plan', price: 50000, color: '#1a6b4a', bg: '#e8f5ee',
    features: [
      'CBT exams, unlimited (5 question types, essay marking)',
      'Question Bank with spreadsheet import',
      'Tab-switch recording during exams',
      'Result entry, report cards with photos, broadsheet',
      'Attendance register',
      'Fee management, receipts and online payment',
      'Class timetable',
      'Announcements',
      'Teacher, parent and student portals',
      'Email notifications',
      'Up to 200 students',
    ],
    missing: ['Gradebook and lesson plans', 'Exam timetable', 'SMS alerts to parents', 'Bursar and finance controls', 'JAMB Prep', 'School analytics'],
  },
  {
    tier: 'standard', name: 'Standard Plan', price: 75000, color: '#1e40af', bg: '#eff6ff', popular: true,
    features: [
      'Everything in Basic, plus:',
      'Curriculum and schemes of work',
      'Lesson plans, resources and assignments',
      'Video upload in lessons',
      'Unified gradebook',
      'Result approval workflow',
      'Conduct reports',
      'Exam timetable (CBT and paper)',
      'Live classes (Jitsi Meet)',
      'Completion certificates',
      'SMS alerts to parents: absences, results, fee reminders',
      'Bursar role and finance controls: discounts, waivers, debtors, reports, audit log',
      'Hostel management',
      'Transport management',
      'Up to 500 students',
    ],
    missing: ['JAMB Prep', 'School analytics', 'Online admissions', 'Interactive lessons and learning paths'],
  },
  {
    tier: 'premium', name: 'Premium Plan', price: 120000, color: '#7e22ce', bg: '#f5f3ff',
    features: [
      'Everything in Standard, plus:',
      'JAMB Prep for SS3: past questions, mock UTME, AI practice',
      'School analytics: results, attendance and fees, term by term',
      'Online admissions with application fees',
      'Interactive lessons: flashcards and in-lesson quizzes',
      'Lesson discussion and Q&A',
      'Learning paths',
      'Hostel operations: exeats, visitors, roll calls, meals',
      'Transport operations: trip roll calls, incidents, maintenance',
      'Priority support',
      'Up to 1,000 students',
    ],
    missing: ['More than 1,000 students'],
  },
  {
    tier: 'enterprise', name: 'Enterprise Plan', price: 0, color: '#b45309', bg: '#fffbeb',
    features: [
      'Everything in Premium, plus:',
      'Unlimited students',
      'Several campuses, set up on request',
      'Links to your other systems, on request',
      'Dedicated account manager',
      'Service-level agreement (SLA)',
    ],
    missing: [],
  },
]
