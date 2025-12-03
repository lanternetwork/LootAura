/**
 * Unit tests for sale email sending functions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { sendSaleCreatedEmail } from '@/lib/email/sales'
import type { Sale } from '@/lib/types'

// Mock the sendEmail function
vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}))

// Mock console methods
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

describe('sendSaleCreatedEmail', () => {
  const mockSale: Sale = {
    id: 'sale-123',
    owner_id: 'user-456',
    title: 'Test Yard Sale',
    description: 'A test sale',
    address: '123 Main St',
    city: 'Anytown',
    state: 'ST',
    zip_code: '12345',
    date_start: '2025-12-07',
    time_start: '08:00',
    date_end: '2025-12-07',
    time_end: '14:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: '2025-12-01T00:00:00Z',
    updated_at: '2025-12-01T00:00:00Z',
  }

  const mockOwner = {
    email: 'owner@example.com',
    displayName: 'John Doe',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
    process.env.RESEND_FROM_EMAIL = 'no-reply@lootaura.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lootaura.com'
  })

  afterEach(() => {
    delete process.env.LOOTAURA_ENABLE_EMAILS
    delete process.env.RESEND_FROM_EMAIL
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('should send email for published sale', async () => {
    const { sendEmail } = await import('@/lib/email/sendEmail')

    const result = await sendSaleCreatedEmail({
      sale: mockSale,
      owner: mockOwner,
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        type: 'sale_created_confirmation',
        subject: expect.stringContaining('live on LootAura'),
      })
    )
  })

  it('should not send email for non-published sale', async () => {
    const draftSale = { ...mockSale, status: 'draft' as const }
    const { sendEmail } = await import('@/lib/email/sendEmail')

    const result = await sendSaleCreatedEmail({
      sale: draftSale,
      owner: mockOwner,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Sale is not published')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('should return error for invalid owner email', async () => {
    const { sendEmail } = await import('@/lib/email/sendEmail')

    const result = await sendSaleCreatedEmail({
      sale: mockSale,
      owner: { email: '', displayName: 'John' },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Invalid owner email')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('should handle email sending errors gracefully', async () => {
    const { sendEmail } = await import('@/lib/email/sendEmail')
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend API error'))

    const result = await sendSaleCreatedEmail({
      sale: mockSale,
      owner: mockOwner,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Resend API error')
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('should include correct metadata in email call', async () => {
    const { sendEmail } = await import('@/lib/email/sendEmail')

    await sendSaleCreatedEmail({
      sale: mockSale,
      owner: mockOwner,
      timezone: 'America/Los_Angeles',
    })

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          saleId: 'sale-123',
          ownerId: 'user-456',
          saleTitle: 'Test Yard Sale',
        }),
      })
    )
  })

  it('should work without display name', async () => {
    const { sendEmail } = await import('@/lib/email/sendEmail')

    const result = await sendSaleCreatedEmail({
      sale: mockSale,
      owner: { email: 'owner@example.com' },
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalled()
  })
})

