/**
 * Resend Webhook Handler
 * POST /api/webhooks/resend
 * 
 * Handles Resend webhook events with signature verification and email_log updates.
 * Processes email delivery events (delivered, bounced, complained, etc.).
 */

import { NextRequest } from 'next/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { getResendWebhookSecret, verifyResendWebhookSignature } from '@/lib/email/webhook'
import { logger } from '@/lib/log'
import { fail, ok } from '@/lib/http/json'

export const dynamic = 'force-dynamic'

// Webhook endpoint is exempt from CSRF (uses Resend signature verification instead)

/**
 * Map Resend event types to stable delivery_status values
 */
function mapEventTypeToDeliveryStatus(eventType: string): string {
  const statusMap: Record<string, string> = {
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
    'email.delivery_delayed': 'delivery_delayed',
    'email.sent': 'sent',
    'email.opened': 'opened',
    'email.clicked': 'clicked',
  }
  
  return statusMap[eventType] || 'unknown'
}

async function webhookHandler(request: NextRequest) {
  // Only accept POST
  if (request.method !== 'POST') {
    return fail(405, 'METHOD_NOT_ALLOWED', 'Only POST requests are allowed')
  }

  // Get raw body for signature verification
  const body = await request.text()
  
  // Get signature headers
  const svixId = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')

  if (!svixSignature) {
    logger.warn('Resend webhook missing signature', {
      component: 'webhooks/resend',
      operation: 'verify_signature',
    })
    return fail(401, 'MISSING_SIGNATURE', 'Missing webhook signature header')
  }

  // Get webhook secret
  const webhookSecret = getResendWebhookSecret()
  if (!webhookSecret) {
    logger.error('Resend webhook secret not configured', new Error('RESEND_WEBHOOK_SECRET not set'), {
      component: 'webhooks/resend',
      operation: 'verify_signature',
    })
    return fail(500, 'CONFIG_ERROR', 'Webhook secret not configured')
  }

  // Verify webhook signature
  const isValid = verifyResendWebhookSignature(
    body,
    {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    },
    webhookSecret
  )

  if (!isValid) {
    logger.error('Resend webhook signature verification failed', new Error('Invalid webhook signature'), {
      component: 'webhooks/resend',
      operation: 'verify_signature',
    })
    return fail(401, 'INVALID_SIGNATURE', 'Invalid webhook signature')
  }

  // Parse verified payload
  let event: {
    type: string
    data: {
      email_id: string
      created_at?: string
      [key: string]: any
    }
  }
  
  try {
    event = JSON.parse(body)
  } catch (error) {
    logger.error('Resend webhook payload parse failed', error instanceof Error ? error : new Error(String(error)), {
      component: 'webhooks/resend',
      operation: 'parse_payload',
    })
    return fail(400, 'INVALID_PAYLOAD', 'Invalid JSON payload')
  }

  // Extract event details
  const eventType = event.type
  const emailId = event.data?.email_id
  const eventTimestamp = event.data?.created_at || new Date().toISOString()

  if (!emailId) {
    logger.warn('Resend webhook missing email_id', {
      component: 'webhooks/resend',
      operation: 'process_event',
      eventType,
    })
    // Return 200 to acknowledge receipt (don't retry)
    return ok({ processed: false, reason: 'missing_email_id' })
  }

  // Map event type to delivery status
  const deliveryStatus = mapEventTypeToDeliveryStatus(eventType)

  // Update email_log where meta->>'resendEmailId' matches
  const admin = getAdminDb()
  
  try {
    // Find matching email_log record
    const { data: matchingRecords, error: selectError } = await fromBase(admin, 'email_log')
      .select('id, delivery_status, meta')
      .eq('meta->>resendEmailId', emailId)
      .limit(1)

    if (selectError) {
      logger.error('Resend webhook email_log query failed', selectError, {
        component: 'webhooks/resend',
        operation: 'query_email_log',
        eventType,
        emailId: emailId.substring(0, 8) + '...', // Log only prefix for security
      })
      // Return 200 to acknowledge receipt (don't retry on our errors)
      return ok({ processed: false, reason: 'query_error' })
    }

    if (!matchingRecords || matchingRecords.length === 0) {
      // No matching record - log warning but return 200 (idempotent)
      logger.warn('Resend webhook no matching email_log record', {
        component: 'webhooks/resend',
        operation: 'process_event',
        eventType,
        emailId: emailId.substring(0, 8) + '...', // Log only prefix
      })
      return ok({ processed: false, reason: 'no_match' })
    }

    const existingRecord = matchingRecords[0]
    const existingMeta = (existingRecord.meta as Record<string, any>) || {}
    
    // Prepare updated meta (preserve existing, add webhook event data)
    const updatedMeta = {
      ...existingMeta,
      lastWebhookEvent: {
        type: eventType,
        timestamp: eventTimestamp,
        receivedAt: new Date().toISOString(),
      },
    }

    // Update email_log (idempotent - only update if status changed or meta needs update)
    const { error: updateError } = await fromBase(admin, 'email_log')
      .update({
        delivery_status: deliveryStatus,
        meta: updatedMeta,
      })
      .eq('id', existingRecord.id)

    if (updateError) {
      logger.error('Resend webhook email_log update failed', updateError, {
        component: 'webhooks/resend',
        operation: 'update_email_log',
        eventType,
        emailId: emailId.substring(0, 8) + '...',
        recordId: existingRecord.id,
      })
      // Return 200 to acknowledge receipt (don't retry on our errors)
      return ok({ processed: false, reason: 'update_error' })
    }

    // Success
    logger.info('Resend webhook processed successfully', {
      component: 'webhooks/resend',
      operation: 'process_event',
      eventType,
      emailId: emailId.substring(0, 8) + '...',
      deliveryStatus,
      updated: true,
    })

    return ok({ processed: true, eventType, deliveryStatus })
  } catch (error) {
    logger.error('Resend webhook unexpected error', error instanceof Error ? error : new Error(String(error)), {
      component: 'webhooks/resend',
      operation: 'process_event',
      eventType,
      emailId: emailId ? emailId.substring(0, 8) + '...' : '[no-id]',
    })
    // Return 200 to acknowledge receipt (don't retry on unexpected errors)
    return ok({ processed: false, reason: 'unexpected_error' })
  }
}

export async function POST(request: NextRequest) {
  return webhookHandler(request)
}
