import { mergeAddressEnrichmentDetails } from '@/lib/ingestion/address/addressEnrichmentFailureDetails'
import {
  ADDRESS_TERMINAL_ACTIVE_STATUS,
  ADDRESS_TERMINAL_ARCHIVED_STATUS,
  isLegacyUnavailableTerminalAddressStatus,
  parseTerminalArchiveCoolingDays,
  readTerminalEnteredAtMs,
} from '@/lib/ingestion/address/terminalAddressDisposition'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type ArchiveTerminalAddressDispositionSummary = {
  scanned: number
  archived: number
  skipped: number
}

const ACTIVE_TERMINAL_STATUSES = [ADDRESS_TERMINAL_ACTIVE_STATUS, 'address_unavailable_terminal'] as const

function isCoolingElapsed(
  failureDetails: unknown,
  updatedAt: string | null,
  nowMs: number,
  coolingDays: number
): boolean {
  const enteredMs = readTerminalEnteredAtMs(failureDetails)
  const anchorMs = enteredMs ?? (updatedAt ? Date.parse(updatedAt) : NaN)
  if (!Number.isFinite(anchorMs)) return false
  return nowMs - anchorMs >= coolingDays * 24 * 60 * 60 * 1000
}

/**
 * Move cooled terminal-active rows into `address_terminal_archived` (bounded batch).
 */
export async function archiveCooledTerminalAddressDisposition(options?: {
  batchSize?: number
  coolingDays?: number
  nowMs?: number
}): Promise<ArchiveTerminalAddressDispositionSummary> {
  const admin = getAdminDb()
  const batchSize = Math.min(Math.max(options?.batchSize ?? 500, 1), 1000)
  const coolingDays = options?.coolingDays ?? parseTerminalArchiveCoolingDays()
  const nowMs = options?.nowMs ?? Date.now()
  const summary: ArchiveTerminalAddressDispositionSummary = {
    scanned: 0,
    archived: 0,
    skipped: 0,
  }

  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, failure_details, updated_at, address_status')
    .in('address_status', [...ACTIVE_TERMINAL_STATUSES])
    .limit(batchSize)

  if (error) {
    throw new Error(error.message)
  }

  for (const row of data ?? []) {
    summary.scanned += 1
    const rowId = String(row.id)
    const failureDetails = (row as { failure_details?: unknown }).failure_details
    const updatedAt = (row as { updated_at?: string | null }).updated_at ?? null
    const addressStatus = (row as { address_status?: string | null }).address_status ?? null

    if (
      !isCoolingElapsed(failureDetails, updatedAt, nowMs, coolingDays) &&
      !isLegacyUnavailableTerminalAddressStatus(addressStatus)
    ) {
      summary.skipped += 1
      continue
    }

    const { data: updated, error: updateError } = await fromBase(admin, 'ingested_sales')
      .update({
        address_status: ADDRESS_TERMINAL_ARCHIVED_STATUS,
        failure_details: mergeAddressEnrichmentDetails(failureDetails, {
          archivedAt: new Date(nowMs).toISOString(),
        }),
      })
      .eq('id', rowId)
      .in('address_status', [...ACTIVE_TERMINAL_STATUSES])
      .select('id')
      .maybeSingle()

    if (updateError) {
      logger.error('Terminal address archive failed', new Error(updateError.message), {
        component: 'ingestion/address/archiveTerminalAddressDisposition',
        rowId,
      })
      summary.skipped += 1
      continue
    }

    if (updated?.id) {
      summary.archived += 1
    } else {
      summary.skipped += 1
    }
  }

  return summary
}
