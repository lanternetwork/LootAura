import { generateSitemaps } from '@/app/sitemap'
import { getSeoBaseUrl } from '@/lib/seo/constants'
import {
  buildSitemapIndexXml,
  buildSitemapSegmentUrl,
} from '@/lib/seo/sitemap/buildSitemapIndexXml'

export const dynamic = 'force-dynamic'

/**
 * Explicit sitemap index — Next.js 15 generateSitemaps() child segments work at
 * /sitemap/[id].xml but /sitemap.xml returns 404 without this handler.
 */
export async function GET() {
  const segments = await generateSitemaps()
  const baseUrl = getSeoBaseUrl()
  const segmentUrls = segments.map(({ id }) => buildSitemapSegmentUrl(baseUrl, String(id)))
  const xml = buildSitemapIndexXml(segmentUrls)

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
