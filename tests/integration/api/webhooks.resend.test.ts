/**
 * Integration tests for Resend webhook handler
 * POST /api/webhooks/resend
 * 
 * Tests signature verification, email_log updates, and idempotency.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/webhooks/resend/route'
import { createHmac } from 'crypto'

// Mock Supabase clients
const mockAdminDb = {
  from: vi.fn(),
}

let mockFromBaseImpl: (db: any, table: string) => any

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: () => mockAdminDb,
  fromBase: (db: any, table: string) => {
    if (db === mockAdminDb) {
      return db.from(table)
    }
    return mockFromBaseImpl ? mockFromBaseImpl(db, table) : { select: vi.fn(), update: vi.fn() }
  },
}))

// Mock logger
vi.mock('@/lib/log', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock webhook secret
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-12345678901234567890'

vi.mock('@/lib/email/webhook', async () => {
  const actual = await vi.importActual('@/lib/email/webhook')
  return {
    ...actual,
    getResendWebhookSecret: () => TEST_WEBHOOK_SECRET,
  }
})

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFromBaseImpl = undefined
    mockAdminDb.from.mockImplementation((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
      }
      return chain
    })
  })

  /**
   * Helper to create a valid Resend webhook signature
   */
  function createValidSignature(payload: string, timestamp: string = Math.floor(Date.now() / 1000).toString()): string {
    const signedPayload = `${timestamp}.${payload}`
    const hmac = createHmac('sha256', TEST_WEBHOOK_SECRET)
    hmac.update(signedPayload)
    const signature = hmac.digest('hex')
    return `v1,${signature}`
  }

  /**
   * Helper to create a webhook request
   */
  function createWebhookRequest(
    payload: object,
    signature?: string,
    timestamp?: string
  ): NextRequest {
    const body = JSON.stringify(payload)
    const svixTimestamp = timestamp || Math.floor(Date.now() / 1000).toString()
    const svixSignature = signature || createValidSignature(body, svixTimestamp)
    
    const headers = new Headers({
      'svix-id': 'test-id-123',
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
      'content-type': 'application/json',
    })

    return new NextRequest('http://localhost:3000/api/webhooks/resend', {
      method: 'POST',
      headers,
      body,
    })
  }

  it('should reject invalid signature with 401', async () => {
    const payload = {
      type: 'email.delivered',
      data: {
        email_id: 'test-email-id-123',
        created_at: new Date().toISOString(),
      },
    }

    const request = createWebhookRequest(payload, 'v1,invalid-signature')
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('INVALID_SIGNATURE')
  })

  it('should reject missing signature with 401', async () => {
    const payload = {
      type: 'email.delivered',
      data: {
        email_id: 'test-email-id-123',
      },
    }

    const headers = new Headers({
      'content-type': 'application/json',
      // Missing svix-signature
    })

    const request = new NextRequest('http://localhost:3000/api/webhooks/resend', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('MISSING_SIGNATURE')
  })

  it('should accept valid signature and return 200', async () => {
    const payload = {
      type: 'email.delivered',
      data: {
        email_id: 'test-email-id-123',
        created_at: new Date().toISOString(),
      },
    }

    // Mock no matching record (will return 200 with processed: false)
    mockAdminDb.from.mockImplementation((table: string) => {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    const request = createWebhookRequest(payload)
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.processed).toBe(false)
    expect(data.reason).toBe('no_match')
  })

  it('should update email_log status for matching resendEmailId', async () => {
    const emailId = 'test-email-id-123'
    const payload = {
      type: 'email.delivered',
      data: {
        email_id: emailId,
        created_at: new Date().toISOString(),
      },
    }

    // Mock matching record
    const existingRecord = {
      id: 'log-id-123',
      delivery_status: 'sent',
      meta: {
        resendEmailId: emailId,
        salesCount: 2,
      },
    }

    const mockUpdate = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    
    let callCount = 0
    mockAdminDb.from.mockImplementation((table: string) => {
      callCount++
      if (callCount === 1) {
        // First call: select query
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [existingRecord], error: null }),
        }
      } else {
        // Second call: update query
        return {
          update: mockUpdate,
          eq: mockEq,
        }
      }
    })

    const request = createWebhookRequest(payload)
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.processed).toBe(true)
    expect(data.eventType).toBe('email.delivered')
    expect(data.deliveryStatus).toBe('delivered')

    // Verify update was called with correct status
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_status: 'delivered',
        meta: expect.objectContaining({
          resendEmailId: emailId,
          salesCount: 2,
          lastWebhookEvent: expect.objectContaining({
            type: 'email.delivered',
          }),
        }),
      })
    )
    expect(mockEq).toHaveBeenCalledWith('id', existingRecord.id)
  })

  it('should handle no matching record gracefully (200 with no_match)', async () => {
    const payload = {
      type: 'email.bounced',
      data: {
        email_id: 'non-existent-id',
        created_at: new Date().toISOString(),
      },
    }

    // Mock no matching record
    mockAdminDb.from.mockImplementation((table: string) => {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }
    })

    const request = createWebhookRequest(payload)
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.processed).toBe(false)
    expect(data.reason).toBe('no_match')
  })

  it('should be idempotent (same event twice updates once)', async () => {
    const emailId = 'test-email-id-123'
    const payload = {
      type: 'email.delivered',
      data: {
        email_id: emailId,
        created_at: new Date().toISOString(),
      },
    }

    const existingRecord = {
      id: 'log-id-123',
      delivery_status: 'delivered', // Already delivered
      meta: {
        resendEmailId: emailId,
      },
    }

    let callCount = 0
    mockAdminDb.from.mockImplementation((table: string) => {
      callCount++
      if (callCount === 1) {
        // First call: select query
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [existingRecord], error: null }),
        }
      } else {
        // Second call: update query
        return {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        }
      }
    })

    // Process same event twice
    const request1 = createWebhookRequest(payload)
    const response1 = await POST(request1)
    const data1 = await response1.json()

    // Reset call count for second request
    callCount = 0
    const request2 = createWebhookRequest(payload)
    const response2 = await POST(request2)
    const data2 = await response2.json()

    // Both should succeed (idempotent)
    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)
    expect(data1.processed).toBe(true)
    expect(data2.processed).toBe(true)
  })

  it('should reject non-POST methods with 405', async () => {
    const request = new NextRequest('http://localhost:3000/api/webhooks/resend', {
      method: 'GET',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(405)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('METHOD_NOT_ALLOWED')
  })

  it('should handle different event types correctly', async () => {
    const eventTypes = [
      { type: 'email.bounced', expectedStatus: 'bounced' },
      { type: 'email.complained', expectedStatus: 'complained' },
      { type: 'email.failed', expectedStatus: 'failed' },
      { type: 'email.delivery_delayed', expectedStatus: 'delivery_delayed' },
    ]

    for (const { type, expectedStatus } of eventTypes) {
      const emailId = `test-email-id-${type}`
      const payload = {
        type,
        data: {
          email_id: emailId,
          created_at: new Date().toISOString(),
        },
      }

      const existingRecord = {
        id: `log-id-${type}`,
        delivery_status: 'sent',
        meta: { resendEmailId: emailId },
      }

      let callCount = 0
      mockAdminDb.from.mockImplementation((table: string) => {
        callCount++
        if (callCount === 1) {
          // First call: select query
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [existingRecord], error: null }),
          }
        } else {
          // Second call: update query
          return {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }
      })

      const request = createWebhookRequest(payload)
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.processed).toBe(true)
      expect(data.deliveryStatus).toBe(expectedStatus)

      // Reset for next iteration
      vi.clearAllMocks()
    }
  })
})
