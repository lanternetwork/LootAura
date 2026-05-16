/**
 * Auto-provisions `ingestion_city_configs` for validated localities when the manual
 * upload path has no enabled row yet. `source_pages` is intentionally `[]` — optional
 * crawl hints only; community-sale listings do not require a YSTM city list URL.
 *
 * Uses `INSERT … ON CONFLICT DO NOTHING` (PostgREST `ignoreDuplicates: true`) for
 * concurrency-safe idempotency on `(city, state, source_platform)`.
 */

import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { normalizeIngestionCity, normalizeIngestionState } from '@/lib/ingestion/normalizeIngestionLocation'
import {
  evaluateTrustedLocalityAuthorityForIngestionCityConfig,
  type IngestionCityConfigLocalityAuthoritySource,
} from '@/lib/ingestion/trustedLocalityAuthorityForIngestionCityConfig'
import { extractZip5ForIngestionContext } from '@/lib/ingestion/extractZip5ForIngestion'
import {
  resolveIanaTimezoneForIngestionZip5,
  type IngestionZipCoordinateSource,
} from '@/lib/ingestion/resolveIanaTimezoneForIngestionZip5'
import { logger } from '@/lib/log'

type AdminDb = ReturnType<typeof getAdminDb>

const EXTERNAL_PAGE_SOURCE = 'external_page_source'

export type EnsureIngestionCityConfigForValidatedLocalityOk = {
  ok: true
  timezone: string
  timezoneCoordinateSource: IngestionZipCoordinateSource
  localityAuthoritySource: IngestionCityConfigLocalityAuthoritySource
}

export type EnsureIngestionCityConfigForValidatedLocalityResult =
  | EnsureIngestionCityConfigForValidatedLocalityOk
  | { ok: false; reason: string }

export async function ensureIngestionCityConfigForValidatedLocality(
  admin: AdminDb,
  args: {
    sourcePlatform: string
    sourceUrl: string
    city: string
    stateCode: string
    resolvedAddressRaw: string | null | undefined
    rawPayload: unknown
    requestId?: string
    ingestionRunId?: string
  }
): Promise<EnsureIngestionCityConfigForValidatedLocalityResult> {
  const logBase = {
    component: 'ingestion/ensureIngestionCityConfigForValidatedLocality',
    operation: 'auto_provision_city_config',
    requestId: args.requestId,
    ingestionRunId: args.ingestionRunId,
  }

  if (args.sourcePlatform !== EXTERNAL_PAGE_SOURCE) {
    return { ok: false, reason: 'unsupported_source_platform' }
  }

  const city = normalizeIngestionCity(args.city) ?? ''
  const stateCode = normalizeIngestionState(args.stateCode) ?? ''
  if (!city || !stateCode) {
    return { ok: false, reason: 'missing_city_or_state' }
  }

  const trust = evaluateTrustedLocalityAuthorityForIngestionCityConfig({
    sourceUrl: args.sourceUrl,
    resolvedAddressRaw: args.resolvedAddressRaw,
    processedCity: city,
    processedState: stateCode,
    rawPayload: args.rawPayload,
  })

  if (!trust.trusted) {
    logger.info('ingestion city config auto-provision skipped (untrusted locality)', {
      ...logBase,
      locality_trust_reason: trust.reason,
    })
    return { ok: false, reason: trust.reason }
  }

  const zip5 = extractZip5ForIngestionContext({
    resolvedAddressRaw: args.resolvedAddressRaw ?? null,
    sourceUrl: args.sourceUrl,
  })
  if (!zip5) {
    logger.info('ingestion city config auto-provision skipped (no ZIP for timezone resolution)', {
      ...logBase,
      locality_authority_source: trust.source,
    })
    return { ok: false, reason: 'missing_zip_for_timezone' }
  }

  logger.info('ingestion city config auto-provision attempted', {
    ...logBase,
    locality_authority_source: trust.source,
    zip5,
  })

  const tz = await resolveIanaTimezoneForIngestionZip5(admin, { zip5, expectedState: stateCode })
  if (!tz) {
    logger.warn('ingestion city config auto-provision failed (no IANA timezone)', {
      ...logBase,
      locality_authority_source: trust.source,
      zip5,
    })
    return { ok: false, reason: 'missing_timezone' }
  }

  const { error } = await fromBase(admin, 'ingestion_city_configs').upsert(
    {
      city,
      state: stateCode,
      source_platform: EXTERNAL_PAGE_SOURCE,
      enabled: true,
      timezone: tz.iana,
      source_pages: [],
    },
    { onConflict: 'city,state,source_platform', ignoreDuplicates: true }
  )

  if (error) {
    logger.warn('ingestion city config auto-provision upsert failed', {
      ...logBase,
      locality_authority_source: trust.source,
      timezone: tz.iana,
      timezone_coordinate_source: tz.coordinateSource,
      message: error.message,
    })
    return { ok: false, reason: 'insert_failed' }
  }

  logger.info('ingestion city config auto-provision succeeded', {
    ...logBase,
    locality_authority_source: trust.source,
    timezone: tz.iana,
    timezone_coordinate_source: tz.coordinateSource,
  })

  return {
    ok: true,
    timezone: tz.iana,
    timezoneCoordinateSource: tz.coordinateSource,
    localityAuthoritySource: trust.source,
  }
}
