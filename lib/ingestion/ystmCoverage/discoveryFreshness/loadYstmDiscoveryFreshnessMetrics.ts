import {
  classifyYstmConfigInventory,
  computeInventoryConcentrationThresholds,
  recommendYstmVelocityPool,
  summarizeYstmConfigInventoryClasses,
  velocityPoolWeight,
  type YstmConfigInventoryClass,
  type YstmConfigInventorySnapshot,
  type YstmVelocityPool,
} from '@/lib/ingestion/ystmCoverage/discoveryFreshness/classifyYstmConfigInventory'
import { buildYstmDiscoveryCapacityPlan } from '@/lib/ingestion/ystmCoverage/discoveryFreshness/computeYstmDiscoveryCapacityPlan'
import {
  isComparableYstmListingObservation,
  isDiscoveryLatencyProxyOnly,
} from '@/lib/ingestion/ystmCoverage/discoveryFreshness/comparableListing'
import {
  partitionCrawlableExternalCityConfigs,
  type ExternalCityConfigRow,
} from '@/lib/ingestion/partitionCrawlableExternalConfigs'
import { fetchCoverageBootstrapEnabled } from '@/lib/ingestion/ystmCoverage/coverageBootstrapNationwideMode'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmDiscoveryLatencyPercentiles = {
  p50: number | null
  p90: number | null
  p95: number | null
  sampleCount: number
}

export type YstmDiscoveryFreshnessMetrics = {
  generatedAt: string
  comparableListingCount: number
  measuredDiscoveryCount: number
  measuredPublishCount: number
  telemetryCompletenessPct: number | null
  proxyAppearancePct: number | null
  discoveryLatencyHours: YstmDiscoveryLatencyPercentiles
  publishLatencyHours: YstmDiscoveryLatencyPercentiles
  configInventoryByClass: Record<YstmConfigInventoryClass, number>
  velocityPoolCounts: Record<YstmVelocityPool, number>
  concentration: {
    configsFor50PctListings: number
    configsFor80PctListings: number
    configsFor95PctListings: number
    zeroYieldConfigCount: number
  }
  capacityPlan: ReturnType<typeof buildYstmDiscoveryCapacityPlan>
  crawlableConfigCount: number
}

type ObservationActivityRow = {
  config_key: string | null
  last_list_seen_at: string | null
  first_list_seen_at: string | null
  ystm_valid_active: boolean
  false_exclusion_primary_bucket: string | null
  ystm_invalid_reason: string | null
  appearance_source: string | null
  first_observed_at: string | null
  first_published_at: string | null
  ystm_listing_posted_at: string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function buildConfigKey(city: string, state: string): string {
  return `${state}|${city}`
}

function computePercentiles(values: number[]): YstmDiscoveryLatencyPercentiles {
  if (values.length === 0) {
    return { p50: null, p90: null, p95: null, sampleCount: 0 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const pick = (p: number): number => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
    return sorted[idx]!
  }
  return {
    p50: pick(0.5),
    p90: pick(0.9),
    p95: pick(0.95),
    sampleCount: sorted.length,
  }
}

function hoursBetween(startIso: string, endIso: string): number | null {
  const startMs = Date.parse(startIso)
  const endMs = Date.parse(endIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return (endMs - startMs) / (60 * 60 * 1000)
}

export function buildYstmConfigVelocityWeightByKey(params: {
  configSnapshots: readonly YstmConfigInventorySnapshot[]
}): Record<string, number> {
  const weights: Record<string, number> = {}
  for (const snap of params.configSnapshots) {
    const listingsPerDay = snap.listingsSeen30d / 30
    const pool = recommendYstmVelocityPool({
      inventoryClass: snap.inventoryClass,
      listingsPerDay,
    })
    weights[snap.configKey] = velocityPoolWeight(pool)
  }
  return weights
}

export function buildYstmConfigInventorySnapshots(params: {
  crawlableConfigs: readonly ExternalCityConfigRow[]
  activityByConfigKey: Map<
    string,
    { lastListingSeenAt: string | null; listingsSeen30d: number; listingsSeen90d: number }
  >
  nowMs?: number
}): YstmConfigInventorySnapshot[] {
  const nowMs = params.nowMs ?? Date.now()
  const snapshots: YstmConfigInventorySnapshot[] = []

  for (const config of params.crawlableConfigs) {
    const configKey = buildConfigKey(config.city ?? '', config.state ?? '')
    const activity = params.activityByConfigKey.get(configKey) ?? {
      lastListingSeenAt: null,
      listingsSeen30d: 0,
      listingsSeen90d: 0,
    }
    snapshots.push({
      configKey,
      inventoryClass: classifyYstmConfigInventory({
        lastListingSeenAt: activity.lastListingSeenAt,
        nowMs,
      }),
      lastListingSeenAt: activity.lastListingSeenAt,
      listingsSeen30d: activity.listingsSeen30d,
      listingsSeen90d: activity.listingsSeen90d,
    })
  }

  return snapshots
}

export async function loadYstmConfigVelocityWeightByKey(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<Record<string, number>> {
  const { snapshots } = await loadYstmConfigInventoryContext(admin, nowMs)
  return buildYstmConfigVelocityWeightByKey({ configSnapshots: snapshots })
}

export async function loadYstmConfigInventoryContext(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<{
  snapshots: YstmConfigInventorySnapshot[]
  crawlableConfigCount: number
}> {
  const { data: configData, error: configError } = await fromBase(admin, 'ingestion_city_configs')
    .select('id, city, state, source_platform, source_pages, source_crawl_excluded_at')
    .eq('enabled', true)
    .eq('source_platform', 'external_page_source')
  if (configError) throw new Error(configError.message)

  const partition = partitionCrawlableExternalCityConfigs((configData ?? []) as ExternalCityConfigRow[])
  const activityByConfigKey = await aggregateConfigListingActivity(admin, nowMs)
  const snapshots = buildYstmConfigInventorySnapshots({
    crawlableConfigs: partition.crawlable,
    activityByConfigKey,
    nowMs,
  })
  return { snapshots, crawlableConfigCount: partition.crawlable.length }
}

async function aggregateConfigListingActivity(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number
): Promise<
  Map<string, { lastListingSeenAt: string | null; listingsSeen30d: number; listingsSeen90d: number }>
> {
  const activity = new Map<
    string,
    { lastListingSeenAt: string | null; listingsSeen30d: number; listingsSeen90d: number }
  >()
  const pageSize = 1000
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select(
        'config_key, last_list_seen_at, first_list_seen_at, ystm_valid_active, false_exclusion_primary_bucket, ystm_invalid_reason, appearance_source, first_observed_at, first_published_at, ystm_listing_posted_at'
      )
      .not('config_key', 'is', null)
      .order('canonical_url', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = (data ?? []) as ObservationActivityRow[]
    for (const row of chunk) {
      if (!row.ystm_valid_active) continue
      const configKey = row.config_key?.trim()
      if (!configKey) continue

      const seenAt = row.last_list_seen_at ?? row.first_list_seen_at
      const seenMs = seenAt ? Date.parse(seenAt) : NaN
      const firstSeenMs = row.first_list_seen_at ? Date.parse(row.first_list_seen_at) : seenMs

      const entry = activity.get(configKey) ?? {
        lastListingSeenAt: null,
        listingsSeen30d: 0,
        listingsSeen90d: 0,
      }

      if (seenAt && Number.isFinite(seenMs)) {
        const existingMs = entry.lastListingSeenAt ? Date.parse(entry.lastListingSeenAt) : 0
        if (!entry.lastListingSeenAt || seenMs > existingMs) {
          entry.lastListingSeenAt = seenAt
        }
      }

      if (Number.isFinite(firstSeenMs)) {
        const ageDays = (nowMs - firstSeenMs) / MS_PER_DAY
        if (ageDays <= 30) entry.listingsSeen30d += 1
        if (ageDays <= 90) entry.listingsSeen90d += 1
      }

      activity.set(configKey, entry)
    }

    if (chunk.length < pageSize) break
    from += pageSize
  }

  return activity
}

export async function loadYstmDiscoveryFreshnessMetrics(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<YstmDiscoveryFreshnessMetrics> {
  const discoveryHours: number[] = []
  const publishHours: number[] = []
  let comparableListingCount = 0
  let measuredDiscoveryCount = 0
  let measuredPublishCount = 0
  let proxyAppearanceCount = 0
  let telemetryCompleteCount = 0

  const pageSize = 1000
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select(
        'config_key, last_list_seen_at, first_list_seen_at, ystm_valid_active, false_exclusion_primary_bucket, ystm_invalid_reason, appearance_source, first_observed_at, first_published_at, ystm_listing_posted_at'
      )
      .order('canonical_url', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)

    const chunk = (data ?? []) as ObservationActivityRow[]
    for (const row of chunk) {
      if (
        !isComparableYstmListingObservation({
          ystmValidActive: row.ystm_valid_active,
          falseExclusionPrimaryBucket: row.false_exclusion_primary_bucket,
          ystmInvalidReason: row.ystm_invalid_reason,
        })
      ) {
        continue
      }

      comparableListingCount += 1
      if (row.first_observed_at && (row.ystm_listing_posted_at || row.first_list_seen_at)) {
        telemetryCompleteCount += 1
      }
      if (isDiscoveryLatencyProxyOnly(row.appearance_source)) {
        proxyAppearanceCount += 1
      }

      const appearance = row.ystm_listing_posted_at ?? row.first_list_seen_at
      if (appearance && row.first_observed_at) {
        const hours = hoursBetween(appearance, row.first_observed_at)
        if (hours != null && hours >= 0) {
          discoveryHours.push(hours)
          measuredDiscoveryCount += 1
        }
      }

      if (appearance && row.first_published_at) {
        const hours = hoursBetween(appearance, row.first_published_at)
        if (hours != null && hours >= 0) {
          publishHours.push(hours)
          measuredPublishCount += 1
        }
      }
    }

    if (chunk.length < pageSize) break
    from += pageSize
  }

  const [{ snapshots, crawlableConfigCount }, bootstrapEnabled] = await Promise.all([
    loadYstmConfigInventoryContext(admin, nowMs),
    fetchCoverageBootstrapEnabled(admin),
  ])

  const configInventoryByClass = summarizeYstmConfigInventoryClasses(snapshots)
  const activeConfigCount = configInventoryByClass.ACTIVE + configInventoryByClass.LOW_ACTIVITY

  const velocityPoolCounts: Record<YstmVelocityPool, number> = { HOT: 0, WARM: 0, COLD: 0 }
  for (const snap of snapshots) {
    const pool = recommendYstmVelocityPool({
      inventoryClass: snap.inventoryClass,
      listingsPerDay: snap.listingsSeen30d / 30,
    })
    velocityPoolCounts[pool] += 1
  }

  const concentration = computeInventoryConcentrationThresholds(
    snapshots.map((snap) => ({
      configKey: snap.configKey,
      listingsPerWeek: (snap.listingsSeen30d / 30) * 7,
    }))
  )

  return {
    generatedAt: new Date(nowMs).toISOString(),
    comparableListingCount,
    measuredDiscoveryCount,
    measuredPublishCount,
    telemetryCompletenessPct:
      comparableListingCount > 0
        ? (telemetryCompleteCount / comparableListingCount) * 100
        : null,
    proxyAppearancePct:
      comparableListingCount > 0 ? (proxyAppearanceCount / comparableListingCount) * 100 : null,
    discoveryLatencyHours: computePercentiles(discoveryHours),
    publishLatencyHours: computePercentiles(publishHours),
    configInventoryByClass,
    velocityPoolCounts,
    concentration,
    capacityPlan: buildYstmDiscoveryCapacityPlan({
      activeConfigCount,
      bootstrapEnabled,
    }),
    crawlableConfigCount,
  }
}
