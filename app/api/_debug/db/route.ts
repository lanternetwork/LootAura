import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = getRlsDb()
    const { data, error } = await fromBase(db, 'sales').select('id').limit(1)
    if (error) {
      if (process.env.NODE_ENV !== 'production') console.error('[DEBUG/DB] supabase error:', error)
      return fail(500, 'DB_ERROR', error.message, error)
    }
    return ok({ data })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[DEBUG/DB] thrown:', e)
    return fail(500, 'DB_ERROR', e.message, e)
  }
}


