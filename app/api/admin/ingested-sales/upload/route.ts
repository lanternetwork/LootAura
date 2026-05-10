import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { ManualUploadSchema } from '@/lib/ingestion/schemas'
import { processIngestedSale } from '@/lib/ingestion/processSale'
import {
  accumulateDedupeDecisionAggregate,
  createEmptyDedupeDecisionAggregate,
  findIngestedSaleMatch,
} from '@/lib/ingestion/dedupe'
import { sanitizeUploadDescription } from '@/lib/ingestion/uploadDescriptionSanitizer'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { enqueue, isGeocodeQueueConfigured } from '@/lib/ingestion/geocodeQueue'
import { geocodeIngestedSaleById } from '@/lib/ingestion/geocodeWorker'
import { logger, generateOperationId } from '@/lib/log'
import type { RawExternalSale, IngestionRunSummary, CityIngestionConfig, FailureReason } from '@/lib/ingestion/types'
import { ensureIngestionCityConfigFromListingSource } from '@/lib/ingestion/ensureCityConfigFromListingSource'
import {
  shouldResetGeocodeRetryAfterUploadUpdate,
  stripGeocodeFailedFromFailureReasons,
} from '@/lib/ingestion/uploadGeocodeRetryReset'
import { publishLinkageFieldsToClearOnReopenUpload } from '@/lib/ingestion/uploadPublishLinkageCleanup'

export const dynamic = 'force-dynamic'

/** Structured errors for admin manual upload (extension + tools). */
function manualUploadErrorJson(
  code: string,
  message: string,
  requestId: string,
  extra?: Record<string, unknown>
) {
  return {
    ok: false as const,
    code,
    message,
    requestId,
    ...extra,
  }
}

function manualUploadErrorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extra?: Record<string, unknown>
) {
  return NextResponse.json(manualUploadErrorJson(code, message, requestId, extra), { status })
}

interface UploadBody {
  records: unknown
  publishReady?: boolean
}

type CityConfigRow = {
  city: string
  state: string
  timezone: string
  enabled: boolean
  source_platform: string
  source_pages: unknown
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
}

function normalizeCityForMatch(city: string): string {
  return city
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\bsaint\b/g, 'saint')
    .replace(/\bst[.]?(?=\s|$)/g, 'saint')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeStateToCode(state: string): string {
  const normalized = state
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\b(usa|us|united states|united states of america)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length === 2) {
    return normalized.toUpperCase()
  }

  return STATE_NAME_TO_CODE[normalized] || normalized.toUpperCase()
}

function toCityConfig(row: CityConfigRow): CityIngestionConfig {
  return {
    city: row.city,
    state: row.state,
    timezone: row.timezone,
    enabled: row.enabled,
    sourcePlatform: row.source_platform,
    sourcePages: Array.isArray(row.source_pages) ? row.source_pages.map(String) : [],
  }
}

function extractUrlCityFromSourceUrl(sourceUrl: string): string | null {
  try {
    const pathname = new URL(sourceUrl).pathname
    const segments = pathname.split('/').filter(Boolean)
    if (segments.length >= 4 && segments[0] === 'US') {
      const rawCity = decodeURIComponent(segments[2])
      const sanitized = rawCity
        .replace(/\.(?:html?|php|aspx?)$/i, '')
        .replace(/[?#].*$/, '')
        .replace(/-/g, ' ')
        .trim()
      return sanitized || null
    }
  } catch {
    // Ignore parse errors for diagnostics-only helper.
  }
  return null
}

async function getCityConfig(
  sourcePlatform: string,
  lookupCity: string,
  lookupState: string
): Promise<{ config: CityIngestionConfig | null; closestCandidates: string[] }> {
  const admin = getAdminDb()
  const normalizedIncomingState = normalizeStateToCode(lookupState)
  const normalizedIncomingCity = normalizeCityForMatch(lookupCity)

  const { data } = await fromBase(admin, 'ingestion_city_configs')
    .select('city, state, timezone, enabled, source_platform, source_pages')
    .eq('source_platform', sourcePlatform)
    .eq('enabled', true)

  const rows = (Array.isArray(data) ? data : []) as CityConfigRow[]
  const matched = rows.find((row) => (
    normalizeStateToCode(row.state) === normalizedIncomingState &&
    normalizeCityForMatch(row.city) === normalizedIncomingCity
  ))

  if (matched) {
    return { config: toCityConfig(matched), closestCandidates: [] }
  }

  const closestCandidates = rows
    .filter((row) => {
      if (normalizeStateToCode(row.state) !== normalizedIncomingState) return false
      const normalizedCandidateCity = normalizeCityForMatch(row.city)
      return (
        normalizedCandidateCity.includes(normalizedIncomingCity) ||
        normalizedIncomingCity.includes(normalizedCandidateCity)
      )
    })
    .slice(0, 5)
    .map((row) => `${row.city}, ${row.state}`)

  return { config: null, closestCandidates }
}

function dedupeFailureReasons(reasons: string[]): string[] {
  return [...new Set(reasons)]
}

function fallbackCityConfig(rawSale: RawExternalSale): CityIngestionConfig {
  return {
    city: rawSale.cityHint,
    state: rawSale.stateHint,
    timezone: 'UTC',
    enabled: false,
    sourcePlatform: rawSale.sourcePlatform,
    sourcePages: [],
  }
}

function cleanText(value: string | null): string | null {
  if (value == null) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

/**
 * Spec §9: if Redis queue is available, enqueue; otherwise (or on enqueue failure) run the worker inline.
 * Never throws to the upload handler — row is already persisted.
 */
async function triggerGeocodeAfterPersist(saleId: string, requestId: string, ingestionRunId: string): Promise<void> {
  try {
    if (isGeocodeQueueConfigured()) {
      try {
        const jobId = await enqueue(saleId)
        if (jobId !== null) {
          return
        }
        logger.warn('Geocode enqueue returned null; falling back to inline worker', {
          component: 'ingestion/upload',
          operation: 'geocode_trigger',
          requestId,
          ingestionRunId,
          saleId,
        })
      } catch (error) {
        logger.warn(
          'Geocode enqueue failed; falling back to inline worker',
          {
            component: 'ingestion/upload',
            operation: 'geocode_trigger',
            requestId,
            ingestionRunId,
            saleId,
            message: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }
    await geocodeIngestedSaleById(saleId)
  } catch (error) {
    logger.error(
      'Inline geocode after upload failed (row remains for retry)',
      error instanceof Error ? error : new Error(String(error)),
      {
        component: 'ingestion/upload',
        operation: 'geocode_trigger',
        requestId,
        ingestionRunId,
        saleId,
      }
    )
  }
}

async function uploadHandler(request: NextRequest): Promise<NextResponse> {
  const opId = generateOperationId()
  const startedAt = Date.now()

  logger.info('Manual upload request received', {
    component: 'ingestion/upload',
    operation: 'manual_upload_request',
    requestId: opId,
    path: request.nextUrl.pathname,
  })

  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) {
    logger.warn('Manual upload blocked: CSRF', {
      component: 'ingestion/upload',
      operation: 'manual_upload_csrf',
      requestId: opId,
      status: csrfError.status,
    })
    return manualUploadErrorResponse(
      csrfError.status,
      'UPLOAD_CSRF_INVALID',
      'Invalid or missing CSRF token. Refresh the LootAura tab and try again.',
      opId
    )
  }

  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) {
      const status = error.status
      const code =
        status === 401 ? 'UPLOAD_AUTH_UNAUTHORIZED' : 'UPLOAD_AUTH_FORBIDDEN'
      const message =
        status === 401
          ? 'Not signed in. Open LootAura and sign in, then retry.'
          : 'Admin access required. Ensure your account is in ADMIN_EMAILS.'
      logger.warn('Manual upload blocked: auth', {
        component: 'ingestion/upload',
        operation: 'manual_upload_auth',
        requestId: opId,
        status,
        code,
      })
      return manualUploadErrorResponse(status, code, message, opId)
    }
    return manualUploadErrorResponse(
      403,
      'UPLOAD_AUTH_FORBIDDEN',
      'Admin access required.',
      opId
    )
  }

  let body: UploadBody
  try {
    body = (await request.json()) as UploadBody
  } catch {
    logger.warn('Manual upload blocked: invalid JSON', {
      component: 'ingestion/upload',
      operation: 'manual_upload_json_invalid',
      requestId: opId,
    })
    return manualUploadErrorResponse(
      400,
      'UPLOAD_JSON_INVALID',
      'Request body is not valid JSON.',
      opId
    )
  }

  logger.info('Manual upload JSON parsed', {
    component: 'ingestion/upload',
    operation: 'manual_upload_json_parsed',
    requestId: opId,
    recordCount: Array.isArray(body.records) ? body.records.length : 'non-array',
  })

  const parsed = ManualUploadSchema.safeParse(body.records)
  if (!parsed.success) {
    logger.warn('Manual upload blocked: schema validation', {
      component: 'ingestion/upload',
      operation: 'manual_upload_validation_failed',
      requestId: opId,
      issueCount: parsed.error.issues.length,
    })
    return manualUploadErrorResponse(
      400,
      'UPLOAD_VALIDATION_FAILED',
      'Upload payload failed schema validation.',
      opId,
      { details: parsed.error.issues }
    )
  }

  const records = parsed.data as RawExternalSale[]
  const publishReady = body.publishReady === true
  const admin = getAdminDb()

  logger.info('Manual upload schema validated', {
    component: 'ingestion/upload',
    operation: 'manual_upload_schema_ok',
    requestId: opId,
    recordCount: records.length,
  })

  const runInsert = await fromBase(admin, 'ingestion_runs')
    .insert({
      source_platform: 'manual_upload',
      city: records[0]?.cityHint || 'unknown',
      state: records[0]?.stateHint || 'unknown',
      run_type: 'manual_upload',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (runInsert.error || !runInsert.data?.id) {
    const msg = runInsert.error?.message || 'unknown'
    logger.error('Failed to create ingestion run', new Error(msg), {
      component: 'ingestion/upload',
      operation: 'create_run',
      requestId: opId,
      failureCode: 'UPLOAD_RUN_CREATE_FAILED',
    })
    return manualUploadErrorResponse(
      500,
      'UPLOAD_RUN_CREATE_FAILED',
      'Could not create ingestion run (database error).',
      opId,
      { supabaseMessage: msg }
    )
  }
  const ingestionRunId = runInsert.data.id as string

  logger.info('Manual upload ingestion run created', {
    component: 'ingestion/upload',
    operation: 'manual_upload_run_created',
    requestId: opId,
    ingestionRunId,
  })

  const summary: IngestionRunSummary = {
    fetched: records.length,
    created: 0,
    updated: 0,
    ready: 0,
    needsCheck: 0,
    duplicates: 0,
    published: 0,
    failed: 0,
  }
  const dedupeDecisionCounts = createEmptyDedupeDecisionAggregate()

  for (const rawSale of records) {
    try {
      const defaultConfig = fallbackCityConfig(rawSale)
      let processed = await processIngestedSale(rawSale, defaultConfig)
      const parsedCity = processed.city || rawSale.cityHint
      const parsedState = processed.state || rawSale.stateHint
      const lookupCity = cleanText(parsedCity) || ''
      const lookupState = cleanText(parsedState) || ''
      const urlCity = extractUrlCityFromSourceUrl(rawSale.sourceUrl)

      let lookupResult = await getCityConfig(rawSale.sourcePlatform, lookupCity, lookupState)
      let cityConfig = lookupResult.config ?? defaultConfig
      let hasMissingCityConfig = cityConfig.enabled === false

      if (hasMissingCityConfig && lookupCity && lookupState) {
        const ensured = await ensureIngestionCityConfigFromListingSource(admin, {
          city: lookupCity,
          stateCode: normalizeStateToCode(lookupState),
          sourcePlatform: rawSale.sourcePlatform,
          sourceUrl: rawSale.sourceUrl,
        })
        if (ensured.ok) {
          lookupResult = await getCityConfig(rawSale.sourcePlatform, lookupCity, lookupState)
          cityConfig = lookupResult.config ?? cityConfig
          hasMissingCityConfig = cityConfig.enabled === false
          logger.info('City ingestion config auto-provisioned from listing URL', {
            component: 'ingestion/upload',
            operation: 'ensure_city_config',
            requestId: opId,
            ingestionRunId,
            cityPageUrl: ensured.cityPageUrl,
            lookup_city: lookupCity,
            lookup_state: lookupState,
          })
        }
      }

      if (lookupResult.config && (!rawSale.cityHint || !rawSale.stateHint)) {
        processed = await processIngestedSale(rawSale, cityConfig)
      }

      if (hasMissingCityConfig) {
        logger.warn('City ingestion config not found', {
          component: 'ingestion/upload',
          operation: 'lookup_city_config',
          requestId: opId,
          ingestionRunId,
          sourcePlatform: rawSale.sourcePlatform,
          lookup_city: lookupCity,
          lookup_state: lookupState,
          parsed_city: parsedCity,
          url_city: urlCity,
          normalizedCity: normalizeCityForMatch(lookupCity),
          normalizedState: normalizeStateToCode(lookupState),
          closestCandidates: lookupResult.closestCandidates,
        })
      }
      const match = await findIngestedSaleMatch(rawSale.sourceUrl, processed, {
        sourcePlatform: rawSale.sourcePlatform,
      })
      accumulateDedupeDecisionAggregate(dedupeDecisionCounts, match)
      const isDuplicate = match?.matchType === 'soft_address_date'
      const failureReasons = dedupeFailureReasons([
        ...processed.failureReasons,
        ...(hasMissingCityConfig ? ['missing_city_config'] : []),
        ...(isDuplicate ? ['duplicate_detected'] : []),
      ]) as FailureReason[]
      const status =
        hasMissingCityConfig || failureReasons.includes('missing_city_config')
          ? 'needs_check'
          : processed.status
      const normalizedTitle = cleanText(rawSale.title) || `${cityConfig.city} Yard Sale`
      const normalizedDescription = sanitizeUploadDescription(rawSale.description)

      const mergedRawPayload =
        rawSale.rawPayload && typeof rawSale.rawPayload === 'object' && !Array.isArray(rawSale.rawPayload)
          ? { ...(rawSale.rawPayload as Record<string, unknown>) }
          : {}
      if (processed.ingestionDiagnostics) {
        mergedRawPayload.ingestionDiagnostics = processed.ingestionDiagnostics
      }

      const basePayload = {
        source_platform: rawSale.sourcePlatform,
        source_url: rawSale.sourceUrl,
        external_id: rawSale.externalId,
        raw_text: normalizedDescription,
        raw_payload: mergedRawPayload,
        title: normalizedTitle,
        description: normalizedDescription,
        address_raw: processed.resolvedAddressRaw ?? rawSale.addressRaw,
        normalized_address: processed.normalizedAddress,
        city: processed.city,
        state: processed.state,
        lat: processed.lat,
        lng: processed.lng,
        date_start: processed.dateStart,
        date_end: processed.dateEnd,
        time_start: processed.timeStart,
        time_end: processed.timeEnd,
        date_source: processed.dateSource,
        time_source: processed.timeSource,
        image_source_url: rawSale.imageSourceUrl,
        status,
        failure_reasons: failureReasons,
        parser_version: 'manual_upload_v1',
        parse_confidence: processed.parseConfidence,
        is_duplicate: isDuplicate,
        duplicate_of: isDuplicate ? match?.id : null,
        normalized_date: processed.dateStart,
      }

      if (match) {
        const { data: priorRow, error: priorFetchError } = await fromBase(admin, 'ingested_sales')
          .select('status, failure_reasons, geocode_attempts')
          .eq('id', match.id)
          .maybeSingle()

        if (priorFetchError) {
          logger.warn('Could not read prior ingested_sale for geocode retry reset', {
            component: 'ingestion/upload',
            operation: 'geocode_retry_reset_prior_fetch',
            requestId: opId,
            ingestionRunId,
            ingestedSaleId: match.id,
            message: priorFetchError.message,
          })
        }

        let updatePayload: Record<string, unknown> = { ...basePayload }
        if (
          !priorFetchError &&
          priorRow &&
          shouldResetGeocodeRetryAfterUploadUpdate({
            newStatus: status,
            prior: {
              status: priorRow.status != null ? String(priorRow.status) : null,
              failure_reasons: priorRow.failure_reasons,
              geocode_attempts:
                priorRow.geocode_attempts != null && Number.isFinite(Number(priorRow.geocode_attempts))
                  ? Number(priorRow.geocode_attempts)
                  : null,
            },
          })
        ) {
          updatePayload = {
            ...basePayload,
            failure_reasons: stripGeocodeFailedFromFailureReasons(failureReasons),
            geocode_attempts: 0,
            last_geocode_attempt_at: null,
          }
          logger.info('Manual upload reset geocode retry state (post-terminal)', {
            component: 'ingestion/upload',
            operation: 'geocode_retry_reset',
            requestId: opId,
            ingestionRunId,
            ingestedSaleId: match.id,
            priorStatus: priorRow.status,
            priorGeocodeAttempts: priorRow.geocode_attempts,
          })
        }

        const linkageClear = publishLinkageFieldsToClearOnReopenUpload(status)
        if (linkageClear) {
          updatePayload = { ...updatePayload, ...linkageClear }
        }

        const { error: updateError } = await fromBase(admin, 'ingested_sales')
          .update(updatePayload)
          .eq('id', match.id)
        if (updateError) {
          summary.failed += 1
          logger.error('Failed to update ingested sale', new Error(updateError.message), {
            component: 'ingestion/upload',
            operation: 'update_ingested_sale',
            requestId: opId,
            ingestionRunId,
            failureCode: 'UPLOAD_ROW_UPDATE_FAILED',
            sourceUrl: rawSale.sourceUrl,
            supabaseMessage: updateError.message,
          })
          continue
        }
        summary.updated += 1
        if (status === 'needs_geocode') {
          await triggerGeocodeAfterPersist(match.id, opId, ingestionRunId)
        }
      } else {
        const { data: insertedRow, error: insertError } = await fromBase(admin, 'ingested_sales')
          .insert(basePayload)
          .select('id')
          .single()
        if (insertError || !insertedRow?.id) {
          summary.failed += 1
          const insMsg = insertError?.message || 'missing id'
          logger.error('Failed to insert ingested sale', new Error(insMsg), {
            component: 'ingestion/upload',
            operation: 'insert_ingested_sale',
            requestId: opId,
            ingestionRunId,
            failureCode: 'UPLOAD_ROW_INSERT_FAILED',
            sourceUrl: rawSale.sourceUrl,
            supabaseMessage: insMsg,
          })
          continue
        }
        summary.created += 1
        if (status === 'needs_geocode') {
          await triggerGeocodeAfterPersist(insertedRow.id as string, opId, ingestionRunId)
        }
      }

      if (isDuplicate) summary.duplicates += 1
      if (status === 'ready') summary.ready += 1
      if (status !== 'ready') summary.needsCheck += 1

      if (publishReady && status === 'ready' && !isDuplicate) {
        // Phase 3 publish stub; full publish service is implemented in a later phase.
        summary.published += 0
      }
    } catch (error) {
      summary.failed += 1
      logger.error(
        'Unexpected manual upload processing failure',
        error instanceof Error ? error : new Error(String(error)),
        {
        component: 'ingestion/upload',
        operation: 'process_sale',
        requestId: opId,
        ingestionRunId,
        }
      )
    }
  }

  const durationMs = Date.now() - startedAt
  const finalStatus = summary.failed > 0 ? 'partial' : 'success'
  await fromBase(admin, 'ingestion_runs')
    .update({
      fetched_count: summary.fetched,
      created_count: summary.created,
      updated_count: summary.updated,
      ready_count: summary.ready,
      needs_check_count: summary.needsCheck,
      duplicate_count: summary.duplicates,
      published_count: summary.published,
      status: finalStatus,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      error_summary: summary.failed > 0 ? `${summary.failed} record(s) failed during processing` : null,
    })
    .eq('id', ingestionRunId)

  const persisted = summary.created + summary.updated
  const hasFailures = summary.failed > 0
  const zeroPersistence = persisted === 0

  if (hasFailures || zeroPersistence) {
    const code = hasFailures
      ? 'UPLOAD_PARTIAL_OR_ROW_FAILURE'
      : 'UPLOAD_ZERO_PERSISTENCE'
    const message = hasFailures
      ? `${summary.failed} record(s) failed during processing (see server logs for UPLOAD_ROW_*).`
      : 'No ingested_sales rows were created or updated for this upload.'
    logger.warn('Manual upload finished without successful row persistence', {
      component: 'ingestion/upload',
      operation: 'manual_upload_no_row_persistence',
      requestId: opId,
      ingestionRunId,
      code,
      summary,
      dedupeDecisionCounts,
      durationMs,
    })
    return NextResponse.json(
      manualUploadErrorJson(code, message, opId, {
        ingestionRunId,
        summary,
        dedupeDecisionCounts,
      }),
      { status: 422 }
    )
  }

  logger.info('Manual ingestion upload completed', {
    component: 'ingestion/upload',
    operation: 'manual_upload',
    requestId: opId,
    ingestionRunId,
    sourcePlatform: 'manual_upload',
    fetched: summary.fetched,
    created: summary.created,
    updated: summary.updated,
    ready: summary.ready,
    needsCheck: summary.needsCheck,
    duplicates: summary.duplicates,
    failed: summary.failed,
    dedupeDecisionCounts,
    durationMs,
  })

  logger.info('Manual upload request completed successfully', {
    component: 'ingestion/upload',
    operation: 'manual_upload_complete',
    requestId: opId,
    ingestionRunId,
    summary,
    durationMs,
  })

  return NextResponse.json({
    ok: true,
    code: 'UPLOAD_SUCCESS',
    requestId: opId,
    ingestionRunId,
    summary,
    publish: {
      requested: publishReady,
      mode: 'stub',
      published: 0,
    },
  })
}

export const POST = withRateLimit(uploadHandler, [
  Policies.MANUAL_INGESTION_BURST,
  Policies.MANUAL_INGESTION_HOURLY,
])

