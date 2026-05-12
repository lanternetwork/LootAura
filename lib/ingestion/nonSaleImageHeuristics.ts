/**
 * Deterministic URL signals for images that must not be used as real listing photos
 * (platform branding, site chrome, trackers). Used at ingest (DOM/og/metadata) and
 * publish (sanitizer / replaceable-media detection).
 */

function pathSearchHashLower(u: URL): string {
  return `${u.pathname} ${u.search} ${u.hash}`.toLowerCase()
}

/** basename of last path segment, lowercased */
function lastPathSegmentLower(u: URL): string {
  const segs = u.pathname.split('/').filter(Boolean)
  const last = segs[segs.length - 1] ?? ''
  return last.toLowerCase()
}

/**
 * Returns a non-null reason string when the URL should not be used as a sale listing image.
 * Invalid / non-HTTPS URLs return `invalid_url` so callers that treat any signal as reject
 * stay fail-closed.
 */
export function urlSuggestsNonListingPhoto(urlString: string): string | null {
  const trimmed = urlString.trim()
  if (!trimmed) return 'empty'

  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    return 'invalid_url'
  }

  if (u.protocol !== 'https:') return 'non_https'

  const host = u.hostname.toLowerCase()
  const psh = pathSearchHashLower(u)
  const haystack = `${host} ${psh}`.toLowerCase()
  const base = lastPathSegmentLower(u)

  // --- YSTM / Yard Sale Treasure Map: site chrome and branding (host + path) ---
  const isYstmHost = /(?:^|\.)yardsaletreasuremap\.(?:com|net|org)$/i.test(host)

  if (isYstmHost) {
    if (/\/pics\//i.test(u.pathname)) {
      if (
        /logo|site_logo|ystm_site|\bystm\b|favicon|sprite|banner|placeholder|treasuremap|app[-_]store|googleplay|opengraph|^og[-_]/i.test(
          base
        ) ||
        /header[-_]|[-_]header|[-_]nav[-_]|^nav[-_]/i.test(base)
      ) {
        return 'ystm_host_pics_site_asset'
      }
    }
    if (/\/(?:assets|static|img|images|media)\//i.test(u.pathname)) {
      if (/(?:^|[/_-])(?:logo|logos|brand|banner|hero|site[-_]logo|ystm)(?:[/_-]|\.|$)/i.test(psh)) {
        return 'ystm_host_marketing_path'
      }
    }
  }

  // High-signal branding tokens anywhere in URL (CDN rewrites, signed URLs, etc.)
  if (
    /ystm_site_logo|ystm[-_]?site[-_]?logo|yard[-_]?sale[-_]?treasure[-_]?map[-_]?(?:logo|badge|icon|banner)/i.test(
      haystack
    )
  ) {
    return 'ystm_branding_token'
  }

  // --- Path / query / hash heuristics (listing CDNs, OpenGraph, etc.) ---
  if (
    /header[_-]|[_-]header|\/header(?:\/|$)|\/nav(?:\/|$)|navbar|\bbanner\b/i.test(psh) ||
    /\bavatar\b/.test(psh) ||
    /\bystm\b/.test(psh) ||
    /\byardsale[_-]?time[_-]?machine\b/.test(psh) ||
    /\bystm[_-]?(?:site|logo|banner|brand|header|hero)\b/.test(psh) ||
    /\b(?:site[_-]?logo|site[_-]?header|provider[_-]?logo|white[_-]?label)\b/.test(psh) ||
    /(?:^|[/_-])(?:logo|logos)(?:[/_-]|\.|$)/.test(psh) ||
    /\blogo\b/.test(psh) ||
    /\b(?:branding|brand-asset|brand_asset)\b/.test(psh) ||
    /(?:^|[/_-])sprite[s]?(?:[/_-]|\.|$)/.test(psh) ||
    /\b(?:favicon|apple-touch-icon|touch-icon|site-icon|mstile)\b/.test(psh) ||
    /\b(?:navbar|nav-icon|nav_icon|header-bg|footer-bg|footer_bg)\b/.test(psh) ||
    /\b(?:hero-banner|hero_banner|banner-ad|banner_ad|ad-banner)\b/.test(psh) ||
    /\b(?:sponsored|sponsor[-_]|affiliate|tracking-pixel|tracking_pixel)\b/.test(psh) ||
    /\b(?:watermark|placeholder|spacer|shim)\b/.test(psh) ||
    /\b(?:app-store|googleplay|play[-_]?store)\b/.test(psh)
  ) {
    return 'path_branding_ui_or_tracking'
  }

  if (/\b(?:pixel|blank|clear|transparent)[_-]?(?:1x1)?\b/.test(psh) || /\b1x1\b/.test(psh)) {
    return 'path_likely_tracker_or_spacer'
  }

  const dimInName = /[_/-](\d{2,4})x(\d{2,4})(?:[^/]*)?\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.exec(u.pathname)
  if (dimInName) {
    const w = Number.parseInt(dimInName[1], 10)
    const h = Number.parseInt(dimInName[2], 10)
    if (Number.isFinite(w) && Number.isFinite(h)) {
      // Inline thresholds aligned with dimensionsSuggestBrandOrTrackerAsset (import would be circular if here)
      if (w <= 0 || h <= 0 || w * h < 2_800) return 'filename_dimension_hint'
      const ratio = w / h
      if (ratio >= 3.8 && h <= 120) return 'filename_dimension_hint'
      if (ratio <= 0.28 && w <= 120) return 'filename_dimension_hint'
    }
  }

  if (/\.svg(?:$|[?#])/i.test(u.pathname) && /logo|icon|sprite|favicon|brand|\bystm\b/i.test(psh)) {
    return 'svg_branding_or_ui'
  }

  return null
}
