/**
 * Single bounded invocation of GET /api/cron/geocode after a Vercel preview build (see vercel.json buildCommand).
 *
 * Preview only: when `VERCEL_ENV !== 'preview'`, exits 0 without calling the network (including production).
 * On preview: requires non-empty `CRON_SECRET` and `VERCEL_URL`; otherwise exits 1 (fail-closed).
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */

export async function runPreviewPostDeployGeocodeCronOnce(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  if (env.VERCEL_ENV !== 'preview') {
    return 0
  }
  const secret = env.CRON_SECRET?.trim()
  if (!secret) {
    return 1
  }
  const vercelUrl = env.VERCEL_URL?.trim()
  if (!vercelUrl) {
    return 1
  }
  const url = `https://${vercelUrl}/api/cron/geocode`
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
  })
  return res.ok ? 0 : 1
}

async function main(): Promise<void> {
  const code = await runPreviewPostDeployGeocodeCronOnce()
  if (code !== 0) {
    console.error('preview-post-deploy-geocode-cron-once: failed or misconfigured')
  }
  process.exit(code)
}

void main()
