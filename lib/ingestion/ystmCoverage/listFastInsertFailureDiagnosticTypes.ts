import type { ListFastSnapshotCompletenessBucket } from '@/lib/admin/listFastFailureDistributionTypes'
import type { PostgresInsertMessageClass } from '@/lib/ingestion/acquisition/classifyPostgresInsertError'

export type ListFastInsertFailureDetail = {
  code: string | null
  messageClass: PostgresInsertMessageClass
  constraint: string | null
  saleInstanceKeyHash: string | null
  listMetadataHash: string | null
  snapshotCompleteness: ListFastSnapshotCompletenessBucket
  hasSnapshot: boolean
  hasNativeCoords: boolean
  hasDates: boolean
  hasAddress: boolean
  recordedAt: string
}

export type MissingIngestionFailureDetails = {
  list_fast_insert?: ListFastInsertFailureDetail
}

export function parseMissingIngestionFailureDetails(raw: unknown): MissingIngestionFailureDetails | null {
  if (raw == null || typeof raw !== 'object') return null
  return raw as MissingIngestionFailureDetails
}

export function parseListFastInsertFailureDetail(raw: unknown): ListFastInsertFailureDetail | null {
  const parsed = parseMissingIngestionFailureDetails(raw)
  const detail = parsed?.list_fast_insert
  if (!detail || typeof detail !== 'object') return null
  if (typeof detail.messageClass !== 'string') return null
  return detail as ListFastInsertFailureDetail
}
