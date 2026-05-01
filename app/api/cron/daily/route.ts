/**
 * GET /api/cron/daily
 * POST /api/cron/daily
 * 
 * Unified daily cron endpoint that handles multiple daily tasks:
 * 1. Auto-archive sales that have ended
 * 2. Expire promotions that have ended
 * 3. Send favorite sales starting soon emails
 * 4. Send weekly moderation digest (Fridays only)
 * 
 * This endpoint is protected by CRON_SECRET Bearer token authentication.
 * It should be called by a scheduled job (Vercel Cron, Supabase Cron, etc.)
 * 
 * Authentication:
 * - Requires Authorization header: `Bearer ${CRON_SECRET}`
 * - Environment variable: CRON_SECRET (server-only)
 * 
 * Schedule recommendation:
 * - Daily at 02:00 UTC
 * - Purpose: Archive ended sales and send favorite sale reminders
 */

import { NextRequest, NextResponse } from 'next/server'
import { assertCronAuthorized } from '@/lib/auth/cron'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { processFavoriteSalesStartingSoonJob } from '@/lib/jobs/processor'
import { sendModerationDailyDigestEmail } from '@/lib/email/moderationDigest'
import { logger, generateOperationId } from '@/lib/log'
import { geocodePendingSales } from '@/lib/ingestion/geocodeWorker'
import { enqueueGeocodeJob, runGeocodeQueueWorker, sweepNeedsGeocodeToQueue } from '@/lib/ingestion/geocodeQueue'
import { publishReadyIngestedSales } from '@/lib/ingestion/publishWorker'
import { processIngestedSale } from '@/lib/ingestion/processSale'
import { findIngestedSaleMatch } from '@/lib/ingestion/dedupe'
import type { ReportDigestItem } from '@/lib/email/templates/ModerationDailyDigestEmail'
import type { CityIngestionConfig, FailureReason, RawExternalSale } from '@/lib/ingestion/types'

export const dynamic = 'force-dynamic'

type CityConfigRow = {
  city: string
  state: string
  timezone: string
  enabled: boolean
  source_platform: string
  source_pages: unknown
}

type PromotionIdRow = {
  id: string
}

type CronIngestionSummary = {
  fetched: number
  inserted: number
  updated: number
  duplicates: number
  needsCheck: number
  failed: number
  enqueued: number
  deferred: number
}

function parseBatchSize(): number {
  const raw = process.env.CRON_INGEST_BATCH_SIZE
  const parsed = raw ? Number.parseInt(raw, 10) : 50
  if (!Number.isFinite(parsed) || parsed <= 0) return 50
  return Math.min(parsed, 200)
}

function parseGeocodeEnqueueCap(): number {
  const raw = process.env.CRON_INGEST_GEOCODE_ENQUEUE_CAP
  const parsed = raw ? Number.parseInt(raw, 10) : 500
  if (!Number.isFinite(parsed) || parsed < 0) return 500
  return parsed
}

function parseSourceUrlCap(): number {
  const raw = process.env.CRON_INGEST_SOURCE_URL_CAP
  const parsed = raw ? Number.parseInt(raw, 10) : 2000
  if (!Number.isFinite(parsed) || parsed <= 0) return 2000
  return Math.min(parsed, 10000)
}

function cleanText(value: string | null): string | null {
  if (value == null) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

function dedupeFailureReasons(reasons: string[]): string[] {
  return [...new Set(reasons)]
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

function toAbsoluteUrl(value: string, baseUrl: string): string | null {
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return null
  }
}

function stripTags(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script(?:\s[^>]*)?>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function extractListingUrls(pageHtml: string, baseUrl: string): string[] {
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi
  const urls: string[] = []
  let match: RegExpExecArray | null = null
  while ((match = hrefRegex.exec(pageHtml)) != null) {
    const rawHref = match[1] || ''
    const absolute = toAbsoluteUrl(rawHref, baseUrl)
    if (!absolute) continue
    const lower = absolute.toLowerCase()
    if (!lower.includes('/listing.html') && !lower.includes('/userlisting.html')) continue
    urls.push(absolute)
  }
  return [...new Set(urls)]
}

function extractTitle(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || null
  if (h1) return cleanText(decodeHtmlEntities(stripTags(h1)))
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || null
  return cleanText(decodeHtmlEntities(stripTags(title || '')))
}

function extractDescription(html: string): string | null {
  const meta = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] || null
  if (meta) return cleanText(decodeHtmlEntities(meta))
  const text = cleanText(decodeHtmlEntities(stripTags(html)))
  return text ? text.slice(0, 2000) : null
}

function extractAddressRaw(text: string): string | null {
  const match = text.match(/\d{2,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-'\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?/)
  return cleanText(match ? match[0] : null)
}

function extractDateRaw(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(entry))
  return cleanText(line || null)
}

function extractImageSourceUrl(html: string, pageUrl: string): string | null {
  const src = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1] || null
  if (!src) return null
  return toAbsoluteUrl(src, pageUrl)
}

function parseExternalIdFromUrl(sourceUrl: string): string | null {
  try {
    const u = new URL(sourceUrl)
    const id = u.searchParams.get('id') || u.searchParams.get('listingId')
    return cleanText(id)
  } catch {
    return null
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'LootAuraIngestionBot/1.0 (+https://lootaura.com)',
      },
      cache: 'no-store',
    })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

async function fetchExternalPageSourceRecords(
  cityConfigs: CityIngestionConfig[],
  sourceUrlCap: number
): Promise<RawExternalSale[]> {
  const results: RawExternalSale[] = []
  const listingUrlSet = new Set<string>()

  for (const cfg of cityConfigs) {
    for (const pageUrl of cfg.sourcePages) {
      if (listingUrlSet.size >= sourceUrlCap) break
      const pageHtml = await fetchHtml(pageUrl)
      if (!pageHtml) continue
      const urls = extractListingUrls(pageHtml, pageUrl)
      for (const url of urls) {
        if (listingUrlSet.size >= sourceUrlCap) break
        listingUrlSet.add(url)
      }
    }
  }

  for (const listingUrl of listingUrlSet) {
    const cfg = cityConfigs.find((cityCfg) =>
      cityCfg.sourcePages.some((sourcePage) => {
        try {
          const sourceHost = new URL(sourcePage).hostname
          const listingHost = new URL(listingUrl).hostname
          return sourceHost === listingHost
        } catch {
          return false
        }
      })
    )
    if (!cfg) continue

    const html = await fetchHtml(listingUrl)
    if (!html) continue
    const plainText = decodeHtmlEntities(stripTags(html))
    results.push({
      sourcePlatform: 'external_page_source',
      sourceUrl: listingUrl,
      externalId: parseExternalIdFromUrl(listingUrl),
      title: extractTitle(html),
      description: extractDescription(html),
      addressRaw: extractAddressRaw(plainText),
      dateRaw: extractDateRaw(plainText),
      imageSourceUrl: extractImageSourceUrl(html, listingUrl),
      rawPayload: {
        fetchedAt: new Date().toISOString(),
        sourceType: 'cron_external_page_source',
      },
      cityHint: cfg.city,
      stateHint: cfg.state,
    })
  }

  return results
}

async function processCronIngestionBatch(
  adminDb: ReturnType<typeof getAdminDb>,
  records: RawExternalSale[],
  geocodeEnqueueCap: number,
  enqueueState: { enqueued: number; deferred: number }
): Promise<Omit<CronIngestionSummary, 'fetched'>> {
  const summary: Omit<CronIngestionSummary, 'fetched'> = {
    inserted: 0,
    updated: 0,
    duplicates: 0,
    needsCheck: 0,
    failed: 0,
    enqueued: 0,
    deferred: 0,
  }

  for (const rawSale of records) {
    try {
      const defaultConfig = fallbackCityConfig(rawSale)
      const processed = await processIngestedSale(rawSale, defaultConfig)
      const match = await findIngestedSaleMatch(rawSale.sourceUrl, processed)
      const isDuplicate = match?.matchType === 'soft_address_date'
      const failureReasons = dedupeFailureReasons([
        ...processed.failureReasons,
        ...(isDuplicate ? ['duplicate_detected'] : []),
      ]) as FailureReason[]
      const status = processed.status

      const basePayload = {
        source_platform: rawSale.sourcePlatform,
        source_url: rawSale.sourceUrl,
        external_id: rawSale.externalId,
        raw_text: cleanText(rawSale.description),
        raw_payload: rawSale.rawPayload,
        title: cleanText(rawSale.title) || `${rawSale.cityHint} Yard Sale`,
        description: cleanText(rawSale.description),
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
        parser_version: 'cron_external_page_v1',
        parse_confidence: processed.parseConfidence,
        is_duplicate: isDuplicate,
        duplicate_of: isDuplicate ? match?.id : null,
        normalized_date: processed.dateStart,
      }

      let rowId: string | null = null
      if (match) {
        const { error: updateError } = await fromBase(adminDb, 'ingested_sales')
          .update(basePayload)
          .eq('id', match.id)
        if (updateError) {
          summary.failed += 1
          continue
        }
        rowId = String(match.id)
        summary.updated += 1
      } else {
        const insertResult = await fromBase(adminDb, 'ingested_sales')
          .insert(basePayload)
          .select('id')
          .single()
        if (insertResult.error || !insertResult.data?.id) {
          summary.failed += 1
          continue
        }
        rowId = String(insertResult.data.id)
        summary.inserted += 1
      }

      if (isDuplicate) summary.duplicates += 1
      if (status === 'needs_check') summary.needsCheck += 1

      if (status === 'needs_geocode' && rowId) {
        if (enqueueState.enqueued >= geocodeEnqueueCap) {
          enqueueState.deferred += 1
          summary.deferred += 1
        } else {
          await enqueueGeocodeJob({ sale_id: rowId, priority: 'NORMAL' })
          enqueueState.enqueued += 1
          summary.enqueued += 1
        }
      }
    } catch {
      summary.failed += 1
    }
  }

  return summary
}

async function runCronSourceIngestion(withOpId: (context?: any) => any): Promise<any> {
  const adminDb = getAdminDb()
  const batchSize = parseBatchSize()
  const geocodeEnqueueCap = parseGeocodeEnqueueCap()
  const sourceUrlCap = parseSourceUrlCap()

  const { data: rows, error: cityError } = await fromBase(adminDb, 'ingestion_city_configs')
    .select('city, state, timezone, enabled, source_platform, source_pages')
    .eq('enabled', true)
    .eq('source_platform', 'external_page_source')

  if (cityError) {
    throw new Error(cityError.message || 'Failed to load ingestion city configs')
  }

  const cityConfigs = ((Array.isArray(rows) ? rows : []) as CityConfigRow[]).map(toCityConfig)
  const records = await fetchExternalPageSourceRecords(cityConfigs, sourceUrlCap)

  const totals: CronIngestionSummary = {
    fetched: records.length,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    needsCheck: 0,
    failed: 0,
    enqueued: 0,
    deferred: 0,
  }
  const enqueueState = { enqueued: 0, deferred: 0 }

  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize)
    const batchSummary = await processCronIngestionBatch(adminDb, batch, geocodeEnqueueCap, enqueueState)
    totals.inserted += batchSummary.inserted
    totals.updated += batchSummary.updated
    totals.duplicates += batchSummary.duplicates
    totals.needsCheck += batchSummary.needsCheck
    totals.failed += batchSummary.failed
    totals.enqueued += batchSummary.enqueued
    totals.deferred += batchSummary.deferred
  }

  logger.info('Cron ingestion source completed', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    step: 'ingestion',
    fetched: totals.fetched,
    inserted: totals.inserted,
    updated: totals.updated,
    duplicates: totals.duplicates,
    needsCheck: totals.needsCheck,
    failed: totals.failed,
    enqueued: totals.enqueued,
    deferred: totals.deferred,
    batchSize,
    geocodeEnqueueCap,
    sourceUrlCap,
  }))

  return {
    ok: true,
    ...totals,
    batchSize,
    geocodeEnqueueCap,
    sourceUrlCap,
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request)
}

export async function POST(request: NextRequest) {
  return handleRequest(request)
}

async function handleRequest(request: NextRequest) {
  const runAt = new Date().toISOString()
  const env = process.env.NODE_ENV || 'development'
  const opId = generateOperationId()
  const withOpId = (context: any = {}) => ({ ...context, requestId: opId })
  const errorResponse = (status: number, code: string, message: string) =>
    NextResponse.json(
      {
        ok: false,
        error: {
          code,
          message,
        },
      },
      { status }
    )

  try {
    // Validate cron authentication
    try {
      assertCronAuthorized(request)
    } catch (error) {
      // assertCronAuthorized throws NextResponse if unauthorized or misconfigured
      if (error instanceof NextResponse) {
        return errorResponse(error.status, 'UNAUTHORIZED', 'Unauthorized')
      }
      // If it's not a NextResponse, rethrow
      throw error
    }

    logger.info('Daily cron job triggered', withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
    }))

    const results: any = {
      ok: true,
      job: 'daily',
      runAt,
      env,
      tasks: {},
    }

    // Task 1: Auto-archive sales that have ended
    try {
      const archiveResult = await archiveEndedSales(withOpId)
      results.tasks.archiveSales = archiveResult
    } catch (error) {
      logger.error('Archive sales task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'archive-sales',
      }))
      results.tasks.archiveSales = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 2: Expire promotions that have ended
    try {
      const expireResult = await expireEndedPromotions(withOpId)
      results.tasks.expirePromotions = expireResult
    } catch (error) {
      logger.error('Expire promotions task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'expire-promotions',
      }))
      results.tasks.expirePromotions = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 3: Send favorite sales starting soon emails
    try {
      const emailsEnabled = process.env.LOOTAURA_ENABLE_EMAILS === 'true'
      if (!emailsEnabled) {
        logger.info('Favorite sales starting soon task skipped - emails disabled', withOpId({
          component: 'api/cron/daily',
          task: 'favorites-starting-soon',
        }))
        results.tasks.favoritesStartingSoon = {
          ok: true,
          skipped: true,
          reason: 'emails_disabled',
        }
      } else {
        const favoritesResult = await processFavoriteSalesStartingSoonJob({})
        results.tasks.favoritesStartingSoon = {
          ok: favoritesResult.success,
          error: favoritesResult.error,
        }
      }
    } catch (error) {
      logger.error('Favorites starting soon task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'favorites-starting-soon',
      }))
      results.tasks.favoritesStartingSoon = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }

    // Task 4: Send weekly moderation digest (only on Fridays)
    const currentDay = new Date().getUTCDay() // 0 = Sunday, 5 = Friday
    if (currentDay === 5) {
      try {
        const moderationResult = await sendWeeklyModerationDigest(withOpId)
        results.tasks.moderationDigest = moderationResult
      } catch (error) {
        logger.error('Moderation digest task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
          component: 'api/cron/daily',
          task: 'moderation-digest',
        }))
        results.tasks.moderationDigest = {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    } else {
      results.tasks.moderationDigest = {
        ok: true,
        skipped: true,
        reason: 'not_friday',
      }
    }

    // Task 5: Ingestion orchestration (ingestion -> geocode -> publish)
    try {
      const ingestionOrchestrationResult = await runIngestionOrchestration(withOpId)
      results.tasks.ingestionOrchestration = ingestionOrchestrationResult
    } catch (error) {
      logger.error('Ingestion orchestration task failed', error instanceof Error ? error : new Error(String(error)), withOpId({
        component: 'api/cron/daily',
        task: 'ingestion-orchestration',
      }))
      results.tasks.ingestionOrchestration = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }


    // Determine overall success (at least one task must succeed)
    const hasSuccess = Object.values(results.tasks).some((task: any) => task.ok === true)
    if (!hasSuccess) {
      results.ok = false
    }

    logger.info('Daily cron job completed', withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
      results,
    }))

    return NextResponse.json(results, { status: results.ok ? 200 : 500 })
  } catch (error) {
    // Handle auth errors (thrown by assertCronAuthorized)
    if (error instanceof NextResponse) {
      return errorResponse(error.status, 'UNAUTHORIZED', 'Unauthorized')
    }

    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Unexpected error in daily cron', error instanceof Error ? error : new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      runAt,
      env,
    }))

    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error')
  }
}

async function runIngestionOrchestration(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting ingestion orchestration task', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
  }))

  const taskResult: any = {
    ok: true,
    steps: {},
  }

  // Step 1: Source ingestion (adapter-based external page source).
  try {
    logger.info('Ingestion step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'ingestion',
    }))
    const ingestionSummary = await runCronSourceIngestion(withOpId)
    taskResult.steps.ingestion = ingestionSummary
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.ingestion = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error('Ingestion step failed', error instanceof Error ? error : new Error(String(error)), withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'ingestion',
    }))
  }

  // Step 2: Geocode pending sales.
  try {
    logger.info('Geocode step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'geocode',
    }))
    const queueSummary = await runGeocodeQueueWorker()
    const sweepSummary = await sweepNeedsGeocodeToQueue(200)
    const geocodeSummary = await geocodePendingSales()
    taskResult.steps.geocode = {
      ok: true,
      queue: queueSummary,
      sweep: sweepSummary,
      fallback: geocodeSummary,
      ...geocodeSummary,
    }
    logger.info('Geocode step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'geocode',
      ...geocodeSummary,
    }))
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.geocode = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error('Geocode step failed', error instanceof Error ? error : new Error(String(error)), withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'geocode',
    }))
  }

  // Step 3: Publish ready ingested sales.
  try {
    logger.info('Publish step started', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
    }))
    const publishSummary = await publishReadyIngestedSales()
    taskResult.steps.publish = {
      ok: true,
      ...publishSummary,
    }
    logger.info('Publish step completed', withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
      ...publishSummary,
    }))
  } catch (error) {
    taskResult.ok = false
    taskResult.steps.publish = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logger.error('Publish step failed', error instanceof Error ? error : new Error(String(error)), withOpId({
      component: 'api/cron/daily',
      task: 'ingestion-orchestration',
      step: 'publish',
    }))
  }

  logger.info('Ingestion orchestration task completed', withOpId({
    component: 'api/cron/daily',
    task: 'ingestion-orchestration',
    result: taskResult,
  }))

  return taskResult
}

async function archiveEndedSales(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting archive sales task', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
  }))

  // Get admin DB client (bypasses RLS)
  const db = getAdminDb()
  const now = new Date()
  // Use UTC date to avoid timezone issues
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD format

  // Find sales that should be archived:
  // - status is 'published' or 'active'
  // - (end_date <= today OR (end_date IS NULL AND date_start < today))
  // - archived_at IS NULL (not already archived)
  // Note: We need to fetch all published/active sales and filter in memory
  // because PostgREST doesn't easily support complex OR conditions
  const { data: allSales, error: queryError } = await fromBase(db, 'sales')
    .select('id, title, date_start, date_end, status, archived_at')
    .in('status', ['published', 'active'])
    .is('archived_at', null)

  if (queryError) {
    const errorMessage = queryError && typeof queryError === 'object' && 'message' in queryError
      ? String(queryError.message)
      : String(queryError)
    logger.error('Failed to query sales for archiving', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'archive-sales',
      error: queryError,
    }))
    throw new Error('Failed to query sales')
  }

  // Filter sales that have ended:
  // - Sales with date_end <= today (ended today or before)
  // - Sales without date_end but with date_start < today (single-day sales that started in the past)
  const salesToArchive = (allSales || []).filter((sale: any) => {
    if (sale.date_end) {
      // Parse date_end and compare properly
      const endDate = new Date(sale.date_end + 'T00:00:00Z')
      // Archive if end date is today or in the past
      return endDate <= today
    }
    // If no end_date, check if start_date is in the past (single-day sale)
    if (sale.date_start) {
      // Parse date_start and compare properly
      const startDate = new Date(sale.date_start + 'T00:00:00Z')
      // Archive if start date is before today (sale already happened)
      return startDate < today
    }
    // If no dates at all, don't archive (shouldn't happen for published sales)
    return false
  })

  // Log details about what we found for debugging
  logger.info('Archive sales filtering details', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    today: todayStr,
    totalSales: allSales?.length || 0,
    salesToArchiveCount: salesToArchive.length,
    sampleSalesToArchive: salesToArchive.slice(0, 5).map((s: any) => ({
      id: s.id,
      title: s.title?.substring(0, 50),
      date_start: s.date_start,
      date_end: s.date_end,
      status: s.status,
    })),
    // Also log some sales that weren't archived (for debugging)
    sampleSalesNotArchived: (allSales || [])
      .filter((s: any) => !salesToArchive.some((a: any) => a.id === s.id))
      .slice(0, 5)
      .map((s: any) => ({
        id: s.id,
        title: s.title?.substring(0, 50),
        date_start: s.date_start,
        date_end: s.date_end,
        status: s.status,
        reason: s.date_end 
          ? `date_end (${s.date_end}) > today (${todayStr})`
          : s.date_start
          ? `date_start (${s.date_start}) >= today (${todayStr})`
          : 'no dates',
      })),
  }))

  const salesToArchiveCount = salesToArchive?.length || 0

  if (salesToArchiveCount === 0) {
    logger.info('No sales to archive', withOpId({
      component: 'api/cron/daily',
      task: 'archive-sales',
      count: 0,
    }))
    return {
      ok: true,
      archived: 0,
      errors: 0,
    }
  }

  logger.info(`Found ${salesToArchiveCount} sales to archive`, withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    count: salesToArchiveCount,
  }))

  // Archive all matching sales by ID
  const saleIdsToArchive = salesToArchive.map((s: any) => s.id)
  if (saleIdsToArchive.length === 0) {
    return {
      ok: true,
      archived: 0,
      errors: 0,
    }
  }

  const { data: archivedSales, error: updateError } = await fromBase(db, 'sales')
    .update({
      status: 'archived',
      archived_at: now.toISOString(),
    })
    .in('id', saleIdsToArchive)
    .select('id')

  if (updateError) {
    logger.error('Failed to archive sales', updateError instanceof Error ? updateError : new Error(String(updateError)), withOpId({
      component: 'api/cron/daily',
      task: 'archive-sales',
      error: updateError,
    }))
    throw new Error('Failed to archive sales')
  }

  const archivedCount = archivedSales?.length || 0

  logger.info('Archive sales task completed', withOpId({
    component: 'api/cron/daily',
    task: 'archive-sales',
    archivedCount,
  }))

  return {
    ok: true,
    archived: archivedCount,
    errors: 0,
  }
}

async function expireEndedPromotions(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting expire promotions task', withOpId({
    component: 'api/cron/daily',
    task: 'expire-promotions',
  }))

  const db = getAdminDb()
  const now = new Date().toISOString()

  // Find promotions that should be expired:
  // - status is 'active'
  // - ends_at < now
  const { data: expiredPromotions, error: queryError } = await fromBase(db, 'promotions')
    .select('id, sale_id, ends_at')
    .eq('status', 'active')
    .lt('ends_at', now)

  if (queryError) {
    const errorMessage = queryError && typeof queryError === 'object' && 'message' in queryError
      ? String(queryError.message)
      : String(queryError)
    logger.error('Failed to query promotions for expiry', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      error: queryError,
    }))
    throw new Error('Failed to query promotions')
  }

  if (!expiredPromotions || expiredPromotions.length === 0) {
    logger.info('No promotions to expire', withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      count: 0,
    }))
    return {
      ok: true,
      expiredCount: 0,
    }
  }

  // Update all expired promotions to 'expired' status
  const promotionRows = expiredPromotions as PromotionIdRow[]
  const promotionIds = promotionRows.map((p: PromotionIdRow) => p.id)
  const { error: updateError } = await fromBase(db, 'promotions')
    .update({
      status: 'expired',
      updated_at: now,
    })
    .in('id', promotionIds)
    .eq('status', 'active') // Only update if still active (idempotent)

  if (updateError) {
    const errorMessage = updateError && typeof updateError === 'object' && 'message' in updateError
      ? String(updateError.message)
      : String(updateError)
    logger.error('Failed to expire promotions', new Error(errorMessage), withOpId({
      component: 'api/cron/daily',
      task: 'expire-promotions',
      error: updateError,
      count: promotionIds.length,
    }))
    throw new Error('Failed to expire promotions')
  }

  logger.info('Promotions expired successfully', withOpId({
    component: 'api/cron/daily',
    task: 'expire-promotions',
    expiredCount: expiredPromotions.length,
    promotionIds: promotionRows.map((p: PromotionIdRow) => p.id),
  }))

  return {
    ok: true,
    expiredCount: expiredPromotions.length,
  }
}

async function sendWeeklyModerationDigest(
  withOpId: (context?: any) => any
): Promise<any> {
  logger.info('Starting weekly moderation digest task', withOpId({
    component: 'api/cron/daily',
    task: 'moderation-digest',
  }))

  // Calculate 7-day window (last week to now in UTC)
  const now = new Date()
  const lastWeek = new Date(now)
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7)

  const adminDb = getAdminDb()

  // Query for new reports in the last 7 days
  const { data: reports, error: reportsError } = await fromBase(adminDb, 'sale_reports')
    .select(`
      id,
      sale_id,
      reporter_profile_id,
      reason,
      created_at,
      sales:sale_id (
        id,
        title,
        address,
        city,
        state
      )
    `)
    .gte('created_at', lastWeek.toISOString())
    .order('created_at', { ascending: false })

  if (reportsError) {
    logger.error('Failed to fetch reports for digest', reportsError instanceof Error ? reportsError : new Error(String(reportsError)), withOpId({
      component: 'api/cron/daily',
      task: 'moderation-digest',
      operation: 'fetch_reports',
    }))
    throw new Error('Failed to fetch reports')
  }

  // Transform reports for email template
  const reportItems: ReportDigestItem[] = (reports || []).map((report: any) => {
    const sale = report.sales || {}
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.com'
    
    return {
      reportId: report.id,
      saleId: report.sale_id,
      saleTitle: sale.title || 'Untitled Sale',
      saleAddress: sale.address ? `${sale.address}, ${sale.city || ''}, ${sale.state || ''}`.trim() : 'Address not available',
      reason: report.reason,
      createdAt: report.created_at,
      reporterId: report.reporter_profile_id,
      adminViewUrl: `${baseUrl}/admin/tools/reports?reportId=${report.id}`,
    }
  })

  // Format date window for email (last 7 days)
  const dateWindow = lastWeek.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }) + ' - ' + now.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // Send email
  const emailResult = await sendModerationDailyDigestEmail({
    reports: reportItems,
    dateWindow,
  })

  if (!emailResult.ok) {
    logger.error('Failed to send moderation digest email', new Error(emailResult.error || 'Unknown error'), withOpId({
      component: 'api/cron/daily',
      task: 'moderation-digest',
      operation: 'send_email',
      reportCount: reportItems.length,
    }))
    throw new Error('Failed to send email')
  }

  logger.info('Weekly moderation digest sent successfully', withOpId({
    component: 'api/cron/daily',
    task: 'moderation-digest',
    operation: 'send_email',
    reportCount: reportItems.length,
  }))

  return {
    ok: true,
    reportCount: reportItems.length,
  }
}

