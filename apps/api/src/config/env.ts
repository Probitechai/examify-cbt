import * as dotenv from 'dotenv'
import * as path from 'path'

// Load .env from the api directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  APP_DOMAIN: process.env.APP_DOMAIN ?? 'examify.ng',
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  FROM_EMAIL: process.env.FROM_EMAIL,
}

if (!env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set. Database features will not work.')
}
