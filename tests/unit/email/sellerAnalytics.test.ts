import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sendSellerWeeklyAnalyticsEmail } from '@/lib/email/sellerAnalytics'
import { sendEmail } from '@/lib/email/sendEmail'
import { buildSellerWeeklyAnalyticsSubject } from '@/lib/email/templates/SellerWeeklyAnalyticsEmail'

// Mock the sendEmail function and email log helpers
vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: vi.fn(),
}))

vi.mock('@/lib/email/emailLog', () => ({
  canSendEmail: vi.fn().mockResolvedValue(true),
  recordEmailSend: vi.fn().mockResolvedValue(undefined),
  generateSellerWeeklyDedupeKey: vi.fn((_profileId: string, _weekStart: Date) => 'dedupe-week'),
}))

vi.mock('@/lib/email/unsubscribeTokens', () => ({
  createUnsubscribeToken: vi.fn().mockResolvedValue('valid-token-123'),
  buildUnsubscribeUrl: vi.fn((token: string, baseUrl: string) => `${baseUrl}/email/unsubscribe?token=${token}`),
}))

// Mock console methods
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

describe('sendSellerWeeklyAnalyticsEmail', () => {
  const mockMetrics = {
    totalViews: 150,
    totalSaves: 25,
    totalClicks: 10,
    topSales: [
      {
        saleId: 'sale-1',
        saleTitle: 'Vintage Furniture Sale',
        views: 100,
        saves: 15,
        clicks: 8,
        ctr: 8.0,
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock: email send succeeds
    vi.mocked(sendEmail).mockResolvedValue({ ok: true })
    process.env.LOOTAURA_ENABLE_EMAILS = 'true'
    process.env.RESEND_FROM_EMAIL = 'no-reply@lootaura.com'
    process.env.NEXT_PUBLIC_SITE_URL = 'https://lootaura.com'
  })

  it('should send an email with valid metrics', async () => {
    const result = await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
    })

    expect(result.ok).toBe(true)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'seller@example.com',
        subject: expect.stringContaining('Your LootAura weekly summary'),
        type: 'seller_weekly_analytics',
        react: expect.any(Object),
        metadata: {
          ownerEmail: 'seller@example.com',
          totalViews: 150,
          totalSaves: 25,
          totalClicks: 10,
          topSalesCount: 1,
        },
      })
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should call sendEmail even if LOOTAURA_ENABLE_EMAILS is not "true" (sendEmail handles the check)', async () => {
    process.env.LOOTAURA_ENABLE_EMAILS = 'false'
    const result = await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
    })

    expect(result.ok).toBe(true) // Still returns ok: true as it's a non-critical side effect
    // sendEmail is called but will skip sending internally (when not mocked)
    // Since sendEmail is mocked, we just verify it was called
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should not send email if all metrics are zero', async () => {
    const zeroMetrics = {
      totalViews: 0,
      totalSaves: 0,
      totalClicks: 0,
      topSales: [],
    }
    const result = await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: zeroMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('No metrics to report')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[EMAIL_SELLER_ANALYTICS] Skipping email - no metrics:',
      expect.any(Object)
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('should not send email if recipient email is invalid', async () => {
    const result = await sendSellerWeeklyAnalyticsEmail({
      to: '',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Invalid recipient email')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[EMAIL_SELLER_ANALYTICS] Cannot send email - invalid recipient email:',
      expect.any(Object)
    )
  })

  it('should handle errors from sendEmail gracefully', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend API error'))

    const result = await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Resend API error')
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[EMAIL_SELLER_ANALYTICS] Failed to send seller weekly analytics email:',
      expect.any(Object)
    )
  })

  it('should pass correct props to the email template', async () => {
    await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      ownerDisplayName: 'Jane Seller',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
      dashboardUrl: 'https://lootaura.com/custom-dashboard',
    })

    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.ownerDisplayName).toBe('Jane Seller')
    expect(sendEmailArgs.react.props.totalViews).toBe(150)
    expect(sendEmailArgs.react.props.totalSaves).toBe(25)
    expect(sendEmailArgs.react.props.totalClicks).toBe(10)
    expect(sendEmailArgs.react.props.topSales).toHaveLength(1)
    expect(sendEmailArgs.react.props.dashboardUrl).toBe('https://lootaura.com/custom-dashboard')
  })

  it('should build correct dashboard URL from env var', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://custom-domain.com'
    await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
    })

    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.dashboardUrl).toBe('https://custom-domain.com/dashboard')
  })

  it('should format date range correctly', async () => {
    await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: mockMetrics,
      weekStart: '2025-01-06T00:00:00Z', // Monday, Jan 6
      weekEnd: '2025-01-13T00:00:00Z', // Monday, Jan 13
    })

    const sendEmailArgs = vi.mocked(sendEmail).mock.calls[0][0]
    expect(sendEmailArgs.react.props.weekStart).toMatch(/Mon, Jan 6/)
    expect(sendEmailArgs.react.props.weekEnd).toMatch(/Mon, Jan 13/)
  })

  it('should fail closed when unsubscribe token generation fails', async () => {
    const { createUnsubscribeToken } = await import('@/lib/email/unsubscribeTokens')
    const { recordEmailSend } = await import('@/lib/email/emailLog')
    
    vi.mocked(createUnsubscribeToken).mockRejectedValueOnce(new Error('Token generation failed'))

    const result = await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
      profileId: 'test-profile-id',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('Failed to generate unsubscribe token')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(recordEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'test-profile-id',
        emailType: 'seller_weekly',
        deliveryStatus: 'failed',
        errorMessage: expect.stringContaining('Unsubscribe token generation failed'),
        meta: expect.objectContaining({
          failureReason: 'token_generation_failed',
        }),
      })
    )
  })

  it('should not use test token URL when token generation fails', async () => {
    const { createUnsubscribeToken, buildUnsubscribeUrl } = await import('@/lib/email/unsubscribeTokens')
    
    vi.mocked(createUnsubscribeToken).mockRejectedValueOnce(new Error('Token generation failed'))

    const result = await sendSellerWeeklyAnalyticsEmail({
      to: 'seller@example.com',
      metrics: mockMetrics,
      weekStart: '2025-01-01T00:00:00Z',
      weekEnd: '2025-01-08T00:00:00Z',
      profileId: 'test-profile-id',
    })

    expect(result.ok).toBe(false)
    // Verify buildUnsubscribeUrl was never called with a test token
    const buildUnsubscribeUrlCalls = vi.mocked(buildUnsubscribeUrl).mock.calls
    const hasTestToken = buildUnsubscribeUrlCalls.some(call => 
      call[0]?.toString().includes('test-token')
    )
    expect(hasTestToken).toBe(false)
  })
})

