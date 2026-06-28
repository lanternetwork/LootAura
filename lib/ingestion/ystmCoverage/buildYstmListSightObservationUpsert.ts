import { classifyYstmListMetadataAsValidActive } from '@/lib/ingestion/ystmCoverage/classifyYstmListMetadataAsValidActive'
import { detectYstmRelistOnListSight } from '@/lib/ingestion/ystmCoverage/detectYstmRelistOnListSight'
import type { YstmCoverageObservationRelistRow } from '@/lib/ingestion/ystmCoverage/loadYstmCoverageObservationsForRelist'
import {
  hashYstmListMetadataSnapshot,
  type YstmListMetadataSale,
} from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'
import type { YstmCoverageFootprintMatchResult } from '@/lib/ingestion/ystmCoverage/matchYstmCoverageLootAuraFootprint'
import type {
  YstmCoverageObservationUpsert,
  YstmDiscoveryPriority,
} from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'

export type BuildYstmListSightObservationInput = {
  sale: YstmListMetadataSale
  city: string
  state: string
  configKey: string
  listSeenAt: string
  appearanceSource: string
  footprint: YstmCoverageFootprintMatchResult
  existing: YstmCoverageObservationRelistRow | null
  relistDetectedAt?: string
  hotDiscovery?: boolean
}

/**
 * Build observation upsert for list crawl, applying RELIST_DETECTION_V1 rules for prior expired rows.
 */
export function buildYstmListSightObservationUpsert(
  input: BuildYstmListSightObservationInput
): YstmCoverageObservationUpsert {
  const relist = detectYstmRelistOnListSight({
    existing: input.existing,
    incoming: input.sale,
  })

  const listMetadataHash = hashYstmListMetadataSnapshot(input.sale)
  const baseFootprint = {
    sourceListingId: input.footprint.sourceListingId,
    saleInstanceKey: input.footprint.saleInstanceKey,
    matchedIngestedSaleId: input.footprint.matchedIngestedSaleId,
    matchedSaleId: input.footprint.matchedSaleId,
    matchMethod: input.footprint.matchMethod,
    listMetadataSnapshot: input.sale,
    listMetadataHash,
    appearanceSource: input.appearanceSource,
    ystmListingPostedAt: input.sale.postedAt,
  }

  if (relist.isExpiredObservation) {
    const preservePendingRefresh =
      !relist.needsDetailRefresh && input.existing?.needsDetailRefresh === true
    const needsDetailRefresh = relist.needsDetailRefresh || preservePendingRefresh

    let discoveryPriority: YstmDiscoveryPriority | null = 'cold'
    if (needsDetailRefresh) {
      discoveryPriority =
        relist.needsDetailRefresh && input.hotDiscovery ? 'hot' : 'warm'
    }

    return {
      canonicalUrl: input.sale.canonicalUrl,
      state: input.state,
      city: input.city,
      configKey: input.configKey,
      ystmValidActive: false,
      ystmInvalidReason: 'expired',
      lootauraVisible: input.footprint.lootauraVisible,
      listSeenAt: input.listSeenAt,
      detailCheckedAt: relist.preserveDetailCheckedAt,
      needsDetailRefresh,
      relistDetectedAt: relist.needsDetailRefresh
        ? (input.relistDetectedAt ?? input.listSeenAt)
        : preservePendingRefresh
          ? (input.existing?.relistDetectedAt ?? null)
          : null,
      relistReason: relist.relistReason ?? (preservePendingRefresh ? input.existing?.relistReason ?? null : null),
      relistPreviousStartDate: relist.previousStartDate,
      relistPreviousEndDate: relist.previousEndDate,
      relistCurrentStartDate: relist.currentStartDate,
      relistCurrentEndDate: relist.currentEndDate,
      discoveryPriority,
      ...baseFootprint,
    }
  }

  const validity = classifyYstmListMetadataAsValidActive(input.sale)
  const validActive = validity.valid
  const hot =
    validActive && !input.footprint.lootauraVisible && input.hotDiscovery === true

  return {
    canonicalUrl: input.sale.canonicalUrl,
    state: input.state,
    city: input.city,
    configKey: input.configKey,
    ystmValidActive: validActive,
    ystmInvalidReason: validActive ? null : validity.reason,
    lootauraVisible: input.footprint.lootauraVisible,
    listSeenAt: input.listSeenAt,
    detailCheckedAt: null,
    needsDetailRefresh: false,
    relistDetectedAt: null,
    relistReason: null,
    relistPreviousStartDate: null,
    relistPreviousEndDate: null,
    relistCurrentStartDate: null,
    relistCurrentEndDate: null,
    discoveryPriority: hot ? 'hot' : validActive ? 'warm' : null,
    ...baseFootprint,
  }
}

export type BuildYstmAuditUrlListUpsertInput = {
  canonicalUrl: string
  city: string
  state: string
  configKey: string
  listSeenAt: string
  footprint: YstmCoverageFootprintMatchResult
  existing: YstmCoverageObservationRelistRow | null
}

/** Coverage audit list extract without metadataStr — preserve expired detail state on re-sight. */
export function buildYstmAuditUrlListUpsert(
  input: BuildYstmAuditUrlListUpsertInput
): YstmCoverageObservationUpsert {
  const footprintFields = {
    sourceListingId: input.footprint.sourceListingId,
    saleInstanceKey: input.footprint.saleInstanceKey,
    matchedIngestedSaleId: input.footprint.matchedIngestedSaleId,
    matchedSaleId: input.footprint.matchedSaleId,
    matchMethod: input.footprint.matchMethod,
  }

  if (input.existing?.ystmInvalidReason === 'expired') {
    return {
      canonicalUrl: input.canonicalUrl,
      state: input.state,
      city: input.city,
      configKey: input.configKey,
      ystmValidActive: false,
      ystmInvalidReason: 'expired',
      lootauraVisible: input.footprint.lootauraVisible,
      listSeenAt: input.listSeenAt,
      detailCheckedAt: input.existing.lastDetailCheckedAt,
      needsDetailRefresh: input.existing.needsDetailRefresh,
      relistDetectedAt: input.existing.relistDetectedAt ?? null,
      relistReason: input.existing.relistReason ?? null,
      relistPreviousStartDate: input.existing.relistPreviousStartDate ?? null,
      relistPreviousEndDate: input.existing.relistPreviousEndDate ?? null,
      relistCurrentStartDate: input.existing.relistCurrentStartDate ?? null,
      relistCurrentEndDate: input.existing.relistCurrentEndDate ?? null,
      discoveryPriority: input.existing.needsDetailRefresh ? 'warm' : 'cold',
      appearanceSource: 'coverage_audit',
      ...footprintFields,
    }
  }

  return {
    canonicalUrl: input.canonicalUrl,
    state: input.state,
    city: input.city,
    configKey: input.configKey,
    ystmValidActive: false,
    ystmInvalidReason: null,
    lootauraVisible: input.footprint.lootauraVisible,
    listSeenAt: input.listSeenAt,
    detailCheckedAt: null,
    needsDetailRefresh: false,
    relistDetectedAt: null,
    relistReason: null,
    relistPreviousStartDate: null,
    relistPreviousEndDate: null,
    relistCurrentStartDate: null,
    relistCurrentEndDate: null,
    discoveryPriority: null,
    appearanceSource: 'coverage_audit',
    ...footprintFields,
  }
}
