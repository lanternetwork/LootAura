import type { AddressStatus } from '@/lib/ingestion/address/addressLifecycleTypes'

export const ADDRESS_TERMINAL_ACTIVE_STATUS = 'address_terminal_active' as const
export const ADDRESS_TERMINAL_ARCHIVED_STATUS = 'address_terminal_archived' as const
export const ADDRESS_LEGACY_UNAVAILABLE_TERMINAL_STATUS = 'address_unavailable_terminal' as const

export const TERMINAL_ADDRESS_DISPOSITION_STATUSES = [
  ADDRESS_TERMINAL_ACTIVE_STATUS,
  ADDRESS_TERMINAL_ARCHIVED_STATUS,
  ADDRESS_LEGACY_UNAVAILABLE_TERMINAL_STATUS,
] as const

export type TerminalAddressDispositionStatus = (typeof TERMINAL_ADDRESS_DISPOSITION_STATUSES)[number]

export const DEFAULT_TERMINAL_ARCHIVE_COOLING_DAYS = 7 as const

export function terminalActiveAddressStatusForEntry(): Extract<
  AddressStatus,
  typeof ADDRESS_TERMINAL_ACTIVE_STATUS
> {
  return ADDRESS_TERMINAL_ACTIVE_STATUS
}

export function isLegacyUnavailableTerminalAddressStatus(status: string | null | undefined): boolean {
  return status === ADDRESS_LEGACY_UNAVAILABLE_TERMINAL_STATUS
}

export function isActiveTerminalAddressStatus(status: string | null | undefined): boolean {
  return status === ADDRESS_TERMINAL_ACTIVE_STATUS || isLegacyUnavailableTerminalAddressStatus(status)
}

export function isArchivedTerminalAddressStatus(status: string | null | undefined): boolean {
  return status === ADDRESS_TERMINAL_ARCHIVED_STATUS
}

export function isTerminalAddressDisposition(status: string | null | undefined): boolean {
  return isActiveTerminalAddressStatus(status) || isArchivedTerminalAddressStatus(status)
}

/** Terminal disposition rows are excluded from bounded catalog-repair queue scans. */
export function isCatalogRepairExcludedTerminalAddressStatus(status: string | null | undefined): boolean {
  return isTerminalAddressDisposition(status)
}

export function readTerminalEnteredAtMs(failureDetails: unknown): number | null {
  if (!failureDetails || typeof failureDetails !== 'object' || Array.isArray(failureDetails)) {
    return null
  }
  const section = (failureDetails as Record<string, unknown>).address_enrichment
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return null
  }
  const enrichment = section as Record<string, unknown>
  const candidates = [enrichment.terminalEnteredAt, enrichment.recorded_at]
  for (const value of candidates) {
    if (typeof value !== 'string' || !value.trim()) continue
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return ms
  }
  return null
}

export function parseTerminalArchiveCoolingDays(): number {
  const raw = process.env.TERMINAL_ADDRESS_ARCHIVE_COOLING_DAYS
  const n = raw != null ? Number.parseInt(String(raw), 10) : DEFAULT_TERMINAL_ARCHIVE_COOLING_DAYS
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TERMINAL_ARCHIVE_COOLING_DAYS
  return Math.min(n, 90)
}
