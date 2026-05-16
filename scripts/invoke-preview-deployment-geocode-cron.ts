/**
 * Invokes GET /api/cron/geocode on a live preview deployment URL (post-deploy only).
 *
 * GitHub Actions: `.github/workflows/preview-post-deploy-geocode-cron.yml` runs this
 * after Vercel `repository_dispatch` (`vercel.deployment.ready` / `vercel.deployment.success`)
 * or legacy `deployment_status` — not during the Vercel build.
 *
 * Env (CLI):
 * - PREVIEW_DEPLOYMENT_URL: full base URL (e.g. https://….vercel.app); bare host gets https://
 * - CRON_SECRET: Bearer token (fail-closed if missing)
 */

/** Exported for unit tests (workflow resolves URL; this normalizes before fetch). */
export function normalizeDeploymentBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}

/**
 * @returns 0 if cron responded 2xx, 1 on misconfiguration or non-OK HTTP
 */
export async function invokeGeocodeCronAtDeploymentUrl(
  deploymentBaseUrl: string,
  cronSecret: string,
  fetchImpl: typeof fetch = fetch
): Promise<number> {
  const secret = cronSecret.trim()
  if (!secret) {
    return 1
  }
  const base = normalizeDeploymentBaseUrl(deploymentBaseUrl)
  if (!base) {
    return 1
  }
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    return 1
  }
  if (parsed.protocol !== 'https:') {
    return 1
  }
  const url = new URL('/api/cron/geocode', `${parsed.origin}/`).toString()
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
    })
    return res.ok ? 0 : 1
  } catch {
    return 1
  }
}

async function main(): Promise<void> {
  const url = process.env.PREVIEW_DEPLOYMENT_URL ?? ''
  const secret = process.env.CRON_SECRET ?? ''
  const code = await invokeGeocodeCronAtDeploymentUrl(url, secret)
  if (code !== 0) {
    console.error('invoke-preview-deployment-geocode-cron: failed or misconfigured')
  }
  process.exit(code)
}

void main()
