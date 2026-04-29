import { NextRequest, NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { checkCsrfIfRequired } from '@/lib/api/csrfCheck'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { ManualUploadSchema } from '@/lib/ingestion/schemas'
import { processIngestedSale } from '@/lib/ingestion/processSale'
import { findIngestedSaleMatch } from '@/lib/ingestion/dedupe'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { logger, generateOperationId } from '@/lib/log'
import type { RawExternalSale, IngestionRunSummary, CityIngestionConfig, FailureReason } from '@/lib/ingestion/types'

export const dynamic = 'force-dynamic'

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

async function getCityConfig(rawSale: RawExternalSale): Promise<{ config: CityIngestionConfig | null; closestCandidates: string[] }> {
  const admin = getAdminDb()
  const normalizedIncomingState = normalizeStateToCode(rawSale.stateHint)
  const normalizedIncomingCity = normalizeCityForMatch(rawSale.cityHint)

  const { data } = await fromBase(admin, 'ingestion_city_configs')
    .select('city, state, timezone, enabled, source_platform, source_pages')
    .eq('source_platform', rawSale.sourcePlatform)
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

async function uploadHandler(request: NextRequest): Promise<NextResponse> {
  const opId = generateOperationId()
  const startedAt = Date.now()

  const csrfError = await checkCsrfIfRequired(request)
  if (csrfError) return csrfError

  try {
    await assertAdminOrThrow(request)
  } catch (error) {
    if (error instanceof NextResponse) return error
    return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  let body: UploadBody
  try {
    body = (await request.json()) as UploadBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ManualUploadSchema.safeParse(body.records)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid upload payload', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const records = parsed.data as RawExternalSale[]
  const publishReady = body.publishReady === true
  const admin = getAdminDb()

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
    logger.error('Failed to create ingestion run', new Error(runInsert.error?.message || 'unknown'), {
      component: 'ingestion/upload',
      operation: 'create_run',
      requestId: opId,
    })
    return NextResponse.json({ error: 'Failed to create ingestion run' }, { status: 500 })
  }
  const ingestionRunId = runInsert.data.id as string

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

  for (const rawSale of records) {
    try {
      const lookup = await getCityConfig(rawSale)
      const cityConfig = lookup.config ?? fallbackCityConfig(rawSale)
      const hasMissingCityConfig = cityConfig.enabled === false
      if (hasMissingCityConfig) {
        logger.warn('City ingestion config not found', {
          component: 'ingestion/upload',
          operation: 'lookup_city_config',
          requestId: opId,
          ingestionRunId,
          sourcePlatform: rawSale.sourcePlatform,
          incomingCity: rawSale.cityHint,
          incomingState: rawSale.stateHint,
          normalizedCity: normalizeCityForMatch(rawSale.cityHint),
          normalizedState: normalizeStateToCode(rawSale.stateHint),
          closestCandidates: lookup.closestCandidates,
        })
      }

      const processed = await processIngestedSale(rawSale, cityConfig)
      const match = await findIngestedSaleMatch(rawSale.sourceUrl, processed)
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
      const normalizedDescription = cleanText(rawSale.description)

      const basePayload = {
        source_platform: rawSale.sourcePlatform,
        source_url: rawSale.sourceUrl,
        external_id: rawSale.externalId,
        raw_text: normalizedDescription,
        raw_payload: rawSale.rawPayload,
        title: normalizedTitle,
        description: normalizedDescription,
        address_raw: rawSale.addressRaw,
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
        const { error: updateError } = await fromBase(admin, 'ingested_sales')
          .update(basePayload)
          .eq('id', match.id)
        if (updateError) {
          summary.failed += 1
          logger.error('Failed to update ingested sale', new Error(updateError.message), {
            component: 'ingestion/upload',
            operation: 'update_ingested_sale',
            requestId: opId,
            ingestionRunId,
          })
          continue
        }
        summary.updated += 1
      } else {
        const { error: insertError } = await fromBase(admin, 'ingested_sales').insert(basePayload)
        if (insertError) {
          summary.failed += 1
          logger.error('Failed to insert ingested sale', new Error(insertError.message), {
            component: 'ingestion/upload',
            operation: 'insert_ingested_sale',
            requestId: opId,
            ingestionRunId,
          })
          continue
        }
        summary.created += 1
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
    durationMs,
  })

  return NextResponse.json({
    ok: true,
    ingestionRunId,
    summary,
    publish: {
      requested: publishReady,
      mode: 'stub',
      published: 0,
    },
  })
}

export const POST = withRateLimit(uploadHandler, [Policies.ADMIN_TOOLS, Policies.ADMIN_HOURLY])

