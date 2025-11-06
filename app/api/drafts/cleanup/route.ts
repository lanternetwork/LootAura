import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import * as Sentry from '@sentry/nextjs'

export const dynamic = 'force-dynamic'

// This endpoint should be called by a scheduled job (Supabase cron, Vercel cron, etc.)
// It's protected by a secret token to prevent unauthorized access
export async function POST(request: NextRequest) {
  try {
    // Check for secret token (set in environment variables)
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.DRAFT_CLEANUP_SECRET
    
    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({
        ok: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED'
      }, { status: 401 })
    }

    const supabase = createSupabaseServerClient()
    
    // Call the cleanup function
    const { data, error } = await supabase.rpc('cleanup_sale_drafts')

    if (error) {
      console.error('[DRAFTS_CLEANUP] Error:', error)
      Sentry.captureException(error, { tags: { operation: 'cleanupDrafts' } })
      return NextResponse.json({
        ok: false,
        error: 'Cleanup failed',
        code: 'CLEANUP_ERROR'
      }, { status: 500 })
    }

    const deletedCount = data || 0

    return NextResponse.json({
      ok: true,
      data: { deletedCount }
    })
  } catch (error) {
    console.error('[DRAFTS_CLEANUP] Unexpected error:', error)
    Sentry.captureException(error, { tags: { operation: 'cleanupDrafts' } })
    return NextResponse.json({
      ok: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

