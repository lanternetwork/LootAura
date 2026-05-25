/** HTTPS host helpers for EstateSales.NET list/detail/image URLs. */

export const ESNET_LIST_HOSTS = new Set(['estatesales.net', 'www.estatesales.net'])

export const ESNET_IMAGE_HOSTS = new Set([
  'picturescdn.estatesales.net',
  'images.estatesales.net',
])

export function isEstatesalesNetListHost(hostname: string): boolean {
  return ESNET_LIST_HOSTS.has(hostname.trim().toLowerCase())
}

export function isEstatesalesNetImageHost(hostname: string): boolean {
  return ESNET_IMAGE_HOSTS.has(hostname.trim().toLowerCase())
}

export function isEstatesalesNetSourceUrl(sourceUrl: string | null | undefined): boolean {
  if (!sourceUrl?.trim()) return false
  try {
    return isEstatesalesNetListHost(new URL(sourceUrl.trim()).hostname)
  } catch {
    return false
  }
}

export function isEstatesalesNetIngestionConfig(
  sourcePlatform: string | null | undefined,
  pageUrl?: string | null
): boolean {
  if (sourcePlatform === 'estatesales_net') return true
  if (pageUrl?.trim() && isEstatesalesNetSourceUrl(pageUrl)) return true
  return false
}

/**
 * Canonical public detail URL from list-row fields.
 * City segment uses ES.net slug casing from metro page path when available.
 */
export function buildEsnetCanonicalDetailUrl(input: {
  stateCode: string
  citySlug: string
  postalCode: string
  saleId: string | number
}): string {
  const state = input.stateCode.trim().toUpperCase()
  const city = input.citySlug.trim()
  const zip = String(input.postalCode).trim()
  const id = String(input.saleId).trim()
  return `https://www.estatesales.net/${state}/${city}/${zip}/${id}`
}
