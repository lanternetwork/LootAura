/**
 * Unit tests for favorite email sending functions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendFavoriteSalesStartingSoonDigestEmail } from '@/lib/email/favorites'
import { sendEmail } from '@/lib/email/sendEmail'
import { buildFavoriteSaleStartingSoonSubject } from '@/lib/email/templates/FavoriteSaleStartingSoonEmail'
import { buildFavoriteSalesStartingSoonDigestSubject } from '@/lib/email/templates/FavoriteSalesStartingSoonDigestEmail'
import type { Sale } from '@/lib/types'

// Mock the sendEmail function and email log helpers
vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/email/emailLog', () => ({
  canSendEmail: vi.fn().mockResolvedValue(true),
  recordEmailSend: vi.fn().mockResolvedValue(undefined),
  generateFavoritesDigestDedupeKey: vi.fn((profileId: string) => `dedupe-${profileId}`),
}))

// Mock console methods
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

describe('sendFavoriteSalesStartingSoonDigestEmail', () => {
  const mockSale1: Sale = {
    id: 'sale-1',
    owner_id: 'user-1',
    title: 'First Yard Sale',
    description: 'First test sale',
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

  const mockSale2: Sale = {
    id: 'sale-2',
    owner_id: 'user-2',
    title: 'Second Yard Sale',
    description: 'Second test sale',
    address: '456 Oak Ave',
    city: 'City',
    state: 'ST',
    zip_code: '67890',
    date_start: '2025-12-07',
    time_start: '09:00',
    date_end: '2025-12-07',
    time_end: '15:00',
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

  it('should send a digest email for a single sale', async () => {
    const result = await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [mockSale1],
      hoursBeforeStart: 24,
      userName: 'Test User',
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.to).toBe('user@example.com')
    expect(sendEmailArgs.subject).toBe(buildFavoriteSalesStartingSoonDigestSubject([{ saleId: mockSale1.id, saleTitle: mockSale1.title, saleAddress: '', dateRange: '', saleUrl: '' }]))
    expect(sendEmailArgs.type).toBe('favorite_sale_starting_soon')
    expect(sendEmailArgs.react).toBeDefined()
    expect(sendEmailArgs.react.props.sales).toHaveLength(1)
    expect(sendEmailArgs.react.props.sales[0].saleTitle).toBe(mockSale1.title)
    expect(sendEmailArgs.react.props.hoursBeforeStart).toBe(24)
    expect(sendEmailArgs.metadata).toEqual({
      salesCount: 1,
      saleIds: [mockSale1.id],
    })
  })

  it('should send a digest email for multiple sales', async () => {
    const result = await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [mockSale1, mockSale2],
      hoursBeforeStart: 24,
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.to).toBe('user@example.com')
    expect(sendEmailArgs.subject).toBe('Several saved sales are starting soon near you')
    expect(sendEmailArgs.react.props.sales).toHaveLength(2)
    expect(sendEmailArgs.react.props.sales[0].saleTitle).toBe(mockSale1.title)
    expect(sendEmailArgs.react.props.sales[1].saleTitle).toBe(mockSale2.title)
    expect(sendEmailArgs.metadata).toEqual({
      salesCount: 2,
      saleIds: [mockSale1.id, mockSale2.id],
    })
  })

  it('should not send email if recipient email is invalid', async () => {
    const result = await sendFavoriteSalesStartingSoonDigestEmail({
      to: '',
      sales: [mockSale1],
      hoursBeforeStart: 24,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Invalid recipient email')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('should not send email if no sales provided', async () => {
    const result = await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [],
      hoursBeforeStart: 24,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('No sales provided')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('should filter out unpublished sales and continue with published ones', async () => {
    const draftSale: Sale = {
      ...mockSale2,
      id: 'sale-draft',
      status: 'draft',
    }

    const result = await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [mockSale1, draftSale],
      hoursBeforeStart: 24,
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    // Should only include published sale
    expect(sendEmailArgs.react.props.sales).toHaveLength(1)
    expect(sendEmailArgs.react.props.sales[0].saleTitle).toBe(mockSale1.title)
  })

  it('should return error if all sales are unpublished', async () => {
    const draftSale: Sale = {
      ...mockSale1,
      status: 'draft',
    }

    process.env.NEXT_PUBLIC_DEBUG = 'true'
    const result = await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [draftSale],
      hoursBeforeStart: 24,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('No published sales to send')
    expect(sendEmail).not.toHaveBeenCalled()
    delete process.env.NEXT_PUBLIC_DEBUG
  })

  it('should handle errors from sendEmail gracefully', async () => {
    const errorMessage = 'Resend API error'
    vi.mocked(sendEmail).mockImplementationOnce(() => {
      throw new Error(errorMessage)
    })

    const result = await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [mockSale1, mockSale2],
      hoursBeforeStart: 24,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe(errorMessage)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[EMAIL_FAVORITES] Failed to send favorite sales starting soon digest email:',
      expect.objectContaining({
        recipientEmail: 'user@example.com',
        salesCount: 2,
        error: errorMessage,
      })
    )
  })

  it('should pass correct props to the digest template', async () => {
    await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [mockSale1, mockSale2],
      hoursBeforeStart: 48,
      userName: 'Jane User',
    })

    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.recipientName).toBe('Jane User')
    expect(sendEmailArgs.react.props.hoursBeforeStart).toBe(48)
    expect(sendEmailArgs.react.props.sales).toHaveLength(2)
    expect(sendEmailArgs.react.props.sales[0].saleId).toBe(mockSale1.id)
    expect(sendEmailArgs.react.props.sales[1].saleId).toBe(mockSale2.id)
  })

  it('should build correct sale URLs for all sales', async () => {
    await sendFavoriteSalesStartingSoonDigestEmail({
      to: 'user@example.com',
      sales: [mockSale1, mockSale2],
      hoursBeforeStart: 24,
    })

    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.sales[0].saleUrl).toBe('https://lootaura.com/sales/sale-1')
    expect(sendEmailArgs.react.props.sales[1].saleUrl).toBe('https://lootaura.com/sales/sale-2')
  })
})

