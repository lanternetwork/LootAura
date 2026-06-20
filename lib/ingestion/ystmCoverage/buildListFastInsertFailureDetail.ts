import {
  classifyListFastSnapshotCompleteness,
} from '@/lib/admin/classifyListFastSnapshotForAudit'
import type { ListFastSnapshotCompletenessBucket } from '@/lib/admin/listFastFailureDistributionTypes'
import {
  classifyPostgresInsertError,
  hashDiagnosticValue,
  type PostgresInsertErrorLike,
} from '@/lib/ingestion/acquisition/classifyPostgresInsertError'
import { coerceIngestedDateToYyyyMmDd } from '@/lib/ingestion/saleWindowDates'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import { hashYstmListMetadataSnapshot } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import type {
  ListFastInsertFailureDetail,
  MissingIngestionFailureDetails,
} from '@/lib/ingestion/ystmCoverage/listFastInsertFailureDiagnosticTypes'

function snapshotFlags(sale: YstmListMetadataSale) {
  const hasNativeCoords =
    sale.lat != null &&
    sale.lng != null &&
    Number.isFinite(sale.lat) &&
    Number.isFinite(sale.lng)
  const hasDates =
    Boolean(coerceIngestedDateToYyyyMmDd(sale.startDate)) ||
    Boolean(coerceIngestedDateToYyyyMmDd(sale.endDate))
  const hasAddress = Boolean(sale.address?.trim())
  return { hasNativeCoords, hasDates, hasAddress }
}

export function buildListFastInsertFailureDetail(input: {
  sale: YstmListMetadataSale
  ingestRow: Record<string, unknown>
  insertError: PostgresInsertErrorLike
  insertReturnedRow: boolean
  collisionResolutionAttempted: boolean
  collisionResolutionSucceeded: boolean
  snapshotCompleteness: ListFastSnapshotCompletenessBucket
  recordedAt?: string
}): MissingIngestionFailureDetails {
  const classification = classifyPostgresInsertError({
    error: input.insertError,
    insertReturnedRow: input.insertReturnedRow,
    collisionResolutionAttempted: input.collisionResolutionAttempted,
    collisionResolutionSucceeded: input.collisionResolutionSucceeded,
  })
  const flags = snapshotFlags(input.sale)
  const saleInstanceKey =
    typeof input.ingestRow.sale_instance_key === 'string' ? input.ingestRow.sale_instance_key : null
  const detail: ListFastInsertFailureDetail = {
    code: classification.code,
    messageClass: classification.messageClass,
    constraint: classification.constraint,
    saleInstanceKeyHash: hashDiagnosticValue(saleInstanceKey),
    listMetadataHash: hashYstmListMetadataSnapshot(input.sale),
    snapshotCompleteness: input.snapshotCompleteness,
    hasSnapshot: true,
    hasNativeCoords: flags.hasNativeCoords,
    hasDates: flags.hasDates,
    hasAddress: flags.hasAddress,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  }

  return { list_fast_insert: detail }
}

export function buildListFastInsertFailureLogFields(detail: MissingIngestionFailureDetails): Record<string, unknown> {
  const row = detail.list_fast_insert
  if (!row) return {}
  return {
    canonicalUrlHash: null,
    messageClass: row.messageClass,
    code: row.code,
    constraint: row.constraint,
    saleInstanceKeyHash: row.saleInstanceKeyHash,
    listMetadataHash: row.listMetadataHash,
    snapshotCompleteness: row.snapshotCompleteness,
  }
}

export function buildListFastInsertFailureLogFieldsWithUrl(
  canonicalUrl: string,
  detail: MissingIngestionFailureDetails
): Record<string, unknown> {
  return {
    ...buildListFastInsertFailureLogFields(detail),
    canonicalUrlHash: hashDiagnosticValue(canonicalUrl),
  }
}

export function deriveListFastSnapshotCompleteness(sale: YstmListMetadataSale): ListFastSnapshotCompletenessBucket {
  return classifyListFastSnapshotCompleteness(sale)
}
