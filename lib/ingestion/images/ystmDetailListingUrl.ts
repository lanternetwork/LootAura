const YSTM_HOST_RE = /(?:^|\.)yardsaletreasuremap\.(?:com|net|org)$/i

function isYstmHost(hostname: string): boolean {
  return YSTM_HOST_RE.test(hostname)
}

export function isYstmSalePhpIngestibleUrl(url: URL): boolean {
  if (!/\/sale\.php$/i.test(url.pathname)) return false
  const id = url.searchParams.get('id')?.trim()
  const communitysale = url.searchParams.get('communitysale')?.trim()
  const spreadsheet = url.searchParams.get('spreadsheet')?.trim()
  if (communitysale) return true
  if (id && spreadsheet) return true
  if (id) return true
  return false
}

/** YSTM listing detail pages eligible for ingestion (list + detail + coverage). */
export function isYstmIngestibleListingUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false
  try {
    const u = new URL(sourceUrl.trim())
    if (!isYstmHost(u.hostname)) return false
    if (/\/(listing|userlisting)\.html$/i.test(u.pathname)) return true
    return isYstmSalePhpIngestibleUrl(u)
  } catch {
    return false
  }
}

/** YSTM detail listing pages eligible for mediaStr image enrichment (D2.5). */
export function isYstmDetailListingUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false
  try {
    const u = new URL(sourceUrl.trim())
    if (!isYstmHost(u.hostname)) return false
    return /\/(listing|userlisting)\.html$/i.test(u.pathname)
  } catch {
    return false
  }
}
