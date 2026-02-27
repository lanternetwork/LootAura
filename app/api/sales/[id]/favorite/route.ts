import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { fail, ok } from '@/lib/http/json'
import { logger } from '@/lib/log'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

async function favoriteHandler(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  // CSRF protection check
  const csrfError = await checkCsrfIfRequired(req)
  if (csrfError) {
    return csrfError
  }

  const supabase = createSupabaseServerClient()

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    logger.warn('Unauthorized favorite attempt', {
      component: 'sales/favorite',
      operation: 'auth_check',
    })
    return fail(401, 'AUTH_REQUIRED', 'Authentication required')
  }
  try {
    const { assertAccountNotLocked } = await import('@/lib/auth/accountLock')
    await assertAccountNotLocked(user.id)
  } catch (error) {
    if (error instanceof NextResponse) return error
    throw error
  }

  // Handle params as Promise (Next.js 15+) or object (Next.js 13/14)
  const resolvedParams = await Promise.resolve(params)
  const saleId = resolvedParams.id

  if (!saleId) {
    return NextResponse.json({ error: 'Sale ID is required' }, { status: 400 })
  }

  // Toggle favorite in base table through public view
  // First check if exists
  const { data: existing, error: checkError } = await supabase
    .from('favorites_v2')
    .select('sale_id')
    .eq('user_id', user.id)
    .eq('sale_id', saleId)
    .maybeSingle()

  if (checkError) {
    logger.error('Error checking existing favorite', checkError instanceof Error ? checkError : new Error(String(checkError)), {
      component: 'sales/favorite',
      operation: 'check_favorite',
      userId: user.id,
      saleId,
    })
    return fail(400, 'FAVORITE_CHECK_FAILED', 'Failed to check favorite status')
  }

  if (existing) {
    // Delete the specific favorite - ensure we only delete this one
    const { error: deleteError } = await supabase
      .from('favorites_v2')
      .delete()
      .eq('user_id', user.id)
      .eq('sale_id', saleId)

    if (deleteError) {
      logger.error('Error deleting favorite', deleteError instanceof Error ? deleteError : new Error(String(deleteError)), {
        component: 'sales/favorite',
        operation: 'delete_favorite',
        userId: user.id,
        saleId,
      })
      return fail(400, 'FAVORITE_DELETE_FAILED', 'Failed to remove favorite')
    }

    logger.info('Favorite removed', {
      component: 'sales/favorite',
      operation: 'delete_favorite',
      userId: user.id,
      saleId,
    })

    return ok({ favorited: false })
  }

  // Insert with upsert to avoid duplicate conflicts if called twice rapidly
  const { error: upsertError } = await supabase
    .from('favorites_v2')
    .upsert({ user_id: user.id, sale_id: saleId }, { onConflict: 'user_id,sale_id', ignoreDuplicates: true })

  if (upsertError) {
    logger.error('Error upserting favorite', upsertError instanceof Error ? upsertError : new Error(String(upsertError)), {
      component: 'sales/favorite',
      operation: 'add_favorite',
      userId: user.id,
      saleId,
    })
    return fail(400, 'FAVORITE_ADD_FAILED', 'Failed to add favorite')
  }

  logger.info('Favorite added', {
    component: 'sales/favorite',
    operation: 'add_favorite',
    userId: user.id,
    saleId,
  })

  return ok({ favorited: true })
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  // Create a wrapper that captures params for the rate-limited handler
  const wrappedHandler = async (request: NextRequest) => {
    return favoriteHandler(request, context)
  }
  const rateLimitedHandler = withRateLimit(wrappedHandler, [Policies.FAVORITES_MINUTE])
  return rateLimitedHandler(req)
}

