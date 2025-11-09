import { getRlsDb, getAdminDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Try RLS client first (requires auth)
    let db = getRlsDb()
    let { data, error } = await fromBase(db, 'sales').select('id').limit(1)
    
    // If RLS fails due to auth, try admin client (no auth required)
    if (error && (error.message?.includes('JWT') || error.message?.includes('auth') || error.code === 'PGRST301')) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DEBUG/DB] RLS failed, trying admin client:', error.message)
      }
      try {
        db = getAdminDb()
        const adminResult = await fromBase(db, 'sales').select('id').limit(1)
        data = adminResult.data
        error = adminResult.error
      } catch (adminErr: any) {
        if (process.env.NODE_ENV !== 'production') console.error('[DEBUG/DB] admin client error:', adminErr)
        return fail(500, 'DB_ERROR', adminErr.message || 'Database connection failed', adminErr)
      }
    }
    
    if (error) {
      if (process.env.NODE_ENV !== 'production') console.error('[DEBUG/DB] supabase error:', error)
      return fail(500, 'DB_ERROR', error.message, error)
    }
    return ok({ data })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') console.error('[DEBUG/DB] thrown:', e)
    return fail(500, 'DB_ERROR', e.message || 'Database connection failed', e)
  }
}


