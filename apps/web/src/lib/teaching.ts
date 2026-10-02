'use client'
// What the signed-in teacher teaches, so pages offer only their own classes.
// School Admins get { limited: false } and see everything.
import { useEffect, useState } from 'react'
import { apiFetch, getToken, parseJWT } from '@/lib/auth'
import { sortClassLevels } from '@/lib/classLevels'

export type Teaching = {
  loaded: boolean
  limited: boolean                     // true for teachers
  subjects: { classLevel: string; classArm: string | null; subject: string }[]
  classTeacherOf: { classLevel: string; classArm: string }[]
}

const same = (a?: string | null, b?: string | null) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

let cache: { token: string; promise: Promise<Teaching> } | null = null
function load(): Promise<Teaching> {
  const token = getToken() ?? ''
  if (!cache || cache.token !== token) {
    const role = parseJWT(token)?.role
    cache = {
      token,
      promise: role !== 'teacher'
        ? Promise.resolve({ loaded: true, limited: false, subjects: [], classTeacherOf: [] })
        : apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/me/teaching`)
            .then(r => (r.ok ? r.json() : null))
            .then(d => ({ loaded: true, limited: true, subjects: d?.subjects ?? [], classTeacherOf: d?.classTeacherOf ?? [] }))
            .catch(() => ({ loaded: true, limited: true, subjects: [], classTeacherOf: [] })),
    }
  }
  return cache.promise
}

export function useTeaching(): Teaching {
  const [t, setT] = useState<Teaching>({ loaded: false, limited: false, subjects: [], classTeacherOf: [] })
  useEffect(() => { let on = true; load().then(v => on && setT(v)); return () => { on = false } }, [])
  return t
}

/** Class levels the teacher teaches in or is class teacher for */
export function teachingLevels(t: Teaching): string[] {
  const all = [...t.subjects.map(s => s.classLevel), ...t.classTeacherOf.map(c => c.classLevel)]
  return sortClassLevels([...new Set(all)])
}

/** Class levels where the teacher is class teacher */
export function classTeacherLevels(t: Teaching): string[] {
  return sortClassLevels([...new Set(t.classTeacherOf.map(c => c.classLevel))])
}

/** Arms of a level the teacher is class teacher for */
export function classTeacherArms(t: Teaching, level: string): string[] {
  return t.classTeacherOf.filter(c => same(c.classLevel, level)).map(c => c.classArm).sort()
}

export function isClassTeacherOf(t: Teaching, level: string, arm?: string | null): boolean {
  return t.classTeacherOf.some(c => same(c.classLevel, level) && (arm == null || same(c.classArm, arm)))
}

/** May this teacher use this subject name in this class level? (class teachers: any subject) */
export function teachesSubjectIn(t: Teaching, level: string, subject: string): boolean {
  if (!t.limited) return true
  if (isClassTeacherOf(t, level)) return true
  return t.subjects.some(s => same(s.classLevel, level) && same(s.subject, subject))
}
