import { deriveYardsaleTreasureMapCityPageUrl } from '@/lib/ingestion/ensureCityConfigFromListingSource'
import { normalizeIngestionCity } from '@/lib/ingestion/normalizeIngestionLocation'

/**
 * True for `/US/{State}/{State}.html` shells (no city list), not `/US/{State}/{City}.html`.
 */
export function isYstmStateShellCityPageUrl(pageUrl: string): boolean {
  const canonical = deriveYardsaleTreasureMapCityPageUrl(pageUrl)
  if (!canonical) return false
  let u: URL
  try {
    u = new URL(canonical)
  } catch {
    return false
  }
  const parts = u.pathname.split('/').filter(Boolean)
  if (parts.length !== 3 || parts[0] !== 'US') return false
  const stateSeg = parts[1] ?? ''
  const cityFile = parts[2] ?? ''
  if (!/\.html?$/i.test(cityFile)) return false
  const citySlug = cityFile.replace(/\.html?$/i, '')
  const cityNorm = normalizeIngestionCity(citySlug)
  const stateNorm = normalizeIngestionCity(stateSeg)
  if (!cityNorm || !stateNorm) return false
  return cityNorm.toLowerCase() === stateNorm.toLowerCase()
}
