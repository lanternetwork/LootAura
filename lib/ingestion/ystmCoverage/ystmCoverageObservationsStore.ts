import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import type { YstmCoverageInvalidReason } from '@/lib/ingestion/ystmCoverage/ystmCoverageValidity'

export type YstmCoverageObservationUpsert = {
  canonicalUrl: string
  state: string
  city: string
  configKey: string
  ystmValidActive: boolean
  ystmInvalidReason: YstmCoverageInvalidReason | null
  lootauraVisible: boolean
  listSeenAt: string
  detailCheckedAt: string | null
}

export async function upsertYstmCoverageObservations(
  admin: ReturnType<typeof getAdminDb>,
  rows: YstmCoverageObservationUpsert[]
): Promise<void> {
  if (rows.length === 0) return
  const now = new Date().toISOString()
  const payload = rows.map((r) => ({
    canonical_url: r.canonicalUrl,
    state: r.state,
    city: r.city,
    config_key: r.configKey,
    ystm_valid_active: r.ystmValidActive,
    ystm_invalid_reason: r.ystmInvalidReason,
    lootaura_visible: r.lootauraVisible,
    last_list_seen_at: r.listSeenAt,
    last_detail_checked_at: r.detailCheckedAt,
    updated_at: now,
  }))

  const chunkSize = 200
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize)
    const { error } = await fromBase(admin, 'ystm_coverage_observations').upsert(slice, {
      onConflict: 'canonical_url',
    })
    if (error) {
      throw new Error(error.message)
    }
  }
}

export type YstmCoverageObservationAggregate = {
  validActiveYstmUrls: number
  publishedVisibleInAudit: number
  missingValidYstmUrls: number
  missingByState: Record<string, number>
  missingByMetro: Record<string, number>
  observationCount: number
}

export async function aggregateYstmCoverageObservations(
  admin: ReturnType<typeof getAdminDb>
): Promise<YstmCoverageObservationAggregate> {
  const pageSize = 1000
  let from = 0
  let validActiveYstmUrls = 0
  let publishedVisibleInAudit = 0
  let observationCount = 0
  const missingByState: Record<string, number> = {}
  const missingByMetro: Record<string, number> = {}

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('ystm_valid_active, lootaura_visible, state, city')
      .order('canonical_url', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    const chunk = (data ?? []) as Array<{
      ystm_valid_active: boolean
      lootaura_visible: boolean
      state: string | null
      city: string | null
    }>
    for (const row of chunk) {
      observationCount += 1
      if (!row.ystm_valid_active) continue
      validActiveYstmUrls += 1
      if (row.lootaura_visible) {
        publishedVisibleInAudit += 1
        continue
      }
      const st = (row.state ?? 'unknown').trim() || 'unknown'
      missingByState[st] = (missingByState[st] ?? 0) + 1
      const metro = `${(row.city ?? 'unknown').trim() || 'unknown'}, ${st}`
      missingByMetro[metro] = (missingByMetro[metro] ?? 0) + 1
    }
    if (chunk.length < pageSize) break
    from += pageSize
  }

  return {
    validActiveYstmUrls,
    publishedVisibleInAudit,
    missingValidYstmUrls: validActiveYstmUrls - publishedVisibleInAudit,
    missingByState,
    missingByMetro,
    observationCount,
  }
}
