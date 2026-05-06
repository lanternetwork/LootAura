import * as dns from 'node:dns/promises'
import { isIPv4, isIPv6 } from 'node:net'
import { logger } from '@/lib/log'
import {
  EXTERNAL_FETCH_REASON,
  hashHostForLog,
  isNonPublicIpAddress,
  validateExternalHttpsUrlForFetch,
} from '@/lib/ingestion/adapters/externalPageSafeFetch'

export async function isValidExternalImageUrl(urlString: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = validateExternalHttpsUrlForFetch(urlString)
  } catch {
    return false
  }

  const host = parsed.hostname
  if (isIPv4(host) || isIPv6(host)) {
    return !isNonPublicIpAddress(host)
  }

  try {
    const addresses = await dns.lookup(host, { all: true, verbatim: true })
    if (!addresses.length) return false
    for (const addr of addresses) {
      if (isNonPublicIpAddress(addr.address)) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

export async function sanitizeExternalImageUrls(
  candidates: unknown,
  context: { rowId: string; city: string | null; state: string | null; max: number }
): Promise<string[]> {
  if (!Array.isArray(candidates) || context.max <= 0) return []

  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)

    const ok = await isValidExternalImageUrl(trimmed)
    if (!ok) {
      let hostHash: string | null = null
      try {
        hostHash = hashHostForLog(new URL(trimmed).hostname)
      } catch {
        hostHash = null
      }
      logger.warn('Publish image candidate rejected', {
        component: 'ingestion/externalImageValidation',
        operation: 'validate_image_url',
        rowId: context.rowId,
        city: context.city,
        state: context.state,
        hostHash,
        reason: EXTERNAL_FETCH_REASON.NON_PUBLIC_IP,
      })
      continue
    }

    out.push(trimmed)
    if (out.length >= context.max) break
  }

  return out
}
