import { NextRequest } from 'next/server'
import { getRlsDb, getAdminDb, fromBase } from '@/lib/supabase/clients'
import { ok, fail } from '@/lib/http/json'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Hard-disable in production - no env var override
  if (process.env.NODE_ENV === 'production') {
    return fail(404, 'NOT_FOUND', 'Not found')
  }
  
  // Require admin access
  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    return fail(401, 'UNAUTHORIZED', 'Admin access required')
  }
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[DEBUG/DB] Admin client failed, trying RLS client:', adminErr.message)
      }
      try {
        db = getRlsDb()
        const rlsResult = await fromBase(db, 'sales').select('id').limit(1)
        data = rlsResult.data
        error = rlsResult.error
      } catch (rlsErr: any) {
        console.error('[DEBUG/DB] Both clients failed:', { admin: adminErr.message, rls: rlsErr.message })
        return fail(500, 'DB_ERROR', 'Database connection failed')
      }
    }
    
    if (error) {
      console.error('[DEBUG/DB] Query error:', error)
      return fail(500, 'DB_ERROR', 'Database query failed')
    }
    
    return ok({ data: data || [] })
  } catch (e: any) {
    console.error('[DEBUG/DB] Unexpected error:', e)
    return fail(500, 'DB_ERROR', 'Database connection failed')
  }
}

