import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { normalizeSourcePages } from '@/lib/ingestion/adapters/externalPageSource'
import { deriveYardsaleTreasureMapCityPageUrl } from '@/lib/ingestion/ensureCityConfigFromListingSource'
import {
  normalizeIngestionCity,
  normalizeIngestionState,
} from '@/lib/ingestion/normalizeIngestionLocation'
import type { YstmDiscoveryValidatedCandidate } from '@/lib/ingestion/discovery/ystmDiscovery'
import type { DiscoveryValidationResult } from '@/lib/ingestion/discovery/ystmDiscoveryValidator'
import { resolveTimezoneForIngestionState } from '@/lib/ingestion/discovery/stateTimezoneMap'
import { buildValidatedSourcePagesPatch } from '@/lib/ingestion/discovery/discoveryConfigPatches'
import { SOURCE_DISCOVERY_STATUS, type SourceDiscoveryStatus } from '@/lib/ingestion/discovery/sourceDiscoveryStatus'
import {
  emitDiscoveryPromotionCompleted,
  hashDiscoveryUrl,
  type DiscoveryPromotionTelemetry,
} from '@/lib/ingestion/discovery/ystmDiscoveryTelemetry'
import { logger } from '@/lib/log'

const EXTERNAL_PAGE_SOURCE = 'external_page_source'

type AdminDb = ReturnType<typeof getAdminDb>

export type IngestionCityConfigDiscoveryRow = {
  id: string
  city: string
  state: string
  timezone: string
  enabled: boolean
  source_platform: string
  source_pages: unknown
  source_discovery_status: SourceDiscoveryStatus
  source_last_discovered_at: string | null
  source_last_validated_at: string | null
  source_last_failed_at: string | null
  source_discovery_failure_reason: string | null
  source_discovery_failure_count?: number
  source_crawl_excluded_at?: string | null
}

export type PromotedConfigRecord = {
  city: string
  state: string
  action: 'inserted' | 'updated' | 'skipped'
  reason?: string
  sharedHubPage: boolean
  canonicalUrlHash: string
}

export type PromoteYstmDiscoveryResultsArgs = {
  candidates: YstmDiscoveryValidatedCandidate[]
  dryRun?: boolean
  telemetryContext?: Record<string, unknown>
}

export type PromoteYstmDiscoveryResultsResult = {
  ok: boolean
  dryRun: boolean
  records: PromotedConfigRecord[]
  telemetry: DiscoveryPromotionTelemetry
  error?: string
}

function isPromotableValidation(
  validation: DiscoveryValidationResult
): validation is { ok: true; kind: 'valid_city_page' | 'valid_empty_city_page' } {
  return (
    validation.ok === true &&
    (validation.kind === 'valid_city_page' || validation.kind === 'valid_empty_city_page')
  )
}

function configScopeKey(city: string, state: string): string {
  return `${state}|${city}`.toLowerCase()
}

export function isMalformedIngestionCityName(city: string): boolean {
  if (/\.html/i.test(city)) return true
  const normalized = normalizeIngestionCity(city)
  if (!normalized) return true
  return city.trim() !== normalized
}

export function normalizedPromotionCityState(candidate: YstmDiscoveryValidatedCandidate): {
  city: string
  state: string
} | null {
  const city = normalizeIngestionCity(candidate.city)
  const state = normalizeIngestionState(candidate.state)
  if (!city || !state) return null
  return { city, state }
}

function isManualProtectedRow(row: IngestionCityConfigDiscoveryRow): boolean {
  return row.source_discovery_status === SOURCE_DISCOVERY_STATUS.manual
}

function hasCrawlableSourcePages(row: IngestionCityConfigDiscoveryRow): boolean {
  return normalizeSourcePages(row.source_pages).length > 0
}

function resolvePromotionTimezone(
  existing: IngestionCityConfigDiscoveryRow | null,
  stateCode: string
): string | null {
  if (existing?.timezone?.trim()) {
    return existing.timezone.trim()
  }
  return resolveTimezoneForIngestionState(stateCode)
}

function buildValidatedPromotionPatch(now: string, canonicalUrl: string) {
  return buildValidatedSourcePagesPatch(now, canonicalUrl)
}

function findExistingRow(
  byScope: Map<string, IngestionCityConfigDiscoveryRow>,
  byMalformedScope: Map<string, IngestionCityConfigDiscoveryRow>,
  city: string,
  state: string
): IngestionCityConfigDiscoveryRow | null {
  const exact = byScope.get(configScopeKey(city, state))
  if (exact) return exact
  return byMalformedScope.get(configScopeKey(city, state)) ?? null
}

/**
 * Promotes validated YSTM discovery candidates into `ingestion_city_configs`.
 * Never overwrites `manual` rows. Never disables configs. Fail closed on timezone gaps.
 */
export async function promoteYstmDiscoveryResults(
  admin: AdminDb,
  args: PromoteYstmDiscoveryResultsArgs
): Promise<PromoteYstmDiscoveryResultsResult> {
  const dryRun = args.dryRun === true
  const telemetry: DiscoveryPromotionTelemetry = {
    configsPromoted: 0,
    configsRepaired: 0,
    malformedCityNamesNormalized: 0,
    validationsFailed: 0,
    manualConfigsSkipped: 0,
    sharedHubMappingsCreated: 0,
    timezoneUnresolved: 0,
    inserts: 0,
    updates: 0,
    skipped: 0,
  }
  const records: PromotedConfigRecord[] = []
  const now = new Date().toISOString()

  const statesNeeded = new Set<string>()
  for (const candidate of args.candidates) {
    const loc = normalizedPromotionCityState(candidate)
    if (loc) statesNeeded.add(loc.state)
  }

  const { data: existingRows, error: loadError } = await fromBase(admin, 'ingestion_city_configs')
    .select(
      'id, city, state, timezone, enabled, source_platform, source_pages, source_discovery_status, source_last_discovered_at, source_last_validated_at, source_last_failed_at, source_discovery_failure_reason'
    )
    .eq('source_platform', EXTERNAL_PAGE_SOURCE)
    .in('state', statesNeeded.size > 0 ? [...statesNeeded] : ['__none__'])

  if (loadError) {
    return {
      ok: false,
      dryRun,
      records,
      telemetry,
      error: loadError.message,
    }
  }

  const byScope = new Map<string, IngestionCityConfigDiscoveryRow>()
  const byMalformedScope = new Map<string, IngestionCityConfigDiscoveryRow>()

  for (const row of (existingRows ?? []) as IngestionCityConfigDiscoveryRow[]) {
    byScope.set(configScopeKey(row.city, row.state), row)
    if (isMalformedIngestionCityName(row.city)) {
      const normalized = normalizeIngestionCity(row.city)
      if (normalized) {
        byMalformedScope.set(configScopeKey(normalized, row.state), row)
      }
    }
  }

  for (const candidate of args.candidates) {
    const urlHash = hashDiscoveryUrl(candidate.canonicalUrl)
    const loc = normalizedPromotionCityState(candidate)
    if (!loc) {
      telemetry.validationsFailed += 1
      records.push({
        city: candidate.city,
        state: candidate.state,
        action: 'skipped',
        reason: 'invalid_city_or_state',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      telemetry.skipped += 1
      continue
    }

    if (!isPromotableValidation(candidate.validation)) {
      telemetry.validationsFailed += 1
      records.push({
        city: loc.city,
        state: loc.state,
        action: 'skipped',
        reason: 'validation_not_promotable',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      telemetry.skipped += 1
      continue
    }

    const canonical = deriveYardsaleTreasureMapCityPageUrl(candidate.canonicalUrl)
    if (!canonical || canonical !== candidate.canonicalUrl.replace(/\/$/, '')) {
      telemetry.validationsFailed += 1
      records.push({
        city: loc.city,
        state: loc.state,
        action: 'skipped',
        reason: 'non_canonical_url',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      telemetry.skipped += 1
      continue
    }

    const existing = findExistingRow(byScope, byMalformedScope, loc.city, loc.state)

    if (existing && isManualProtectedRow(existing)) {
      telemetry.manualConfigsSkipped += 1
      records.push({
        city: loc.city,
        state: loc.state,
        action: 'skipped',
        reason: 'manual_protected',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      telemetry.skipped += 1
      continue
    }

    const timezone = resolvePromotionTimezone(existing, loc.state)
    if (!timezone) {
      telemetry.timezoneUnresolved += 1
      records.push({
        city: loc.city,
        state: loc.state,
        action: 'skipped',
        reason: 'timezone_unresolved',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      telemetry.skipped += 1
      continue
    }

    const patch = buildValidatedPromotionPatch(now, canonical)
    const needsCityNormalize =
      existing != null && isMalformedIngestionCityName(existing.city) && existing.city !== loc.city
    const needsUrlRepair =
      existing != null &&
      hasCrawlableSourcePages(existing) === false &&
      (Array.isArray(existing.source_pages) ? existing.source_pages.length > 0 : false)
    const needsPopulate =
      existing == null ||
      !hasCrawlableSourcePages(existing) ||
      normalizeSourcePages(existing.source_pages)[0] !== canonical

    if (existing && !needsPopulate && !needsCityNormalize) {
      records.push({
        city: loc.city,
        state: loc.state,
        action: 'skipped',
        reason: 'already_current',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      telemetry.skipped += 1
      continue
    }

    if (dryRun) {
      if (existing) {
        telemetry.updates += 1
        if (needsUrlRepair) telemetry.configsRepaired += 1
        else telemetry.configsPromoted += 1
        if (needsCityNormalize) telemetry.malformedCityNamesNormalized += 1
      } else {
        telemetry.inserts += 1
        telemetry.configsPromoted += 1
      }
      if (candidate.sharedHubPage) telemetry.sharedHubMappingsCreated += 1
      records.push({
        city: loc.city,
        state: loc.state,
        action: existing ? 'updated' : 'inserted',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      continue
    }

    try {
      if (existing) {
        const updatePayload: Record<string, unknown> = {
          ...patch,
          timezone,
        }
        if (needsCityNormalize) {
          updatePayload.city = loc.city
          telemetry.malformedCityNamesNormalized += 1
        }
        const { error: updateError } = await fromBase(admin, 'ingestion_city_configs')
          .update(updatePayload)
          .eq('id', existing.id)

        if (updateError) {
          throw new Error(updateError.message)
        }

        const updatedRow: IngestionCityConfigDiscoveryRow = {
          ...existing,
          ...patch,
          city: needsCityNormalize ? loc.city : existing.city,
          timezone,
        }
        byScope.delete(configScopeKey(existing.city, existing.state))
        byScope.set(configScopeKey(updatedRow.city, updatedRow.state), updatedRow)
        if (needsCityNormalize) {
          byMalformedScope.delete(configScopeKey(loc.city, loc.state))
        }

        telemetry.updates += 1
        if (needsUrlRepair) telemetry.configsRepaired += 1
        else telemetry.configsPromoted += 1
        records.push({
          city: loc.city,
          state: loc.state,
          action: 'updated',
          sharedHubPage: candidate.sharedHubPage,
          canonicalUrlHash: urlHash,
        })
      } else {
        const { error: insertError } = await fromBase(admin, 'ingestion_city_configs').insert({
          city: loc.city,
          state: loc.state,
          timezone,
          enabled: true,
          source_platform: EXTERNAL_PAGE_SOURCE,
          ...patch,
        })

        if (insertError) {
          if (insertError.code === '23505') {
            telemetry.skipped += 1
            records.push({
              city: loc.city,
              state: loc.state,
              action: 'skipped',
              reason: 'unique_conflict',
              sharedHubPage: candidate.sharedHubPage,
              canonicalUrlHash: urlHash,
            })
            continue
          }
          throw new Error(insertError.message)
        }

        const inserted: IngestionCityConfigDiscoveryRow = {
          id: 'inserted',
          city: loc.city,
          state: loc.state,
          timezone,
          enabled: true,
          source_platform: EXTERNAL_PAGE_SOURCE,
          source_pages: patch.source_pages,
          source_discovery_status: SOURCE_DISCOVERY_STATUS.validated,
          source_last_discovered_at: now,
          source_last_validated_at: now,
          source_last_failed_at: null,
          source_discovery_failure_reason: null,
        }
        byScope.set(configScopeKey(loc.city, loc.state), inserted)
        telemetry.inserts += 1
        telemetry.configsPromoted += 1
        records.push({
          city: loc.city,
          state: loc.state,
          action: 'inserted',
          sharedHubPage: candidate.sharedHubPage,
          canonicalUrlHash: urlHash,
        })
      }

      if (candidate.sharedHubPage) {
        telemetry.sharedHubMappingsCreated += 1
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.warn('ystm discovery promotion row failed', {
        component: 'ingestion/discovery/promoteYstmDiscoveryResults',
        operation: 'promote_row',
        city: loc.city,
        state: loc.state,
        message,
        canonicalUrlHash: urlHash,
        ...args.telemetryContext,
      })
      records.push({
        city: loc.city,
        state: loc.state,
        action: 'skipped',
        reason: 'promotion_error',
        sharedHubPage: candidate.sharedHubPage,
        canonicalUrlHash: urlHash,
      })
      telemetry.skipped += 1
    }
  }

  emitDiscoveryPromotionCompleted(telemetry, { dryRun, ...args.telemetryContext })

  return {
    ok: true,
    dryRun,
    records,
    telemetry,
  }
}
