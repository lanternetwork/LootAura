/** Pure helpers for expired ingested row detection (no dedupe / DB imports). */

export function failureReasonList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((r): r is string => typeof r === 'string')
}

export function isIngestedRowExpiredForDuplicate(
  status: string | null | undefined,
  failureReasons: unknown
): boolean {
  if (status === 'expired') return true
  return failureReasonList(failureReasons).includes('sale_expired')
}
