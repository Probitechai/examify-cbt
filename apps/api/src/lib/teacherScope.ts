// What a teacher may see and change.
//   Subject teacher  (teacher_subject_assignments): a subject in a class level,
//                    in one arm, or in every arm when the arm is left blank.
//   Class teacher    (class_teachers): one class level and arm, all subjects.
// School Admins and Proprietors are not limited. Parents see their linked
// children, students see themselves.

export type SubjectAssignment = { classLevel: string; classArm: string | null; subject: string }
export type ClassAssignment = { classLevel: string; classArm: string }
export type TeacherScope = { subjects: SubjectAssignment[]; classTeacherOf: ClassAssignment[] }

const same = (a: unknown, b: unknown) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

export async function loadTeacherScope(tdb: any, schoolId: string, teacherId: string): Promise<TeacherScope> {
  const subjects = await tdb.query`
    SELECT class_level, class_arm, subject FROM teacher_subject_assignments
    WHERE school_id = ${schoolId}::uuid AND teacher_id = ${teacherId}::uuid
  ` as any[]
  const classes = await tdb.query`
    SELECT class_level, class_arm FROM class_teachers
    WHERE school_id = ${schoolId}::uuid AND teacher_id = ${teacherId}::uuid
  ` as any[]
  return {
    subjects: subjects.map((r: any) => ({
      classLevel: r.class_level, classArm: String(r.class_arm ?? '').trim() || null, subject: r.subject,
    })),
    classTeacherOf: classes.map((r: any) => ({ classLevel: r.class_level, classArm: r.class_arm })),
  }
}

/** Class teacher of this class and arm */
export function isClassTeacher(scope: TeacherScope, classLevel: string, classArm: string | null | undefined) {
  return scope.classTeacherOf.some(c => same(c.classLevel, classLevel) && same(c.classArm, classArm))
}

/** Teaches this subject to this class and arm (a blank arm in the assignment means every arm) */
export function teachesSubject(scope: TeacherScope, classLevel: string, classArm: string | null | undefined, subject: string) {
  return scope.subjects.some(a =>
    same(a.classLevel, classLevel) && (!a.classArm || same(a.classArm, classArm)) && same(a.subject, subject))
}

/** Teaches any subject to this class and arm, or is its class teacher */
export function canSeeClass(scope: TeacherScope, classLevel: string, classArm: string | null | undefined) {
  return isClassTeacher(scope, classLevel, classArm) ||
    scope.subjects.some(a => same(a.classLevel, classLevel) && (!a.classArm || same(a.classArm, classArm)))
}

/** May see this subject's marks for a student in this class and arm */
export function canSeeSubject(scope: TeacherScope, classLevel: string, classArm: string | null | undefined, subject: string | null | undefined) {
  if (isClassTeacher(scope, classLevel, classArm)) return true
  return !!subject && teachesSubject(scope, classLevel, classArm, subject)
}

export type StudentRow = { id: string; class_level: string; class_arm: string | null; full_name?: string }

export async function findStudent(tdb: any, schoolId: string, studentId: string): Promise<StudentRow | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(studentId))) return null
  const rows = await tdb.query`
    SELECT id, full_name, class_level, class_arm FROM users
    WHERE id = ${studentId}::uuid AND school_id = ${schoolId}::uuid AND role = 'student'
  ` as any[]
  return rows[0] ?? null
}

/**
 * Whether the signed-in user may look at this student's records.
 * Returns the teacher's scope too, so callers can narrow by subject.
 */
export async function studentAccess(tdb: any, request: any, student: StudentRow):
  Promise<{ allowed: boolean; scope: TeacherScope | null }> {
  const role = request.user.role
  if (role === 'school_admin' || role === 'proprietor') return { allowed: true, scope: null }
  if (role === 'student') return { allowed: student.id === request.user.id, scope: null }
  if (role === 'parent') {
    const link = await tdb.query`
      SELECT 1 FROM parent_student_links
      WHERE parent_id = ${request.user.id}::uuid AND student_id = ${student.id}::uuid
        AND school_id = ${request.schoolId}::uuid
      LIMIT 1
    ` as any[]
    return { allowed: link.length > 0, scope: null }
  }
  if (role === 'teacher') {
    const scope = await loadTeacherScope(tdb, request.schoolId, request.user.id)
    return { allowed: canSeeClass(scope, student.class_level, student.class_arm), scope }
  }
  return { allowed: false, scope: null }
}

export const NOT_YOUR_CLASS = {
  error: 'NOT_ASSIGNED',
  message: 'You can only see classes and subjects you are assigned to. Ask your School Admin if this is wrong.',
}
