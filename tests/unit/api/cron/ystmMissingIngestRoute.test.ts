import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockRunYstmMissingUrlIngestionCron = vi.hoisted(() => vi.fn())
const mockLoggerError = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/cron', () => ({
  assertCronAuthorized: vi.fn(),
  isCronAuthorized: vi.fn(() => true),
}))

vi.mock('@/lib/ingestion/ystmCoverage/runYstmMissingUrlIngestionCron', () => ({
  runYstmMissingUrlIngestionCron: mockRunYstmMissingUrlIngestionCron,
}))

vi.mock('@/lib/supabase/clients', () => ({
  getAdminDb: vi.fn(() => ({})),
}))

vi.mock('@/lib/log', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
  },
}))

describe('GET /api/cron/ystm-missing-ingest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('logs sanitized error when cron throws', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {})

    mockRunYstmMissingUrlIngestionCron.mockRejectedValue(
      new Error('column missing_ingestion_failure_details missing https://yardsaletreasuremap.com/x')
    )

    const { GET } = await import('@/app/api/cron/ystm-missing-ingest/route')
    const req = new NextRequest('http://localhost/api/cron/ystm-missing-ingest', { method: 'GET' })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.code).toBe('MISSING_INGEST_FAILED')
    expect(body.message).not.toContain('yardsaletreasuremap.com')
    expect(mockLoggerError).toHaveBeenCalledTimes(1)
    expect(mockLoggerError.mock.calls[0]?.[0]).toBe('YSTM missing-ingest cron failed')
    expect(mockLoggerError.mock.calls[0]?.[2]).toMatchObject({
      component: 'api/cron/ystm-missing-ingest',
      errorMessage: expect.stringContaining('[redacted-url]'),
      phase: null,
      telemetry: null,
    })
  })

  it('wraps non-Error throws safely', async () => {
    const { assertCronAuthorized } = await import('@/lib/auth/cron')
    vi.mocked(assertCronAuthorized).mockImplementation(() => {})
    mockRunYstmMissingUrlIngestionCron.mockRejectedValue('string failure')

    const { GET } = await import('@/app/api/cron/ystm-missing-ingest/route')
    const req = new NextRequest('http://localhost/api/cron/ystm-missing-ingest', { method: 'GET' })
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.message).toBe('string failure')
    expect(mockLoggerError).toHaveBeenCalledTimes(1)
    expect(mockLoggerError.mock.calls[0]?.[1]).toBeInstanceOf(Error)
  })
})
