import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildPreviewCronRequestHeaders,
  formatInvokeGeocodeCronFailure,
  invokeGeocodeCronAtDeploymentUrl,
  normalizeDeploymentBaseUrl,
} from '../../scripts/invoke-preview-deployment-geocode-cron'

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
      url: 'https://host.vercel.app/api/cron/geocode',
      httpStatus: 401,
      errorCode: 'UNAUTHORIZED',
    })
    expect(message).toContain('401')
    expect(message).toContain('CRON_SECRET')
    expect(message).toContain('Preview')
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
    expect(result).toEqual({ ok: true, url: 'https://host.vercel.app/api/cron/geocode' })
    expect(fetchImpl).toHaveBeenCalledWith('https://host.vercel.app/api/cron/geocode', {
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
      url: 'https://host.vercel.app/api/cron/geocode',
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
      url: 'https://host.vercel.app/api/cron/geocode',
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
    expect(fetchImpl).toHaveBeenCalledWith('https://host.vercel.app/api/cron/geocode', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer s',
        'x-vercel-protection-bypass': 'bypass-token',
      },
    })
  })
})
