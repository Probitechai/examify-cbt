import postgres from 'postgres'

function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }
  _db = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
  return _db
}
// Create db instance - called lazily on first use
let _db: ReturnType<typeof postgres> | undefined

export function db() {
  if (!_db) _db = getDb()
  return _db
}

export function tenantDb(schoolId: string) {
  return {
    query: async function(strings: TemplateStringsArray, ...values: any[]) {
      const sql = db()
      return sql.begin(async (tx: any) => {
        await tx`SELECT set_config('app.tenant_id', ${schoolId}, true)`
        return tx(strings, ...values)
      })
    },
    transaction: async function<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      const sql = db()
      return sql.begin(async (tx: any) => {
        await tx`SELECT set_config('app.tenant_id', ${schoolId}, true)`
        return fn(tx)
      }) as Promise<T>
    },
  }
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const sql = db()
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}
