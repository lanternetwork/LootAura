import { getSeoBaseUrl } from '@/lib/seo/constants'
import type { SeoDistributionSurfaceId } from '@/lib/seo/distribution/types'

/** UTM-tagged URLs for manual local discovery distribution (Phase 7). */
export function buildSeoDistributionUrl(
  pathname: string,
  surface: SeoDistributionSurfaceId
): string {
  if (!pathname.startsWith('/') || pathname.startsWith('//')) {
    throw new Error('Invalid distribution path')
  }
  const origin = new URL(getSeoBaseUrl()).origin
  const url = new URL(pathname, `${origin}/`)
  if (url.origin !== origin) {
    throw new Error('Distribution URL must stay on configured site origin')
  }
  url.searchParams.set('utm_source', 'local_discovery')
  url.searchParams.set('utm_medium', 'manual')
  url.searchParams.set('utm_campaign', `seo_${surface}`)
  return url.href
}
