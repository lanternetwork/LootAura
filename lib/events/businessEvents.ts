/**
 * Business event logging
 * 
 * Structured event logging for key business actions.
 * These events can be used for analytics, monitoring, and future BI tooling.
 * 
 * Event names follow the pattern: {entity}_{action}
 * Examples:
 * - sale_created
 * - sale_published
 * - draft_published
 * - user_registered
 * - seller_rating_updated
 */

import { logger } from '@/lib/log'

export interface BusinessEventContext {
  userId?: string
  saleId?: string
  draftId?: string
  itemCount?: number
  [key: string]: any
}

/**
 * Log a business event
 * @param eventName - The event name (e.g., 'sale_created', 'draft_published')
 * @param context - Event context (user id, sale id, etc.) - no PII
 */
export function logBusinessEvent(eventName: string, context?: BusinessEventContext): void {
  logger.info(`Business event: ${eventName}`, {
    component: 'business_events',
    event: eventName,
    ...context
  })
}

// Convenience functions for common events

export function logSaleCreated(saleId: string, userId: string, itemCount?: number): void {
  logBusinessEvent('sale_created', { saleId, userId, itemCount })
}

export function logSalePublished(saleId: string, userId: string, itemCount?: number): void {
  logBusinessEvent('sale_published', { saleId, userId, itemCount })
}

export function logDraftPublished(draftId: string, saleId: string, userId: string, itemCount?: number): void {
  logBusinessEvent('draft_published', { draftId, saleId, userId, itemCount })
}

export function logUserRegistered(userId: string): void {
  logBusinessEvent('user_registered', { userId })
}

export function logSellerRatingUpdated(sellerId: string, raterId: string, rating: number): void {
  logBusinessEvent('seller_rating_updated', { sellerId, raterId, rating })
}

