import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildPreviewCronRequestHeaders,
  formatInvokeAttemptLogLine,
  formatInvokeGeocodeCronFailure,
  invokeGeocodeCronAtDeploymentUrl,
  invokeGeocodeCronAtDeploymentUrlWithRetry,
  normalizeDeploymentBaseUrl,
} from '../../scripts/invoke-preview-deployment-geocode-cron'

const GEOCODE_URL = 'https://host.vercel.app/api/cron/geocode'

function unauthorizedResponse() {
  return new Response(JSON.stringify({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
    status: 401,
  })
}

function okResponse() {
  return new Response(null, { status: 200 })
}

describe('normalizeDeploymentBaseUrl', () => {
  it('prefixes https for bare host (Vercel client_payload.url shape)', () => {
    expect(normalizeDeploymentBaseUrl('my-app-git-branch-team.vercel.app')).toBe(
      'https://my-app-git-branch-team.vercel.app'
    )
  })

  it('leaves explicit https URLs unchanged aside from trim and trailing slashes', () => {
    expect(normalizeDeploymentBaseUrl('https://host.vercel.app///')).toBe('https://host.vercel.app')
  })
})

describe('buildPreviewCronRequestHeaders', () => {
  it('includes bearer auth and optional Vercel protection bypass', () => {
    expect(buildPreviewCronRequestHeaders(' tok ', ' bypass ')).toEqual({
      Authorization: 'Bearer tok',
      'x-vercel-protection-bypass': 'bypass',
    })
  })
})

describe('formatInvokeGeocodeCronFailure', () => {
  it('explains 401 as CRON_SECRET mismatch between GitHub and Vercel Preview', () => {
    const message = formatInvokeGeocodeCronFailure({
      ok: false,
      reason: 'http_error',
      url: GEOCODE_URL,
      httpStatus: 401,
      errorCode: 'UNAUTHORIZED',
    })
    expect(message).toContain('401')
    expect(message).toContain('CRON_SECRET')
    expect(message).toContain('Preview')
  })
})

describe('formatInvokeAttemptLogLine', () => {
  it('uses neutral auth rejected wording for interim 401 attempts', () => {
    const line = formatInvokeAttemptLogLine({
      attempt: 1,
      retrying: true,
      result: {
        ok: false,
        reason: 'http_error',
        url: GEOCODE_URL,
        httpStatus: 401,
        errorCode: 'UNAUTHORIZED',
      },
    })
    expect(line).toContain('attempt=1')
    expect(line).toContain('message="auth rejected"')
    expect(line).toContain('retrying=yes')
    expect(line).not.toContain('CRON_SECRET')
  })
})

describe('invokeGeocodeCronAtDeploymentUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns missing_secret when CRON_SECRET is missing or blank', async () => {
    const fetchImpl = vi.fn()
    expect(await invokeGeocodeCronAtDeploymentUrl('https://p.vercel.app', '', fetchImpl as unknown as typeof fetch)).toEqual({
      ok: false,
      reason: 'missing_secret',
    })
    expect(await invokeGeocodeCronAtDeploymentUrl('https://p.vercel.app', '   ', fetchImpl as unknown as typeof fetch)).toEqual({
      ok: false,
      reason: 'missing_secret',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns missing_url or invalid_url when deployment URL is missing or not https', async () => {
    const fetchImpl = vi.fn()
    expect(await invokeGeocodeCronAtDeploymentUrl('', 'secret', fetchImpl as unknown as typeof fetch)).toEqual({
      ok: false,
      reason: 'missing_url',
    })
    expect(await invokeGeocodeCronAtDeploymentUrl('   ', 'secret', fetchImpl as unknown as typeof fetch)).toEqual({
      ok: false,
      reason: 'missing_url',
    })
    expect(await invokeGeocodeCronAtDeploymentUrl('http://insecure.example', 's', fetchImpl as unknown as typeof fetch)).toEqual({
      ok: false,
      reason: 'invalid_url',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts bare host after normalization (https implied)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const result = await invokeGeocodeCronAtDeploymentUrl(
      'preview-host.vercel.app',
      'tok',
      fetchImpl as unknown as typeof fetch
    )
    expect(result).toEqual({ ok: true, url: 'https://preview-host.vercel.app/api/cron/geocode' })
    expect(fetchImpl).toHaveBeenCalledWith('https://preview-host.vercel.app/api/cron/geocode', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('strips trailing slashes before building cron path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const result = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app///',
      'tok',
      fetchImpl as unknown as typeof fetch
    )
    expect(result).toEqual({ ok: true, url: GEOCODE_URL })
    expect(fetchImpl).toHaveBeenCalledWith(GEOCODE_URL, {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('returns ok on HTTP 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const result = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app',
      's',
      fetchImpl as unknown as typeof fetch
    )
    expect(result.ok).toBe(true)
  })

  it('returns http_error with status and parsed code when response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), { status: 401 })
    )
    const result = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app',
      's',
      fetchImpl as unknown as typeof fetch
    )
    expect(result).toEqual({
      ok: false,
      reason: 'http_error',
      url: GEOCODE_URL,
      httpStatus: 401,
      errorCode: 'UNAUTHORIZED',
      responseSnippet: '{"ok":false,"code":"UNAUTHORIZED"}',
    })
  })

  it('returns network_error when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'))
    const result = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app',
      's',
      fetchImpl as unknown as typeof fetch
    )
    expect(result).toEqual({
      ok: false,
      reason: 'network_error',
      url: GEOCODE_URL,
    })
  })

  it('forwards Vercel protection bypass header when provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app',
      's',
      fetchImpl as unknown as typeof fetch,
      'bypass-token'
    )
    expect(fetchImpl).toHaveBeenCalledWith(GEOCODE_URL, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer s',
        'x-vercel-protection-bypass': 'bypass-token',
      },
    })
  })
})

describe('invokeGeocodeCronAtDeploymentUrlWithRetry', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('succeeds immediately on first 2xx without retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const resultPromise = invokeGeocodeCronAtDeploymentUrlWithRetry('https://host.vercel.app', 'secret', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    const result = await resultPromise
    expect(result).toEqual({ ok: true, url: GEOCODE_URL })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleepMs).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('retries after 401 and succeeds on second attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(unauthorizedResponse()))
      .mockImplementationOnce(() => Promise.resolve(okResponse()))
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const resultPromise = invokeGeocodeCronAtDeploymentUrlWithRetry('https://host.vercel.app', 'secret', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleepMs).toHaveBeenCalledTimes(1)
    expect(sleepMs).toHaveBeenCalledWith(10_000)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('retrying=yes')
  })

  it('retries twice after 401 and succeeds on third attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(unauthorizedResponse()))
      .mockImplementationOnce(() => Promise.resolve(unauthorizedResponse()))
      .mockImplementationOnce(() => Promise.resolve(okResponse()))
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const resultPromise = invokeGeocodeCronAtDeploymentUrlWithRetry('https://host.vercel.app', 'secret', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleepMs).toHaveBeenCalledTimes(2)
    expect(sleepMs).toHaveBeenNthCalledWith(1, 10_000)
    expect(sleepMs).toHaveBeenNthCalledWith(2, 30_000)
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('fails after three 401 responses', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(unauthorizedResponse()))
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const resultPromise = invokeGeocodeCronAtDeploymentUrlWithRetry('https://host.vercel.app', 'secret', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.httpStatus).toBe(401)
      expect(result.errorCode).toBe('UNAUTHORIZED')
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(sleepMs).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledTimes(3)
    expect(log.mock.calls[2][0]).toContain('retrying=no')
  })

  it('retries after network error and succeeds on second attempt', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(okResponse())
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const resultPromise = invokeGeocodeCronAtDeploymentUrlWithRetry('https://host.vercel.app', 'secret', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(result.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('status=network')
  })

  it('fails immediately when CRON_SECRET is missing', async () => {
    const fetchImpl = vi.fn()
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const result = await invokeGeocodeCronAtDeploymentUrlWithRetry('https://host.vercel.app', '', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    expect(result).toEqual({ ok: false, reason: 'missing_secret' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(sleepMs).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('fails immediately when PREVIEW_DEPLOYMENT_URL is missing', async () => {
    const fetchImpl = vi.fn()
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const result = await invokeGeocodeCronAtDeploymentUrlWithRetry('', 'secret', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    expect(result).toEqual({ ok: false, reason: 'missing_url' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(sleepMs).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })

  it('fails immediately when deployment URL is invalid', async () => {
    const fetchImpl = vi.fn()
    const sleepMs = vi.fn().mockResolvedValue(undefined)
    const log = vi.fn()

    const result = await invokeGeocodeCronAtDeploymentUrlWithRetry('http://insecure.example', 'secret', {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepMs,
      log,
    })

    expect(result).toEqual({ ok: false, reason: 'invalid_url' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(sleepMs).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  })
})
