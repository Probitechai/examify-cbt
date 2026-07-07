// Load env FIRST before any other imports
import * as dotenv from 'dotenv'
import * as path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { checkDbConnection } from './db/client'
import { resolveTenant } from './middleware/tenant'
import { authRoutes } from './routes/auth'
import { examRoutes } from './routes/exams'
import { questionRoutes } from './routes/questions'
import { userRoutes } from './routes/users'
import { sessionRoutes } from './routes/sessions'
import { resultRoutes } from './routes/results'

const PORT = parseInt(process.env.PORT ?? '3001', 10)
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const APP_DOMAIN = process.env.APP_DOMAIN ?? 'examify.ng'
const NODE_ENV = process.env.NODE_ENV ?? 'development'

const app = Fastify({
  logger: NODE_ENV !== 'production',
})

async function start() {
 await app.register(cors, {
  origin: (origin, cb) => {
    const allowed =
      !origin ||
      origin.includes('localhost') ||
      origin.includes('vercel.app') ||
      origin.includes('railway.app') ||
      (!!origin && origin.endsWith(`.${APP_DOMAIN}`))
    cb(null, allowed)
  },
  credentials: true,
})

  await app.register(jwt, { secret: JWT_SECRET })
  await app.register(cookie)

  app.addHook('onRequest', resolveTenant)

  await app.register(authRoutes, { prefix: '/api' })
  await app.register(examRoutes, { prefix: '/api' })
  await app.register(questionRoutes, { prefix: '/api' })
  await app.register(userRoutes, { prefix: '/api' })
  await app.register(sessionRoutes, { prefix: '/api' })
  await app.register(resultRoutes, { prefix: '/api' })

  app.get('/health', async () => {
    const dbOk = await checkDbConnection()
    return { status: dbOk ? 'ok' : 'degraded', db: dbOk }
  })

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    if (error.validation) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: error.message })
    }
    return reply.status(error.statusCode ?? 500).send({
      error: 'INTERNAL_ERROR',
      message: NODE_ENV === 'production' ? 'An unexpected error occurred.' : error.message,
    })
  })

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`\n Examify API running on port ${PORT}`)
    console.log(`   Mode: ${NODE_ENV}`)
    console.log(`   Health: http://localhost:${PORT}/health\n`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
