/**
 * Unit tests for favorite email sending functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendFavoriteSaleStartingSoonEmail } from '@/lib/email/favorites'
import { sendEmail } from '@/lib/email/sendEmail'
import { buildFavoriteSaleStartingSoonSubject } from '@/lib/email/templates/FavoriteSaleStartingSoonEmail'
import type { Sale } from '@/lib/types'

// Mock the sendEmail function
vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: vi.fn(),
}))

// Mock console methods
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

describe('sendFavoriteSaleStartingSoonEmail', () => {
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

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
    process.env.RESEND_FROM_EMAIL = 'no-reply@lootaura.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lootaura.com'
  })

  it('should send an email for a published sale', async () => {
    const result = await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale: mockSale,
      userName: 'Test User',
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.to).toBe('user@example.com')
    expect(sendEmailArgs.subject).toBe(buildFavoriteSaleStartingSoonSubject(mockSale.title))
    expect(sendEmailArgs.type).toBe('favorite_sale_starting_soon')
    expect(sendEmailArgs.react).toBeDefined()
    expect(sendEmailArgs.metadata).toEqual({
      saleId: mockSale.id,
      saleTitle: mockSale.title,
    })
  })

  it('should not send an email if sale is not published', async () => {
    const draftSale = { ...mockSale, status: 'draft' as const }
    const result = await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale: draftSale,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Sale is not published')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('should not send an email if recipient email is invalid', async () => {
    const result = await sendFavoriteSaleStartingSoonEmail({
      to: '',
      sale: mockSale,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Invalid recipient email')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('should handle errors from sendEmail gracefully', async () => {
    const errorMessage = 'Resend API error'
    vi.mocked(sendEmail).mockImplementationOnce(() => {
      throw new Error(errorMessage)
    })

    const result = await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale: mockSale,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(errorMessage)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[EMAIL_FAVORITES] Failed to send favorite sale starting soon email:',
      expect.objectContaining({
        saleId: mockSale.id,
        recipientEmail: 'user@example.com',
        error: errorMessage,
      })
    )
  })

  it('should format date range correctly for single day', async () => {
    const sale = {
      ...mockSale,
      date_start: '2025-12-06',
      time_start: '09:00',
      date_end: '2025-12-06',
      time_end: '17:00',
    }
    await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale,
    })
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    // December 6, 2025 is a Saturday
    // Expecting "Sat, Dec 6, 2025 · ..." from formatSaleDateRange
    expect(sendEmailArgs.react.props.dateRange).toMatch(/Sat, Dec 6, 2025/)
    // Time formatting depends on timezone, so just check it contains time format
    expect(sendEmailArgs.react.props.timeWindow).toMatch(/\d{1,2}:\d{2} (AM|PM) – \d{1,2}:\d{2} (AM|PM)/)
  })

  it('should build correct sale URL', async () => {
    const sale = { ...mockSale, id: 'test-sale-id' }
    await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale,
    })
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.saleUrl).toBe('https://lootaura.com/sales/test-sale-id')
  })

  it('should build correct address line', async () => {
    const sale = {
      ...mockSale,
      address: '456 Oak Ave',
      city: 'Smallville',
      state: 'CA',
      zip_code: '90210',
    }
    await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale,
    })
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.saleAddress).toBe('456 Oak Ave, Smallville, CA')
  })

  it('should use generic address line if parts are missing', async () => {
    const sale: Sale = {
      ...mockSale,
      address: undefined,
      city: '',
      state: '',
    }
    await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale,
    })
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.saleAddress).toBe('Address not provided')
  })

  it('should use userName when provided', async () => {
    await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale: mockSale,
      userName: 'John Doe',
    })
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.recipientName).toBe('John Doe')
  })

  it('should use null for recipientName when userName is not provided', async () => {
    await sendFavoriteSaleStartingSoonEmail({
      to: 'user@example.com',
      sale: mockSale,
    })
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.recipientName).toBeNull()
  })
})

