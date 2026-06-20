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
 * - VERCEL_AUTOMATION_BYPASS_SECRET: optional; sent as x-vercel-protection-bypass when set
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

export type InvokeGeocodeCronFailureReason =
  | 'missing_secret'
  | 'missing_url'
  | 'invalid_url'
  | 'network_error'
  | 'http_error'

export type InvokeGeocodeCronResult =
  | { ok: true; url: string }
  | {
      ok: false
      reason: InvokeGeocodeCronFailureReason
      url?: string
      httpStatus?: number
      errorCode?: string
      responseSnippet?: string
    }

/** Delay before each attempt: immediate, then 10s, then 30s. */
export const GEOCODE_INVOKE_RETRY_DELAYS_MS = [0, 10_000, 30_000] as const

const RETRYABLE_HTTP_STATUSES = new Set([
  401, 403, 408, 409, 425, 429, 500, 502, 503, 504,
])

/** Shared with workflow curl steps for consistent cron auth headers. */
export function buildPreviewCronRequestHeaders(
  cronSecret: string,
  bypassSecret?: string
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cronSecret.trim()}`,
  }
  const bypass = bypassSecret?.trim()
  if (bypass) {
    headers['x-vercel-protection-bypass'] = bypass
  }
  return headers
}

async function readResponseSnippet(res: Response): Promise<string> {
  try {
    const text = (await res.text()).trim()
    return text.length > 500 ? `${text.slice(0, 500)}…` : text
  } catch {
    return ''
  }
}

function parseErrorCode(responseSnippet: string): string | undefined {
  try {
    const parsed = JSON.parse(responseSnippet) as { code?: unknown }
    return typeof parsed.code === 'string' ? parsed.code : undefined
  } catch {
    return undefined
  }
}

function parseShortResponseMessage(responseSnippet?: string): string | undefined {
  if (!responseSnippet) return undefined
  try {
    const parsed = JSON.parse(responseSnippet) as { error?: unknown; message?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
    if (typeof parsed.message === 'string') return parsed.message
  } catch {
    return undefined
  }
  return undefined
}

export function isRetryableInvokeResult(
  result: Extract<InvokeGeocodeCronResult, { ok: false }>
): boolean {
  if (
    result.reason === 'missing_secret' ||
    result.reason === 'missing_url' ||
    result.reason === 'invalid_url'
  ) {
    return false
  }
  if (result.reason === 'network_error') {
    return true
  }
  if (result.reason === 'http_error' && result.httpStatus != null) {
    return RETRYABLE_HTTP_STATUSES.has(result.httpStatus)
  }
  return false
}

export function formatInvokeAttemptLogLine(params: {
  attempt: number
  result: Extract<InvokeGeocodeCronResult, { ok: false }>
  retrying: boolean
}): string {
  const { attempt, result, retrying } = params
  const url = result.url ?? 'geocode cron'
  const codePart = result.errorCode ? ` code=${result.errorCode}` : ''

  if (result.reason === 'network_error') {
    return `attempt=${attempt} status=network message="network error" retrying=${retrying ? 'yes' : 'no'} url=${url}`
  }

  const status = result.httpStatus ?? 'unknown'
  let message: string
  if (result.httpStatus === 401) {
    message = 'auth rejected'
  } else {
    message = parseShortResponseMessage(result.responseSnippet) ?? 'request failed'
  }

  return `attempt=${attempt} status=${status}${codePart} message="${message}" retrying=${retrying ? 'yes' : 'no'} url=${url}`
}

export function formatInvokeGeocodeCronFailure(result: Extract<InvokeGeocodeCronResult, { ok: false }>): string {
  switch (result.reason) {
    case 'missing_secret':
      return 'CRON_SECRET is missing or blank'
    case 'missing_url':
      return 'PREVIEW_DEPLOYMENT_URL is missing or blank'
    case 'invalid_url':
      return 'PREVIEW_DEPLOYMENT_URL must be a valid https URL'
    case 'network_error':
      return result.url ? `Network error invoking ${result.url}` : 'Network error invoking geocode cron'
    case 'http_error': {
      const status = result.httpStatus ?? 'unknown'
      const code = result.errorCode ? ` code=${result.errorCode}` : ''
      if (result.httpStatus === 401) {
        return (
          `HTTP 401 Unauthorized${code} at ${result.url ?? 'geocode cron'}: ` +
          'GitHub Actions CRON_SECRET likely does not match Vercel Preview CRON_SECRET ' +
          '(set the same value in Vercel Project Settings → Environment Variables → Preview)'
        )
      }
      if (result.httpStatus === 500 && result.errorCode === 'CRON_SECRET_NOT_SET') {
        return (
          `HTTP 500 CRON_SECRET_NOT_SET at ${result.url ?? 'geocode cron'}: ` +
          'Vercel Preview deployment is missing CRON_SECRET'
        )
      }
      const body = result.responseSnippet ? ` body=${result.responseSnippet}` : ''
      return `HTTP ${status}${code} at ${result.url ?? 'geocode cron'}${body}`
    }
    default:
      return 'invoke-preview-deployment-geocode-cron: failed or misconfigured'
  }
}

/**
 * @returns structured result; legacy callers can treat !ok as exit code 1
 */
export async function invokeGeocodeCronAtDeploymentUrl(
  deploymentBaseUrl: string,
  cronSecret: string,
  fetchImpl: typeof fetch = fetch,
  bypassSecret?: string
): Promise<InvokeGeocodeCronResult> {
  const secret = cronSecret.trim()
  if (!secret) {
    return { ok: false, reason: 'missing_secret' }
  }
  const base = normalizeDeploymentBaseUrl(deploymentBaseUrl)
  if (!base) {
    return { ok: false, reason: 'missing_url' }
  }
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'invalid_url' }
  }
  const url = new URL('/api/cron/geocode', `${parsed.origin}/`).toString()
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: buildPreviewCronRequestHeaders(secret, bypassSecret),
    })
    if (res.ok) {
      return { ok: true, url }
    }
    const responseSnippet = await readResponseSnippet(res)
    return {
      ok: false,
      reason: 'http_error',
      url,
      httpStatus: res.status,
      errorCode: parseErrorCode(responseSnippet),
      responseSnippet: responseSnippet || undefined,
    }
  } catch {
    return { ok: false, reason: 'network_error', url }
  }
}

export type InvokeGeocodeCronWithRetryOptions = {
  fetchImpl?: typeof fetch
  bypassSecret?: string
  sleepMs?: (ms: number) => Promise<void>
  log?: (line: string) => void
}

/**
 * Invokes geocode cron with bounded retry/backoff for transient deployment readiness failures.
 */
export async function invokeGeocodeCronAtDeploymentUrlWithRetry(
  deploymentBaseUrl: string,
  cronSecret: string,
  options: InvokeGeocodeCronWithRetryOptions = {}
): Promise<InvokeGeocodeCronResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleepMs = options.sleepMs ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const log = options.log ?? ((line: string) => console.error(line))

  let lastResult: InvokeGeocodeCronResult = { ok: false, reason: 'missing_url' }

  for (let i = 0; i < GEOCODE_INVOKE_RETRY_DELAYS_MS.length; i++) {
    const attempt = i + 1
    if (i > 0) {
      await sleepMs(GEOCODE_INVOKE_RETRY_DELAYS_MS[i])
    }

    const result = await invokeGeocodeCronAtDeploymentUrl(
      deploymentBaseUrl,
      cronSecret,
      fetchImpl,
      options.bypassSecret
    )
    if (result.ok) {
      return result
    }

    lastResult = result

    if (
      result.reason === 'missing_secret' ||
      result.reason === 'missing_url' ||
      result.reason === 'invalid_url'
    ) {
      return result
    }

    const willRetry =
      attempt < GEOCODE_INVOKE_RETRY_DELAYS_MS.length && isRetryableInvokeResult(result)
    log(formatInvokeAttemptLogLine({ attempt, result, retrying: willRetry }))

    if (!willRetry) {
      return result
    }
  }

  return lastResult
}

async function main(): Promise<void> {
  const url = process.env.PREVIEW_DEPLOYMENT_URL ?? ''
  const secret = process.env.CRON_SECRET ?? ''
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  const result = await invokeGeocodeCronAtDeploymentUrlWithRetry(url, secret, {
    fetchImpl: fetch,
    bypassSecret: bypass,
  })
  if (!result.ok) {
    console.error(`invoke-preview-deployment-geocode-cron: ${formatInvokeGeocodeCronFailure(result)}`)
  }
  process.exit(result.ok ? 0 : 1)
}

void main()
