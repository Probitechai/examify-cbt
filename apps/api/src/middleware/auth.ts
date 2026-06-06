import type { FastifyRequest, FastifyReply } from 'fastify'

export type UserRole = 'super_admin' | 'school_admin' | 'teacher' | 'student' | 'parent'

export async function authenticate(request: any, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    if (request.user.schoolId !== request.schoolId) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Token is not valid for this school.' })
    }
  } catch {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Valid authentication token required.' })
  }
}

export function requireRole(...roles: UserRole[]) {
  return async function (request: any, reply: FastifyReply) {
    if (!roles.includes(request.user?.role)) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: `This action requires one of these roles: ${roles.join(', ')}.`,
      })
    }
  }
}
