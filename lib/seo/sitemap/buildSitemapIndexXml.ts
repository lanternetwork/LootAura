/**
 * Sitemap index XML for /sitemap.xml.
 * Child segments are served by app/sitemap.ts at /sitemap/[id].xml.
 */
export function buildSitemapIndexXml(segmentUrls: string[]): string {
  const entries = segmentUrls
    .map(
      (loc) => `  <sitemap>
    <loc>${escapeXml(loc)}</loc>
  </sitemap>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildSitemapSegmentUrl(baseUrl: string, segmentId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/sitemap/${segmentId}.xml`
}
