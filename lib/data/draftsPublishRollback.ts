/**
 * Rollback/compensation helper for draft publish flow
 * 
 * This helper is used ONLY for rollback scenarios when draft publishing fails.
 * It should NOT be used as a general-purpose sale deletion utility.
 * 
 * Server-only - no client-side imports.
 */

import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import * as Sentry from '@sentry/nextjs'

/**
 * Delete sale and all its items for rollback purposes
 * 
 * This is a compensation operation used when draft publishing fails partway through.
 * It attempts to clean up any partially created resources.
 * 
 * @param adminClient - Admin Supabase client (schema-scoped PostgrestClient from getAdminDb)
 * @param saleId - The sale ID to delete along with its items
 * @returns true if cleanup succeeded, false otherwise (errors are logged, not thrown)
 */
export async function deleteSaleAndItemsForRollback(
  adminClient: ReturnType<typeof getAdminDb>,
  saleId: string
): Promise<boolean> {
  if (!saleId) {
    logger.warn('deleteSaleAndItemsForRollback called with empty saleId', {
      component: 'draftsPublishRollback',
      operation: 'rollback',
    })
    return false
  }

  try {
    // Delete items first (foreign key constraint - items reference sales)
    // Delete by sale_id to catch any items, even if we don't have their IDs
    const { error: itemsDeleteError } = await fromBase(adminClient, 'items')
      .delete()
      .eq('sale_id', saleId)

    if (itemsDeleteError) {
      const error = itemsDeleteError instanceof Error ? itemsDeleteError : new Error(String(itemsDeleteError))
      logger.error('Failed to delete items during rollback', error, {
        component: 'draftsPublishRollback',
        operation: 'rollback_delete_items',
        saleId,
      })
      Sentry.captureException(error, {
        tags: { operation: 'publishDraftRollback', step: 'deleteItems' },
        extra: { saleId },
      })
      // Continue to attempt sale deletion even if items deletion failed
    } else {
      logger.info('Deleted items during rollback', {
        component: 'draftsPublishRollback',
        operation: 'rollback_delete_items',
        saleId,
      })
    }

    // Delete the sale
    const { error: saleDeleteError } = await fromBase(adminClient, 'sales')
      .delete()
      .eq('id', saleId)

    if (saleDeleteError) {
      const error = saleDeleteError instanceof Error ? saleDeleteError : new Error(String(saleDeleteError))
      logger.error('Failed to delete sale during rollback', error, {
        component: 'draftsPublishRollback',
        operation: 'rollback_delete_sale',
        saleId,
      })
      Sentry.captureException(error, {
        tags: { operation: 'publishDraftRollback', step: 'deleteSale' },
        extra: { saleId },
      })
      return false
    }

    logger.info('Successfully rolled back sale and items', {
      component: 'draftsPublishRollback',
      operation: 'rollback_complete',
      saleId,
    })
    return true
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('Unexpected error during rollback', err, {
      component: 'draftsPublishRollback',
      operation: 'rollback_unexpected_error',
      saleId,
    })
    Sentry.captureException(err, {
      tags: { operation: 'publishDraftRollback', step: 'unexpected' },
      extra: { saleId },
    })
    return false
  }
}

