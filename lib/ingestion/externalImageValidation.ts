import * as dns from 'node:dns/promises'
import { isIPv4, isIPv6 } from 'node:net'
import { logger } from '@/lib/log'
import {
  EXTERNAL_FETCH_REASON,
  hashHostForLog,
  isNonPublicIpAddress,
  validateExternalHttpsUrlForFetch,
} from '@/lib/ingestion/adapters/externalPageSafeFetch'

const PROBE_BYTE_LIMIT = 131_072
const PROBE_TIMEOUT_MS = 8_000

export async function isValidExternalImageUrl(urlString: string): Promise<boolean> {
  const result = await validateExternalImageUrlWithReason(urlString)
  return result.ok
}

async function validateExternalImageUrlWithReason(
  urlString: string
): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let parsed: URL
  try {
    parsed = validateExternalHttpsUrlForFetch(urlString)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const reason = msg.split(':')[0]?.trim() || EXTERNAL_FETCH_REASON.INVALID_URL
    return { ok: false, reason }
  }

  const host = parsed.hostname
  if (isIPv4(host) || isIPv6(host)) {
    return isNonPublicIpAddress(host)
      ? { ok: false, reason: EXTERNAL_FETCH_REASON.NON_PUBLIC_IP }
      : { ok: true, url: parsed }
  }

  try {
    const addresses = await dns.lookup(host, { all: true, verbatim: true })
    if (!addresses.length) return { ok: false, reason: EXTERNAL_FETCH_REASON.DNS_FAILURE }
    for (const addr of addresses) {
      if (isNonPublicIpAddress(addr.address)) {
        return { ok: false, reason: EXTERNAL_FETCH_REASON.NON_PUBLIC_IP }
      }
    }
    return { ok: true, url: parsed }
  } catch {
    return { ok: false, reason: EXTERNAL_FETCH_REASON.DNS_FAILURE }
  }
}

/** Exported for unit tests — raster dimension sniffing only (PNG/JPEG/GIF). */
export function parseRasterImageDimensionsFromBytes(buf: Uint8Array): { w: number; h: number } | null {
  const png = tryParsePngDimensions(buf)
  if (png) return png
  const jpeg = tryParseJpegDimensions(buf)
  if (jpeg) return jpeg
  return tryParseGifDimensions(buf)
}

function tryParsePngDimensions(buf: Uint8Array): { w: number; h: number } | null {
  if (buf.length < 24) return null
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null
  const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]
  const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23]
  if (w > 0 && h > 0 && w < 100_000 && h < 100_000) return { w, h }
  return null
}

function tryParseJpegDimensions(buf: Uint8Array): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]
    const len = (buf[i + 2] << 8) | buf[i + 3]
    if (len < 2 || i + 2 + len > buf.length) return null
    if (marker >= 0xc0 && marker <= 0xc3) {
      const h = (buf[i + 5] << 8) | buf[i + 6]
      const w = (buf[i + 7] << 8) | buf[i + 8]
      if (w > 0 && h > 0) return { w, h }
    }
    i += 2 + len
  }
  return null
}

function tryParseGifDimensions(buf: Uint8Array): { w: number; h: number } | null {
  if (buf.length < 10) return null
  if (buf[0] !== 0x47 || buf[1] !== 0x49 || buf[2] !== 0x46) return null
  const w = buf[6] | (buf[7] << 8)
  const h = buf[8] | (buf[9] << 8)
  if (w > 0 && h > 0) return { w, h }
  return null
}

/** Wide/tiny banners, sprites, and very small icons — not yard-sale photos. */
export function dimensionsSuggestBrandOrTrackerAsset(dim: { w: number; h: number }): boolean {
  const { w, h } = dim
  if (w <= 0 || h <= 0) return true
  if (w * h < 2_800) return true
  const ratio = w / h
  if (ratio >= 3.8 && h <= 120) return true
  if (ratio <= 0.28 && w <= 120) return true
  return false
}

function urlPathSuggestsNonSalePhoto(u: URL): string | null {
  const path = `${u.pathname} ${u.search} ${u.hash}`.toLowerCase()
  if (
    /\bystm\b/.test(path) ||
    /\byardsale[_-]?time[_-]?machine\b/.test(path) ||
    /\bystm[_-]?(?:site|logo|banner|brand|header|hero)\b/.test(path) ||
    /\b(?:site[_-]?logo|site[_-]?header|provider[_-]?logo|white[_-]?label)\b/.test(path) ||
    /(?:^|[/_-])(?:logo|logos)(?:[/_-]|\.|$)/.test(path) ||
    /\blogo\b/.test(path) ||
    /\b(?:branding|brand-asset|brand_asset)\b/.test(path) ||
    /(?:^|[/_-])sprite[s]?(?:[/_-]|\.|$)/.test(path) ||
    /\b(?:favicon|apple-touch-icon|touch-icon|site-icon|mstile)\b/.test(path) ||
    /\b(?:navbar|nav-icon|nav_icon|header-bg|footer-bg|footer_bg)\b/.test(path) ||
    /\b(?:hero-banner|hero_banner|banner-ad|banner_ad|ad-banner)\b/.test(path) ||
    /\b(?:sponsored|sponsor[-_]|affiliate|tracking-pixel|tracking_pixel)\b/.test(path) ||
    /\b(?:watermark|placeholder|spacer|shim)\b/.test(path)
  ) {
    return 'path_branding_ui_or_tracking'
  }
  if (/\b(?:pixel|blank|clear|transparent)[_-]?(?:1x1)?\b/.test(path) || /\b1x1\b/.test(path)) {
    return 'path_likely_tracker_or_spacer'
  }

  const dimInName = /[_/-](\d{2,4})x(\d{2,4})(?:[^/]*)?\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.exec(
    u.pathname
  )
  if (dimInName) {
    const w = Number.parseInt(dimInName[1], 10)
    const h = Number.parseInt(dimInName[2], 10)
    if (Number.isFinite(w) && Number.isFinite(h) && dimensionsSuggestBrandOrTrackerAsset({ w, h })) {
      return 'filename_dimension_hint'
    }
  }
  return null
}

async function safeReadResponseBodyPrefix(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (value?.length) {
        const remaining = maxBytes - total
        const slice = value.byteLength > remaining ? value.slice(0, remaining) : value
        chunks.push(slice)
        total += slice.byteLength
        if (value.byteLength > remaining) break
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

async function probeRasterSuggestsNonPhoto(urlString: string): Promise<'reject' | 'inconclusive'> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(urlString, {
      method: 'GET',
      signal: ac.signal,
      headers: { Range: `bytes=0-${PROBE_BYTE_LIMIT - 1}`, Accept: 'image/*,*/*;q=0.9,*/*;q=0.1' },
      redirect: 'follow',
    })

    if (!res.ok && res.status !== 206) return 'inconclusive'

    const cl = res.headers.get('content-length')
    if (res.status === 200 && cl) {
      const n = Number.parseInt(cl, 10)
      if (Number.isFinite(n) && n > PROBE_BYTE_LIMIT) {
        const buf = await safeReadResponseBodyPrefix(res, PROBE_BYTE_LIMIT)
        const dim = parseRasterImageDimensionsFromBytes(buf)
        if (!dim) return 'inconclusive'
        return dimensionsSuggestBrandOrTrackerAsset(dim) ? 'reject' : 'inconclusive'
      }
    }

    const buf =
      res.status === 206 || (cl && Number.parseInt(cl, 10) <= PROBE_BYTE_LIMIT)
        ? new Uint8Array(await res.arrayBuffer())
        : await safeReadResponseBodyPrefix(res, PROBE_BYTE_LIMIT)

    if (buf.byteLength < 24) return 'inconclusive'
    const dim = parseRasterImageDimensionsFromBytes(buf)
    if (!dim) return 'inconclusive'
    return dimensionsSuggestBrandOrTrackerAsset(dim) ? 'reject' : 'inconclusive'
  } catch {
    return 'inconclusive'
  } finally {
    clearTimeout(timer)
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

    const validation = await validateExternalImageUrlWithReason(trimmed)
    if (!validation.ok) {
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
        reason: validation.reason,
      })
      continue
    }

    const pathReason = urlPathSuggestsNonSalePhoto(validation.url)
    if (pathReason) {
      logger.warn('Publish image candidate rejected', {
        component: 'ingestion/externalImageValidation',
        operation: 'non_photo_url_heuristic',
        rowId: context.rowId,
        city: context.city,
        state: context.state,
        reason: pathReason,
      })
      continue
    }

    const probe = await probeRasterSuggestsNonPhoto(trimmed)
    if (probe === 'reject') {
      logger.warn('Publish image candidate rejected', {
        component: 'ingestion/externalImageValidation',
        operation: 'raster_dimension_heuristic',
        rowId: context.rowId,
        city: context.city,
        state: context.state,
        reason: 'banner_or_icon_dimensions',
      })
      continue
    }

    out.push(trimmed)
    if (out.length >= context.max) break
  }

  return out
}
