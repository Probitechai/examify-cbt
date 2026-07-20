import type { FastifyReply } from 'fastify'
import { db } from '../db/client'

export async function resolveTenant(request: any, reply: FastifyReply) {
  if (request.url === '/health') return
  if (request.url.startsWith('/api/cron/')) return
  if (request.url.startsWith('/api/superadmin/')) return
  if (request.url.startsWith('/api/webhooks/')) return
  if (request.url.startsWith('/api/admissions/public/')) return
  if (request.url.startsWith('/api/admissions/apply/')) return
  

  const host = request.hostname
  let subdomain: string | null = null

  // Read header first — works in both dev and production
  const headerSubdomain = request.headers['x-school-subdomain'] as string
  const hostSubdomain = extractSubdomain(host)

  subdomain = headerSubdomain ?? hostSubdomain

  // Debug log
  console.log(`[TENANT] host=${host} header=${headerSubdomain} extracted=${hostSubdomain} resolved=${subdomain}`)

  if (!subdomain && process.env.NODE_ENV === 'development') {
    subdomain = 'greensprings'
  }

  if (!subdomain) {
    return reply.status(400).send({
      error: 'BAD_REQUEST',
      message: 'Could not determine school. Access via your school subdomain.',
    })
  }

  try {
    const rows = await db()`
      SELECT id, name, subdomain, is_active, subscription_tier, max_students
      FROM schools
      WHERE subdomain = ${subdomain}
      LIMIT 1
    ` as any[]

    const school = rows[0]

    if (!school) {
      return reply.status(404).send({
        error: 'SCHOOL_NOT_FOUND',
        message: `No school found for subdomain "${subdomain}".`,
      })
    }

    if (!school.is_active) {
      return reply.status(402).send({
        error: 'SUBSCRIPTION_INACTIVE',
        message: 'This school account is currently inactive.',
      })
    }

    console.log(`[TENANT] Resolved to school: ${school.name} (${school.subdomain})`)

    request.schoolId = school.id
    request.schoolSubdomain = school.subdomain
    request.school = {
      id: school.id,
      name: school.name,
      subdomain: school.subdomain,
      isActive: school.is_active,
      subscriptionTier: school.subscription_tier,
      maxStudents: school.max_students,
    }

  } catch (err: any) {
    console.error('Tenant resolution error:', err.message)
    return reply.status(500).send({
      error: 'SERVER_ERROR',
      message: 'Could not resolve school. Please try again.',
    })
  }
}

function extractSubdomain(host: string): string | null {
  const hostname = host.split(':')[0]
  const parts = hostname.split('.')
  if (parts.length >= 3) return parts[0]
  return null
}
