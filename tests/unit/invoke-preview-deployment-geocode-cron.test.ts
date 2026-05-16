import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
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

describe('invokeGeocodeCronAtDeploymentUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 1 when CRON_SECRET is missing or blank', async () => {
    const fetchImpl = vi.fn()
    expect(await invokeGeocodeCronAtDeploymentUrl('https://p.vercel.app', '', fetchImpl as unknown as typeof fetch)).toBe(
      1
    )
    expect(await invokeGeocodeCronAtDeploymentUrl('https://p.vercel.app', '   ', fetchImpl as unknown as typeof fetch)).toBe(
      1
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 1 when deployment URL is missing or not https', async () => {
    const fetchImpl = vi.fn()
    expect(await invokeGeocodeCronAtDeploymentUrl('', 'secret', fetchImpl as unknown as typeof fetch)).toBe(1)
    expect(await invokeGeocodeCronAtDeploymentUrl('   ', 'secret', fetchImpl as unknown as typeof fetch)).toBe(1)
    expect(await invokeGeocodeCronAtDeploymentUrl('http://insecure.example', 's', fetchImpl as unknown as typeof fetch)).toBe(
      1
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('accepts bare host after normalization (https implied)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const code = await invokeGeocodeCronAtDeploymentUrl(
      'preview-host.vercel.app',
      'tok',
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(0)
    expect(fetchImpl).toHaveBeenCalledWith('https://preview-host.vercel.app/api/cron/geocode', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('strips trailing slashes before building cron path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const code = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app///',
      'tok',
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(0)
    expect(fetchImpl).toHaveBeenCalledWith('https://host.vercel.app/api/cron/geocode', {
      method: 'GET',
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('returns 0 on HTTP 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const code = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app',
      's',
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(0)
  })

  it('returns 1 when HTTP response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    const code = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app',
      's',
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(1)
  })

  it('returns 1 when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'))
    const code = await invokeGeocodeCronAtDeploymentUrl(
      'https://host.vercel.app',
      's',
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(1)
  })
})
