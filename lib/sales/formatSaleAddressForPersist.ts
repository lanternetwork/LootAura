import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'

/**
 * Persists canonical display casing when the line passes publish-time address validation
 * with the given locality. On validation failure, returns a whitespace-normalized raw line
 * so user drafts are not rejected at the DB layer.
 */
export function formatSaleAddressForPersist(
  address: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined
): string | null {
  const raw = typeof address === 'string' ? address.replace(/\s+/g, ' ').trim() : ''
  if (!raw) return null
  const c = typeof city === 'string' ? city.replace(/\s+/g, ' ').trim() : ''
  const s = typeof state === 'string' ? state.replace(/\s+/g, ' ').trim() : ''
  if (!c || !s) return raw
  const normalized = normalizeAddressForPublish(raw, c, s)
  if (!normalized) return null
  try {
    validateResolvedAddressForPublish(normalized, c, s)
    return formatAddressForPublishedSaleDisplay(normalized)
  } catch {
    return raw
  }
}
