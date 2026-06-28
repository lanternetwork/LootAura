import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { YstmObservationRelistState } from '@/lib/ingestion/ystmCoverage/detectYstmRelistOnListSight'
import type { YstmListMetadataSale } from '@/lib/ingestion/ystmCoverage/extractYstmListMetadataSales'

export type YstmCoverageObservationRelistRow = YstmObservationRelistState & {
  canonicalUrl: string
  needsDetailRefresh: boolean
}

const SELECT =
  'canonical_url, ystm_invalid_reason, last_detail_checked_at, list_metadata_snapshot, relist_previous_start_date, relist_previous_end_date, relist_current_start_date, relist_current_end_date, needs_detail_refresh'

function mapRow(row: {
  canonical_url: string
  ystm_invalid_reason: string | null
  last_detail_checked_at: string | null
  list_metadata_snapshot: YstmListMetadataSale | null
  relist_previous_start_date: string | null
  relist_previous_end_date: string | null
  relist_current_start_date: string | null
  relist_current_end_date: string | null
  needs_detail_refresh: boolean
}): YstmCoverageObservationRelistRow {
  return {
    canonicalUrl: row.canonical_url,
    ystmInvalidReason: row.ystm_invalid_reason,
    lastDetailCheckedAt: row.last_detail_checked_at,
    listMetadataSnapshot: row.list_metadata_snapshot,
    relistPreviousStartDate: row.relist_previous_start_date,
    relistPreviousEndDate: row.relist_previous_end_date,
    relistCurrentStartDate: row.relist_current_start_date,
    relistCurrentEndDate: row.relist_current_end_date,
    needsDetailRefresh: row.needs_detail_refresh === true,
  }
}

export async function loadYstmCoverageObservationsForRelist(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrls: string[]
): Promise<Map<string, YstmCoverageObservationRelistRow>> {
  const map = new Map<string, YstmCoverageObservationRelistRow>()
  if (canonicalUrls.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < canonicalUrls.length; i += chunkSize) {
    const chunk = canonicalUrls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select(SELECT)
      .in('canonical_url', chunk)
    if (error) {
      throw new Error(error.message)
    }
    for (const row of (data ?? []) as Array<Parameters<typeof mapRow>[0]>) {
      map.set(row.canonical_url, mapRow(row))
    }
  }

  return map
}

export async function fetchYstmRelistDetailRefreshCandidates(
  admin: ReturnType<typeof getAdminDb>,
  limit: number
): Promise<
  Array<{
    canonicalUrl: string
    city: string | null
    state: string | null
    configKey: string | null
  }>
> {
  const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
    .select('canonical_url, city, state, config_key')
    .eq('needs_detail_refresh', true)
    .order('relist_detected_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) {
    throw new Error(error.message)
  }
  return (data ?? []).map((row) => ({
    canonicalUrl: String(row.canonical_url),
    city: row.city as string | null,
    state: row.state as string | null,
    configKey: row.config_key as string | null,
  }))
}
