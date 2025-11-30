/**
 * Email types and interfaces for transactional emails
 */

export type EmailType =
  | 'sale_created_confirmation'
  | 'favorite_sale_starting_soon'
  | 'weekly_sales_digest'
  | 'seller_weekly_analytics'
  | 'admin_alert'

export interface EmailSendOptions {
  to: string
  subject: string
  type: EmailType
  metadata?: Record<string, unknown>
}

