/** YSTM detail listing pages eligible for mediaStr image enrichment (D2.5). */
export function isYstmDetailListingUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false
  try {
    const u = new URL(sourceUrl.trim())
    if (!/(?:^|\.)yardsaletreasuremap\.(?:com|net|org)$/i.test(u.hostname)) return false
    return /\/(listing|userlisting)\.html$/i.test(u.pathname)
  } catch {
    return false
  }
}
