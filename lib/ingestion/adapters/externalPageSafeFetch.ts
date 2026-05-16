/**
 * SSRF-hardened HTTP fetch for external_page_source list URLs only.
 * HTTPS-only, DNS + IP validation, manual redirects (capped), timeout, body cap, HTML content checks.
 */

import { createHash } from 'crypto'
import * as dns from 'node:dns/promises'
import { isIPv4, isIPv6 } from 'node:net'
import { logger } from '@/lib/log'

const FETCH_TIMEOUT_MS = 8_000
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_REDIRECTS = 3

const USER_AGENT =
  'Mozilla/5.0 (compatible; LootAura/1.0; +https://lootaura.com) AppleWebKit/537.36 (KHTML, like Gecko)'

/** Reason codes for structured logs (no URLs / no PII). */
export const EXTERNAL_FETCH_REASON = {
  OK: 'fetch_ok',
  INVALID_URL: 'invalid_url',
  INSECURE_SCHEME: 'insecure_scheme',
  USERINFO_FORBIDDEN: 'userinfo_forbidden',
  FORBIDDEN_HOSTNAME: 'forbidden_hostname',
  DNS_FAILURE: 'dns_failure',
  NON_PUBLIC_IP: 'non_public_ip',
  REDIRECT_LIMIT: 'redirect_limit',
  REDIRECT_NO_LOCATION: 'redirect_no_location',
  FETCH_FAILED: 'fetch_failed',
  TIMEOUT: 'fetch_timeout',
  OVERSIZED_BODY: 'oversized_body',
  NON_HTML: 'non_html_content',
  HTTP_ERROR: 'http_error',
} as const

export type ExternalFetchLogContext = {
  component: string
  operation: string
  adapter: string
  city: string
  state: string
  pageIndex: number
  hostHash: string | null
  reason: string
  httpStatus?: number
}

export function hashHostForLog(hostname: string): string {
  return createHash('sha256').update(hostname.toLowerCase()).digest('hex').slice(0, 16)
}

function normalizeHostForIpChecks(hostname: string): string {
  const trimmed = hostname.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.length > 2) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const v = Number.parseInt(p, 10)
    if (!Number.isInteger(v) || v < 0 || v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

/** True if IPv4 must be rejected (private, loopback, CGNAT, metadata, multicast, reserved, unspecified). */
export function isNonPublicIpv4(ip: string): boolean {
  const n = ipv4ToUint32(ip)
  if (n === null) return true
  const a = (n >>> 24) & 0xff
  const b = (n >>> 16) & 0xff

  if (a === 127) return true
  if (a === 10) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224 && a <= 239) return true
  if (a >= 240) return true
  return false
}

/** Reject private IPv6, ULA, link-local, multicast, ::1, ::, and IPv4-mapped private forms. */
export function isNonPublicIpv6(ip: string): boolean {
  const lower = ip.trim().toLowerCase()
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true

  // Treat IPv4-mapped IPv6 as non-public for SSRF safety.
  if (lower.startsWith('::ffff:')) return true

  const v4m = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i)
  if (v4m?.[1]) {
    return isNonPublicIpv4(v4m[1])
  }

  // fe80::/10 (link-local): fe80–febf in first hextet
  if (/^fe[89ab][0-9a-f]{0,3}:/i.test(lower)) return true
  // fc00::/7 (ULA): first hextet fc** or fd** (incl. compressed fc:: / fd::)
  if (/^f[cd][0-9a-f]{0,3}:/i.test(lower)) return true
  // ff00::/8 multicast
  if (lower.startsWith('ff')) return true

  return false
}

/** True if this IP (IPv4 or IPv6 string) must not be connected to. */
export function isNonPublicIpAddress(ip: string): boolean {
  if (isIPv4(ip)) return isNonPublicIpv4(ip)
  if (isIPv6(ip)) return isNonPublicIpv6(ip)
  return true
}

function isForbiddenHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase()
  if (!h) return true
  if (h === 'localhost') return true
  if (h.endsWith('.local')) return true
  if (h.endsWith('.localhost')) return true
  return false
}

/**
 * Parse and validate an absolute HTTPS URL for fetch. Throws Error with message prefix for tests.
 */
export function validateExternalHttpsUrlForFetch(urlString: string): URL {
  const raw = urlString.trim()
  if (!raw) {
    throw new Error(`${EXTERNAL_FETCH_REASON.INVALID_URL}: empty`)
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${EXTERNAL_FETCH_REASON.INVALID_URL}: malformed`)
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${EXTERNAL_FETCH_REASON.INSECURE_SCHEME}: ${url.protocol}`)
  }
  if (url.username || url.password) {
    throw new Error(`${EXTERNAL_FETCH_REASON.USERINFO_FORBIDDEN}`)
  }
  if (!url.hostname) {
    throw new Error(`${EXTERNAL_FETCH_REASON.INVALID_URL}: no host`)
  }
  const host = normalizeHostForIpChecks(url.hostname)
  if (isForbiddenHostname(host)) {
    throw new Error(`${EXTERNAL_FETCH_REASON.FORBIDDEN_HOSTNAME}`)
  }
  if (isIPv4(host) || isIPv6(host)) {
    if (isNonPublicIpAddress(host)) {
      throw new Error(`${EXTERNAL_FETCH_REASON.NON_PUBLIC_IP}`)
    }
    return url
  }
  return url
}

async function resolveAndAssertPublicHost(hostname: string): Promise<void> {
  const host = normalizeHostForIpChecks(hostname)
  if (isIPv4(host) || isIPv6(host)) {
    if (isNonPublicIpAddress(host)) {
      throw new Error(`${EXTERNAL_FETCH_REASON.NON_PUBLIC_IP}`)
    }
    return
  }
  if (isForbiddenHostname(host)) {
    throw new Error(`${EXTERNAL_FETCH_REASON.FORBIDDEN_HOSTNAME}`)
  }
  let records: Array<{ address: string; family: number }>
  try {
    records = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error(`${EXTERNAL_FETCH_REASON.DNS_FAILURE}`)
  }
  if (!records.length) {
    throw new Error(`${EXTERNAL_FETCH_REASON.DNS_FAILURE}`)
  }
  for (const r of records) {
    if (isNonPublicIpAddress(r.address)) {
      throw new Error(`${EXTERNAL_FETCH_REASON.NON_PUBLIC_IP}`)
    }
  }
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function isAllowedContentType(ct: string | null): 'allow' | 'reject' | 'sniff' {
  if (!ct || !ct.trim()) return 'sniff'
  const lower = ct.split(';')[0].trim().toLowerCase()
  if (lower.includes('text/html')) return 'allow'
  if (lower.includes('application/xhtml+xml')) return 'allow'
  if (
    lower.startsWith('image/') ||
    lower.startsWith('video/') ||
    lower.startsWith('audio/') ||
    lower.startsWith('font/') ||
    lower === 'application/octet-stream' ||
    lower === 'application/pdf' ||
    lower === 'application/zip' ||
    lower === 'application/wasm' ||
    lower.startsWith('multipart/')
  ) {
    return 'reject'
  }
  return 'sniff'
}

function bodyLooksLikeHtml(bytes: Uint8Array): boolean {
  let start = 0
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    start = 3
  }
  const maxScan = Math.min(bytes.length, 512)
  const slice = bytes.subarray(start, maxScan)
  const decoder = new TextDecoder('utf-8', { fatal: false })
  const head = decoder.decode(slice).trimStart()
  if (/^<!DOCTYPE\s+html/i.test(head)) return true
  if (/^<html[\s>]/i.test(head)) return true
  if (/^<head[\s>]/i.test(head)) return true
  if (/^<body[\s>]/i.test(head)) return true
  if (/^<\?xml/i.test(head)) return true
  return false
}

async function readBodyWithCap(res: Response, maxBytes: number, readTimeoutMs: number): Promise<Uint8Array> {
  const readOnce = async (): Promise<Uint8Array> => {
    if (!res.body) {
      const buf = await res.arrayBuffer()
      if (buf.byteLength > maxBytes) {
        throw new Error(`${EXTERNAL_FETCH_REASON.OVERSIZED_BODY}`)
      }
      return new Uint8Array(buf)
    }
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value && value.length) {
          total += value.length
          if (total > maxBytes) {
            await reader.cancel()
            throw new Error(`${EXTERNAL_FETCH_REASON.OVERSIZED_BODY}`)
          }
          chunks.push(value)
        }
      }
    } catch (e) {
      await reader.cancel().catch(() => {})
      throw e
    }
    const out = new Uint8Array(total)
    let off = 0
    for (const c of chunks) {
      out.set(c, off)
      off += c.length
    }
    return out
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${EXTERNAL_FETCH_REASON.TIMEOUT}`)), readTimeoutMs)
  })
  try {
    return await Promise.race([readOnce(), timeoutPromise])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

function logFetchDecision(ctx: ExternalFetchLogContext, level: 'warn' | 'info'): void {
  if (level === 'info') {
    logger.info('External page source: safe fetch', ctx)
  } else {
    logger.warn('External page source: safe fetch rejected', ctx)
  }
}

function reasonFromErrorMessage(msg: string): string {
  if (msg.startsWith(EXTERNAL_FETCH_REASON.TIMEOUT)) return EXTERNAL_FETCH_REASON.TIMEOUT
  if (msg.startsWith(EXTERNAL_FETCH_REASON.INVALID_URL)) return EXTERNAL_FETCH_REASON.INVALID_URL
  if (msg.startsWith(EXTERNAL_FETCH_REASON.INSECURE_SCHEME)) return EXTERNAL_FETCH_REASON.INSECURE_SCHEME
  if (msg.includes(EXTERNAL_FETCH_REASON.USERINFO_FORBIDDEN)) return EXTERNAL_FETCH_REASON.USERINFO_FORBIDDEN
  if (msg.includes(EXTERNAL_FETCH_REASON.FORBIDDEN_HOSTNAME)) return EXTERNAL_FETCH_REASON.FORBIDDEN_HOSTNAME
  if (msg.includes(EXTERNAL_FETCH_REASON.DNS_FAILURE)) return EXTERNAL_FETCH_REASON.DNS_FAILURE
  if (msg.includes(EXTERNAL_FETCH_REASON.NON_PUBLIC_IP)) return EXTERNAL_FETCH_REASON.NON_PUBLIC_IP
  if (msg.startsWith(EXTERNAL_FETCH_REASON.REDIRECT_LIMIT)) return EXTERNAL_FETCH_REASON.REDIRECT_LIMIT
  if (msg.startsWith(EXTERNAL_FETCH_REASON.REDIRECT_NO_LOCATION)) return EXTERNAL_FETCH_REASON.REDIRECT_NO_LOCATION
  if (msg.startsWith(EXTERNAL_FETCH_REASON.HTTP_ERROR)) return EXTERNAL_FETCH_REASON.HTTP_ERROR
  if (msg.startsWith(EXTERNAL_FETCH_REASON.NON_HTML)) return EXTERNAL_FETCH_REASON.NON_HTML
  if (msg.startsWith(EXTERNAL_FETCH_REASON.OVERSIZED_BODY)) return EXTERNAL_FETCH_REASON.OVERSIZED_BODY
  return EXTERNAL_FETCH_REASON.FETCH_FAILED
}

export type SafeFetchContext = {
  city: string
  state: string
  pageIndex: number
  adapter: string
}

/**
 * Fetch HTML for an external list page with SSRF protections.
 * Throws on failure (caller increments errors and continues).
 */
export async function fetchSafeExternalPageHtml(pageUrl: string, context: SafeFetchContext): Promise<string> {
  const baseLog = {
    component: 'ingestion/adapters/externalPageSafeFetch',
    operation: 'fetch_page',
    adapter: context.adapter,
    city: context.city,
    state: context.state,
    pageIndex: context.pageIndex,
  } as const

  let currentUrl = validateExternalHttpsUrlForFetch(pageUrl)
  let hostHash = hashHostForLog(currentUrl.hostname)
  let redirectsFollowed = 0

  const runFetchOnce = async (url: URL): Promise<Response> => {
    await resolveAndAssertPublicHost(url.hostname)
    hostHash = hashHostForLog(url.hostname)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'User-Agent': USER_AGENT,
        },
      })
      return res
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`${EXTERNAL_FETCH_REASON.TIMEOUT}`)
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  while (true) {
    currentUrl = validateExternalHttpsUrlForFetch(currentUrl.href)
    let res: Response
    try {
      res = await runFetchOnce(currentUrl)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logFetchDecision({ ...baseLog, hostHash, reason: reasonFromErrorMessage(msg), httpStatus: undefined }, 'warn')
      throw e instanceof Error ? e : new Error(EXTERNAL_FETCH_REASON.FETCH_FAILED)
    }
    if (!res || typeof res.status !== 'number') {
      logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.FETCH_FAILED, httpStatus: undefined }, 'warn')
      throw new Error(EXTERNAL_FETCH_REASON.FETCH_FAILED)
    }

    if (isRedirectStatus(res.status)) {
      if (redirectsFollowed >= MAX_REDIRECTS) {
        logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.REDIRECT_LIMIT, httpStatus: res.status }, 'warn')
        throw new Error(`${EXTERNAL_FETCH_REASON.REDIRECT_LIMIT}`)
      }
      const loc = res.headers.get('Location')
      if (!loc || !loc.trim()) {
        logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.REDIRECT_NO_LOCATION, httpStatus: res.status }, 'warn')
        throw new Error(`${EXTERNAL_FETCH_REASON.REDIRECT_NO_LOCATION}`)
      }
      redirectsFollowed += 1
      try {
        currentUrl = new URL(loc.trim(), currentUrl.href)
      } catch {
        logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.INVALID_URL, httpStatus: res.status }, 'warn')
        throw new Error(`${EXTERNAL_FETCH_REASON.INVALID_URL}: redirect target`)
      }
      try {
        validateExternalHttpsUrlForFetch(currentUrl.href)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logFetchDecision(
          { ...baseLog, hostHash, reason: reasonFromErrorMessage(msg), httpStatus: res.status },
          'warn'
        )
        throw e instanceof Error ? e : new Error(EXTERNAL_FETCH_REASON.INVALID_URL)
      }
      res.body?.cancel().catch(() => {})
      continue
    }

    if (!res.ok) {
      logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.HTTP_ERROR, httpStatus: res.status }, 'warn')
      throw new Error(`${EXTERNAL_FETCH_REASON.HTTP_ERROR}: ${res.status}`)
    }

    const ct = res.headers.get('Content-Type')
    const ctDecision = isAllowedContentType(ct)

    if (ctDecision === 'reject') {
      logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.NON_HTML, httpStatus: res.status }, 'warn')
      throw new Error(`${EXTERNAL_FETCH_REASON.NON_HTML}`)
    }

    let bytes: Uint8Array
    try {
      bytes = await readBodyWithCap(res, MAX_RESPONSE_BYTES, FETCH_TIMEOUT_MS)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes(EXTERNAL_FETCH_REASON.TIMEOUT)) {
        logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.TIMEOUT, httpStatus: res.status }, 'warn')
        throw new Error(`${EXTERNAL_FETCH_REASON.TIMEOUT}`)
      }
      if (msg.includes(EXTERNAL_FETCH_REASON.OVERSIZED_BODY)) {
        logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.OVERSIZED_BODY, httpStatus: res.status }, 'warn')
      }
      throw e
    }

    if (ctDecision === 'sniff' && !bodyLooksLikeHtml(bytes)) {
      logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.NON_HTML, httpStatus: res.status }, 'warn')
      throw new Error(`${EXTERNAL_FETCH_REASON.NON_HTML}`)
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    logFetchDecision({ ...baseLog, hostHash, reason: EXTERNAL_FETCH_REASON.OK, httpStatus: res.status }, 'info')
    return html
  }
}
