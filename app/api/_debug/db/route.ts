import { NextRequest } from 'next/server'
import { getRlsDb, getAdminDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    // Try admin client first (no auth required, more reliable for diagnostics)
    let db
    let data
    let error
    
    try {
      db = getAdminDb()
      const result = await fromBase(db, 'sales').select('id').limit(1)
      data = result.data
      error = result.error
    } catch (adminErr: any) {
      // If admin client fails, try RLS client as fallback
      if (process.env.NODE_ENV !== 'production') {
        console.log('[DEBUG/DB] Admin client failed, trying RLS client:', adminErr.message)
      }
      try {
        db = getRlsDb()
        const rlsResult = await fromBase(db, 'sales').select('id').limit(1)
        data = rlsResult.data
        error = rlsResult.error
      } catch (rlsErr: any) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[DEBUG/DB] Both clients failed:', { admin: adminErr.message, rls: rlsErr.message })
        }
        return fail(500, 'DB_ERROR', 'Database connection failed', {
          adminError: adminErr.message,
          rlsError: rlsErr.message
        })
      }
    }
    
    if (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[DEBUG/DB] Query error:', error)
      }
      return fail(500, 'DB_ERROR', error.message || 'Database query failed', error)
    }
    
    return ok({ data: data || [] })
  } catch (e: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[DEBUG/DB] Unexpected error:', e)
    }
    return fail(500, 'DB_ERROR', e.message || 'Database connection failed', {
      error: e.message,
      stack: process.env.NODE_ENV !== 'production' ? e.stack : undefined
    })
  }
}


