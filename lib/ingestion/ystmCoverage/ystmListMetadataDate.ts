import { extractDateRangeFromText } from '@/lib/ingestion/saleWindowDates'

function epochSecondsToIsoDate(epoch: number): string | null {
  if (!Number.isFinite(epoch) || epoch <= 0) return null
  const ms = epoch > 1_000_000_000_000 ? epoch : epoch * 1000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** Parse YSTM metadataStr date fields into YYYY-MM-DD. */
export function parseYstmListMetadataDateValue(raw: unknown): string | null {
  if (typeof raw === 'number') return epochSecondsToIsoDate(raw)
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d{9,11}$/.test(trimmed)) {
    return epochSecondsToIsoDate(Number.parseInt(trimmed, 10))
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10)
  const extracted = extractDateRangeFromText(trimmed)
  return extracted.start ?? null
}
