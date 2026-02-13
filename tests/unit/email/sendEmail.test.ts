import { describe, it, expect, beforeEach, vi } from 'vitest'

import { sendEmail, type SendEmailParams } from '@/lib/email/sendEmail'

// Mock Resend client
const sendMock = vi.fn()

vi.mock('@/lib/email/client', () => ({
  getResendClient: () => ({
    emails: {
      send: sendMock,
    },
  }),
}))

describe('sendEmail', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  const baseParams: SendEmailParams = {
    to: 'user@example.com',
    subject: 'Test Subject',
    type: 'sale_created_confirmation',
    react: {} as any,
    metadata: { test: true },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    sendMock.mockResolvedValue({ data: { id: 'test-email-id' } })
  })

  it('sends email normally when RESEND_FROM_EMAIL is present', async () => {
    vi.stubEnv('LOOTAURA_ENABLE_EMAILS', 'true')
    vi.stubEnv('RESEND_FROM_EMAIL', 'from@example.com')
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key')

    const result = await sendEmail(baseParams)

    expect(result).toEqual({ ok: true, resendEmailId: 'test-email-id' })
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Loot Aura" <from@example.com>',
        to: baseParams.to,
        subject: baseParams.subject,
      }),
    )
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('returns resendEmailId when Resend returns a message ID', async () => {
    vi.stubEnv('LOOTAURA_ENABLE_EMAILS', 'true')
    vi.stubEnv('RESEND_FROM_EMAIL', 'from@example.com')
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
    
    const customResendId = 'custom-resend-id-123'
    sendMock.mockResolvedValueOnce({ data: { id: customResendId } })

    const result = await sendEmail(baseParams)

    expect(result.ok).toBe(true)
    expect(result.resendEmailId).toBe(customResendId)
  })

  it('returns undefined resendEmailId when Resend does not return an ID', async () => {
    vi.stubEnv('LOOTAURA_ENABLE_EMAILS', 'true')
    vi.stubEnv('RESEND_FROM_EMAIL', 'from@example.com')
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key')
    
    sendMock.mockResolvedValueOnce({ data: null })

    const result = await sendEmail(baseParams)

    expect(result.ok).toBe(true)
    expect(result.resendEmailId).toBeUndefined()
  })

  it('fails fast when from address configuration is missing and does not call Resend', async () => {
    vi.stubEnv('LOOTAURA_ENABLE_EMAILS', 'true')
    vi.stubEnv('RESEND_FROM_EMAIL', undefined)
    vi.stubEnv('EMAIL_FROM', undefined)

    const result = await sendEmail(baseParams)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('RESEND_FROM_EMAIL (or EMAIL_FROM) is not set')
    expect(sendMock).not.toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[EMAIL] Configuration error:',
      expect.objectContaining({
        error: 'RESEND_FROM_EMAIL (or EMAIL_FROM) is not set',
        checkedVars: {
          hasResendFromEmail: false,
          hasEmailFrom: false,
        },
      }),
    )
  })
})


