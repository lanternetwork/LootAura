import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { fail, ok } from '@/lib/http/json'
import { logger } from '@/lib/log'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
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
    return fail(400, 'INVALID_REQUEST', 'Sale ID is required')
  }

  // Get schema-scoped client for base table access
  const db = getRlsDb()

  // Toggle favorite: Try to insert first, if duplicate then delete
  // Write directly to base table since views don't support INSERT/DELETE without INSTEAD OF triggers
  const { data: _insertedFavorite, error: insertError } = await fromBase(db, 'favorites')
    .insert({ user_id: user.id, sale_id: saleId })
    .select()
    .single()

  if (insertError) {
    // Check if error is due to duplicate (unique constraint violation)
    const errorCode = (insertError as any)?.code
    const errorMessage = insertError instanceof Error ? insertError.message : (insertError as any)?.message || String(insertError)
    
    // If it's a duplicate key error, the favorite exists - delete it (toggle off)
    if (errorCode === '23505' || errorMessage?.includes('duplicate') || errorMessage?.includes('unique')) {
      // Delete the existing favorite
      const { error: deleteError } = await fromBase(db, 'favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('sale_id', saleId)

      if (deleteError) {
        const deleteErrorMessage = deleteError instanceof Error ? deleteError.message : (deleteError as any)?.message || String(deleteError)
        logger.error('Error deleting favorite after duplicate insert', deleteError instanceof Error ? deleteError : new Error(String(deleteError)), {
          component: 'sales/favorite',
          operation: 'delete_favorite',
          userId: user.id,
          saleId,
          errorCode: (deleteError as any)?.code,
          errorMessage: deleteErrorMessage,
        })
        return fail(400, 'FAVORITE_DELETE_FAILED', deleteErrorMessage || 'Failed to remove favorite')
      }

      logger.info('Favorite removed (toggled off)', {
        component: 'sales/favorite',
        operation: 'delete_favorite',
        userId: user.id,
        saleId,
      })

      return ok({ favorited: false })
    }
    
    // Otherwise, log and return error
    logger.error('Error inserting favorite', insertError instanceof Error ? insertError : new Error(String(insertError)), {
      component: 'sales/favorite',
      operation: 'add_favorite',
      userId: user.id,
      saleId,
      errorCode,
      errorMessage,
    })
    return fail(400, 'FAVORITE_ADD_FAILED', errorMessage || 'Failed to add favorite')
  }

  // Insert succeeded - favorite was added
  logger.info('Favorite added', {
    component: 'sales/favorite',
    operation: 'add_favorite',
    userId: user.id,
    saleId,
  })

  return ok({ favorited: true })
}


