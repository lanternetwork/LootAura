import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function addressAlreadyContainsCityState(address: string, city: string, state: string): boolean {
  const addressNorm = normalizeWhitespace(address)
  const cityNorm = normalizeWhitespace(city)
  const stateNorm = normalizeWhitespace(state)
  if (!addressNorm || !cityNorm || !stateNorm) return false

  const cityEsc = escapeRegExp(cityNorm)
  const stateEsc = escapeRegExp(stateNorm)
  const optionalZip = '(?:\\s+\\d{5}(?:-\\d{4})?)?'
  const fullPattern = new RegExp(`${cityEsc}\\s*,\\s*${stateEsc}${optionalZip}`, 'i')
  return fullPattern.test(addressNorm)
}

export function displayAddress(address?: string | null, city?: string | null, state?: string | null): string {
  const base = normalizeWhitespace(address || '')
  const cityNorm = normalizeWhitespace(city || '')
  const stateNorm = normalizeWhitespace(state || '')
  const cityState = [cityNorm, stateNorm].filter(Boolean).join(', ')

  if (!base) {
    return cityState ? formatAddressForPublishedSaleDisplay(cityState) : ''
  }
  if (!cityState) {
    return formatAddressForPublishedSaleDisplay(base)
  }
  if (addressAlreadyContainsCityState(base, cityNorm, stateNorm)) {
    return formatAddressForPublishedSaleDisplay(base)
  }
  return formatAddressForPublishedSaleDisplay(`${base}, ${cityState}`)
}

