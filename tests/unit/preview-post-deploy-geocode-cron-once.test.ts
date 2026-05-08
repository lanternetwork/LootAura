import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPreviewPostDeployGeocodeCronOnce } from '../../scripts/preview-post-deploy-geocode-cron-once'

describe('runPreviewPostDeployGeocodeCronOnce', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 0 when not preview (e.g. production)', async () => {
    const fetchImpl = vi.fn()
    const code = await runPreviewPostDeployGeocodeCronOnce(
      { ...process.env, VERCEL_ENV: 'production', CRON_SECRET: 'x', VERCEL_URL: 'x.vercel.app' },
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 0 when VERCEL_ENV is unset', async () => {
    const fetchImpl = vi.fn()
    const env = { ...process.env }
    delete env.VERCEL_ENV
    const code = await runPreviewPostDeployGeocodeCronOnce(env, fetchImpl as unknown as typeof fetch)
    expect(code).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fail-closed: returns 1 on preview when CRON_SECRET is missing', async () => {
    const fetchImpl = vi.fn()
    const code = await runPreviewPostDeployGeocodeCronOnce(
      { ...process.env, VERCEL_ENV: 'preview', VERCEL_URL: 'p.vercel.app' },
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fail-closed: returns 1 on preview when VERCEL_URL is missing', async () => {
    const fetchImpl = vi.fn()
    const code = await runPreviewPostDeployGeocodeCronOnce(
      { ...process.env, VERCEL_ENV: 'preview', CRON_SECRET: 'secret' },
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(1)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('on preview with secret and URL, invokes geocode cron once with Bearer auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const code = await runPreviewPostDeployGeocodeCronOnce(
      { ...process.env, VERCEL_ENV: 'preview', CRON_SECRET: 's', VERCEL_URL: 'host.vercel.app' },
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://host.vercel.app/api/cron/geocode', {
      method: 'GET',
      headers: { Authorization: 'Bearer s' },
    })
  })

  it('returns 1 when cron HTTP response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    const code = await runPreviewPostDeployGeocodeCronOnce(
      { ...process.env, VERCEL_ENV: 'preview', CRON_SECRET: 's', VERCEL_URL: 'host.vercel.app' },
      fetchImpl as unknown as typeof fetch
    )
    expect(code).toBe(1)
  })
})
