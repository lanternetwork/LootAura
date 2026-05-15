import { formatAddressForPublishedSaleDisplay } from '@/lib/ingestion/formatDisplayAddress'
import { MAX_IMPORTED_LISTING_IMAGES } from '@/lib/ingestion/importedListingImagePolicy'
import { extractPublishImageCandidates } from '@/lib/ingestion/publishImageCandidates'
import { normalizeAddressForPublish } from '@/lib/ingestion/normalizeAddressForPublish'
import { validateResolvedAddressForPublish } from '@/lib/ingestion/publishValidation'
import { uspsCodeToFullNameForAddress } from '@/lib/ingestion/adapters/usStateListPathSegment'
import { sanitizeExternalImageUrls } from '@/lib/ingestion/externalImageValidation'
import { urlSuggestsNonListingPhoto } from '@/lib/ingestion/nonSaleImageHeuristics'
import { logger } from '@/lib/log'
import { resolvePersistableSaleEndsAt, type AdminDbForSaleEnds } from '@/lib/sales/resolvePersistableSaleEndsAt'
import { fromBase } from '@/lib/supabase/clients'
import { descriptionHasPlaceholderProse, detectPlaceholderListing } from '@/lib/reconciliation/placeholderDetection'
import type { ReconciledScheduleBundleResult } from '@/lib/reconciliation/reconciledScheduleBundle'
import {
  buildCanonicalLinkedSaleSchedulePatch,
  saleScheduleDiffersFromCanonicalBundle,
  type SaleScheduleForBundleCompare,
} from '@/lib/reconciliation/canonicalLinkedSaleSchedulePatch'
import type { ParsedListingSnapshotForReconciliation } from '@/lib/reconciliation/reconciliationParseSnapshot'
import type { IngestFingerprint, ReconciliationChangeClass } from '@/lib/reconciliation/types'

export { inferClosingTimeEndFromDescription, inferOpeningTimeStartFromDescription } from '@/lib/reconciliation/reconciledScheduleBundle'
export {
  buildCanonicalLinkedSaleSchedulePatch,
  normalizeScheduleDateField,
  normalizeScheduleTimeField,
  saleScheduleDiffersFromCanonicalBundle,
  type SaleScheduleForBundleCompare,
} from '@/lib/reconciliation/canonicalLinkedSaleSchedulePatch'

// ---------------------------------------------------------------------------
// Heuristics (shared with publish worker — single policy surface)
// ---------------------------------------------------------------------------

export function normalizeTextOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const out = value.trim()
  return out.length > 0 ? out : null
}

export function isLogoLikeImageUrl(value: string): boolean {
  if (urlSuggestsNonListingPhoto(value)) return true
  const lower = value.toLowerCase()
  return (
    lower.includes('logo') ||
    lower.includes('site_logo') ||
    lower.includes('ystm_site') ||
    lower.includes('icon') ||
    lower.includes('sprite') ||
    lower.includes('favicon') ||
    lower.includes('banner') ||
    lower.includes('avatar') ||
    lower.includes('tracking') ||
    lower.includes('pixel') ||
    lower.includes('placeholder') ||
    lower.includes('default') ||
    lower.includes('blank') ||
    lower.includes('spacer')
  )
}

export function saleRowImageFieldsEmpty(row: {
  cover_image_url: string | null
  images: unknown
}): boolean {
  const coverEmpty = row.cover_image_url == null || String(row.cover_image_url).trim() === ''
  const imgs = row.images
  const imagesEmpty = imgs == null || (Array.isArray(imgs) && imgs.length === 0)
  return coverEmpty && imagesEmpty
}

export function normalizeImageArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function existingSaleImagesReplaceable(row: {
  cover_image_url: string | null
  images: unknown
}): boolean {
  if (saleRowImageFieldsEmpty(row)) return true
  const cover = normalizeTextOrNull(row.cover_image_url)
  if (!cover) return true
  if (isLogoLikeImageUrl(cover)) return true
  return false
}

/** Imported sale gallery is "healthy" when it has multiple real photos and is not a placeholder listing. */
export function saleGalleryIsHealthyForShrinkProtection(row: {
  images: unknown
  description: string | null | undefined
}): boolean {
  const existingImages = normalizeImageArray(row.images)
  const validPhotoCount = existingImages.filter((u) => !isLogoLikeImageUrl(u)).length
  if (validPhotoCount < 2) return false
  return !detectPlaceholderListing({ description: row.description ?? null, imageUrls: existingImages }).isPlaceholder
}

export type ImportedListingImageSyncIntent =
  | { readonly kind: 'none' }
  | { readonly kind: 'full'; readonly images: string[]; readonly cover_image_url: string }
  | { readonly kind: 'cover_only'; readonly cover_image_url: string }

function pickCoverForSyncedGallery(existingCover: string | null, sanitized: readonly string[]): string {
  const ec = normalizeTextOrNull(existingCover)
  if (ec && sanitized.includes(ec)) return ec
  return sanitized[0]!
}

export function computeImportedListingImageSyncIntent(params: {
  sale: { cover_image_url: string | null; images: unknown; description: string | null | undefined }
  sanitizedImages: readonly string[]
}): ImportedListingImageSyncIntent {
  const sanitized = [...params.sanitizedImages]
  if (sanitized.length === 0) return { kind: 'none' }

  const existingImages = normalizeImageArray(params.sale.images)
  const healthy = saleGalleryIsHealthyForShrinkProtection(params.sale)

  if (healthy) {
    if (sanitized.length < existingImages.length) {
      const cover = normalizeTextOrNull(params.sale.cover_image_url)
      const firstGood = existingImages.find((u) => !isLogoLikeImageUrl(u)) ?? null
      if (cover && isLogoLikeImageUrl(cover) && firstGood) {
        return { kind: 'cover_only', cover_image_url: firstGood }
      }
      return { kind: 'none' }
    }
    return {
      kind: 'full',
      images: sanitized,
      cover_image_url: pickCoverForSyncedGallery(params.sale.cover_image_url, sanitized),
    }
  }

  const shouldReplaceMedia = existingSaleImagesReplaceable(params.sale)
  const existingAllNonBranding =
    existingImages.length > 0 && existingImages.every((u) => !isLogoLikeImageUrl(u))
  const sourceClearlyInferior =
    !shouldReplaceMedia &&
    sanitized.length < existingImages.length &&
    existingAllNonBranding
  const shouldExpandMedia =
    !shouldReplaceMedia && !sourceClearlyInferior && sanitized.length > existingImages.length

  if (shouldReplaceMedia || shouldExpandMedia) {
    return {
      kind: 'full',
      images: sanitized,
      cover_image_url: pickCoverForSyncedGallery(params.sale.cover_image_url, sanitized),
    }
  }
  return { kind: 'none' }
}

export function looksGenericTitle(value: string | null | undefined, city: string | null): boolean {
  const t = normalizeTextOrNull(value)
  if (!t) return true
  if (/^yard sale$/i.test(t) || /^garage sale$/i.test(t) || /^estate sale$/i.test(t)) return true
  if (/^listing$/i.test(t)) return true
  const cityNorm = normalizeTextOrNull(city)
  if (cityNorm && t.toLowerCase() === `${cityNorm.toLowerCase()} yard sale`) return true
  return false
}

export function looksGenericDescription(value: string | null | undefined): boolean {
  const t = normalizeTextOrNull(value)
  if (!t) return true
  return /^yard sale\b/i.test(t) || /^garage sale\b/i.test(t) || /^estate sale\b/i.test(t) || /^listing\b/i.test(t)
}

export function looksPollutedDescription(value: string | null | undefined): boolean {
  const t = normalizeTextOrNull(value)
  if (!t) return false
  const lower = t.toLowerCase()
  if (lower.includes('street view')) return true
  if (lower.includes('directions')) return true
  if (lower.includes('source:')) return true
  if (lower.includes('for more information')) return true
  if (lower.includes('please visit us at')) return true
  if (lower.includes('click here')) return true
  if (lower.includes('see listing')) return true
  if (/(garagesalefinder\.com|yardsaletreasuremap\.com|craigslist\.org|estatesales\.net)/i.test(lower)) return true
  if (/\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\.?\s+\d{1,2}\/\d{1,2}/i.test(lower)) return true
  if (/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]\s*\d{1,2}\/\d{1,2}/i.test(lower)) return true
  if (/\bstart(?:s)?\s*time\s*:\s*\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(lower)) return true
  if (/\bstarts?\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(lower)) return true
  if (/\b\d{5}(?:-\d{4})?\s*,?\s*usa\b/i.test(lower)) return true
  if (/\b\d{3,6}\s+[a-z0-9.\-'\s]+,\s*[a-z.\-\s]+,\s*[a-z]{2}(?:\s+\d{5}(?:-\d{4})?)?\b/i.test(lower)) return true
  return false
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function addressAlreadyContainsCityState(address: string, city: string, state: string): boolean {
  const cityNorm = city.replace(/\s+/g, ' ').trim()
  const stateNorm = state.replace(/\s+/g, ' ').trim()
  if (!cityNorm || !stateNorm) return false

  const cityEsc = escapeRegExp(cityNorm)
  const optionalZip = '(?:\\s+\\d{5}(?:-\\d{4})?)?'
  const statePatterns = [escapeRegExp(stateNorm)]
  if (stateNorm.length === 2) {
    const full = uspsCodeToFullNameForAddress(stateNorm)
    if (full) statePatterns.push(escapeRegExp(full))
  }

  for (const stateEsc of statePatterns) {
    if (new RegExp(`${cityEsc}\\s*,\\s*${stateEsc}${optionalZip}`, 'i').test(address)) {
      return true
    }
  }
  return false
}

function normalizeAddressForPublishLocal(
  normalizedAddress: string | null,
  city: string,
  state: string
): string | null {
  const base = (normalizedAddress || '').replace(/\s+/g, ' ').trim()
  if (!base) return null
  const cityState = [city, state].map((v) => v.trim()).filter(Boolean).join(', ')
  if (!cityState) return base
  const suffixPattern = new RegExp(`(?:,\\s*${escapeRegExp(cityState)})+$`, 'i')
  const withoutDuplicateSuffix = base.replace(suffixPattern, '').replace(/\s*,\s*$/g, '').trim()
  if (!withoutDuplicateSuffix) return cityState
  if (addressAlreadyContainsCityState(withoutDuplicateSuffix, city, state)) {
    return withoutDuplicateSuffix
  }
  return `${withoutDuplicateSuffix}, ${cityState}`
}

export function normalizeAddressForPublishSafe(
  normalizedAddress: string | null,
  city: string,
  state: string
): string | null {
  return normalizeAddressForPublishLocal(normalizedAddress, city, state)
}

function displayAddressFingerprint(
  address: string | null,
  city: string | null,
  state: string | null
): string | null {
  const c = normalizeTextOrNull(city) ?? ''
  const s = normalizeTextOrNull(state) ?? ''
  const na = normalizeAddressForPublish(address, c, s)
  if (!na) return null
  try {
    validateResolvedAddressForPublish(na, c, s)
  } catch {
    return null
  }
  return formatAddressForPublishedSaleDisplay(na).toLowerCase().replace(/\s+/g, ' ').trim()
}

const MATERIAL_SYNC_CLASSES = new Set<ReconciliationChangeClass>([
  'description_changed',
  'images_changed',
  'schedule_changed',
  'placeholder_resolved',
])

export function reconciliationClassesAllowSafeSaleSync(classes: readonly ReconciliationChangeClass[]): boolean {
  return classes.some((c) => MATERIAL_SYNC_CLASSES.has(c))
}

export function fingerprintsDifferMaterially(a: IngestFingerprint, b: IngestFingerprint): boolean {
  return a.contentHash !== b.contentHash || a.scheduleHash !== b.scheduleHash || a.imageHash !== b.imageHash
}

/** True when normalized ingest line differs from the published sale display line (no raw strings in logs). */
export function computeIngestVsSaleAddressManualReview(params: {
  readonly ingestNormalizedAddress: string | null
  readonly ingestCity: string | null
  readonly ingestState: string | null
  readonly saleAddress: string | null
  readonly saleCity: string | null
  readonly saleState: string | null
}): boolean {
  const city = normalizeTextOrNull(params.saleCity) ?? normalizeTextOrNull(params.ingestCity) ?? ''
  const state = normalizeTextOrNull(params.saleState) ?? normalizeTextOrNull(params.ingestState) ?? ''
  if (!city || !state) return false
  const ingestLine = normalizeAddressForPublishSafe(params.ingestNormalizedAddress, city, state)
  if (!ingestLine) return false
  try {
    validateResolvedAddressForPublish(ingestLine, city, state)
  } catch {
    return false
  }
  const i = displayAddressFingerprint(ingestLine, city, state)
  const s = displayAddressFingerprint(params.saleAddress, city, state)
  if (!i || !s) return false
  return i !== s
}

function shouldApplyDescriptionUpdate(params: {
  readonly existing: string | null
  readonly next: string | null
  readonly classes: readonly ReconciliationChangeClass[]
}): boolean {
  const n = normalizeTextOrNull(params.next)
  if (!n) return false
  if (descriptionHasPlaceholderProse(n)) return false
  const e = normalizeTextOrNull(params.existing)

  if (params.classes.includes('placeholder_resolved')) return true

  if (!e) return true
  if (looksGenericDescription(e) || looksPollutedDescription(e)) {
    return n.length >= 40 || n.length >= e.length * 0.85
  }

  if (!params.classes.includes('description_changed')) return false

  if (e.length > 50 && n.length < e.length * 0.7) return false

  return n.length >= e.length || n.length - e.length >= 20
}

function shouldApplyTitleUpdate(
  existingTitle: string | null,
  nextTitle: string | null,
  city: string | null
): boolean {
  const nt = normalizeTextOrNull(nextTitle)
  if (!nt) return false
  if (looksGenericTitle(nt, city)) return false
  if (looksGenericTitle(existingTitle, city)) return true
  const et = normalizeTextOrNull(existingTitle)
  if (!et) return true
  if (nt.length >= et.length + 15) return true
  return false
}

type SaleRowForSync = {
  id: string
  ingested_sale_id: string | null
  title: string | null
  description: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  lat: number | null
  lng: number | null
  date_start: string | null
  date_end: string | null
  time_start: string | null
  time_end: string | null
  ends_at: string | null
  listing_timezone: string | null
  cover_image_url: string | null
  images: unknown
  moderation_status: string | null
}

export interface SafePublishedSaleSyncRunResult {
  readonly outcome: 'updated' | 'skipped' | 'failed'
  readonly skipReason?: string
  readonly shadowWouldUpdate: boolean
  readonly manualReviewAddress: boolean
  readonly titlesUpdated: boolean
  readonly descriptionsUpdated: boolean
  readonly imagesUpdated: boolean
  readonly schedulesUpdated: boolean
  readonly scheduleMutationInhibited?: boolean
  readonly scheduleMutationInhibitedReason?: string
  /** True after a successful Phase 2A schedule write when ingest row was aligned from `sales`. */
  readonly mirroredIngestSchedule?: boolean
  /** Sale row differed from canonical bundle while `schedule_changed` was absent. */
  readonly scheduleDriftFromBundle?: boolean
  readonly scheduleBundleReason?: string | null
}

/**
 * Merges resolved `listing_timezone` into ingest `raw_payload` for reconciliation bundle alignment.
 * Does not mutate the input object.
 */
export function mergeListingTimezoneIntoIngestRawPayload(
  rawPayload: unknown,
  listingTimezone: string | null | undefined
): unknown {
  const tz =
    typeof listingTimezone === 'string' && listingTimezone.trim().length > 0 ? listingTimezone.trim() : null
  if (tz == null) return rawPayload
  if (rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)) {
    return { ...(rawPayload as Record<string, unknown>), listing_timezone: tz }
  }
  return { listing_timezone: tz }
}

type SaleScheduleColumnsRow = {
  date_start: string | null
  date_end: string | null
  time_start: string | null
  time_end: string | null
  listing_timezone: string | null
}

/**
 * After Phase 2A updates `sales` schedule fields, copy them onto the linked `ingested_sales` row
 * so future bundles do not prefer stale ingest times. Returns whether the ingest update succeeded.
 */
export async function mirrorIngestScheduleFieldsFromPublishedSalePhase2A(
  admin: AdminDbForSaleEnds,
  params: { readonly ingestedSaleId: string; readonly saleId: string; readonly currentRawPayload: unknown }
): Promise<boolean> {
  const { data, error } = await fromBase(admin, 'sales')
    .select('date_start, date_end, time_start, time_end, listing_timezone')
    .eq('id', params.saleId)
    .maybeSingle()

  if (error || !data) {
    logger.warn('Phase 2A ingest schedule mirror skipped: sale reload failed', {
      component: 'reconciliation/syncPublishedSaleFromReconciledSource',
      operation: 'mirror_ingest_schedule_from_sale',
      saleId: params.saleId,
      rowId: params.ingestedSaleId,
      message: error?.message ?? 'no_row',
    })
    return false
  }

  const row = data as unknown as SaleScheduleColumnsRow
  const { error: upErr } = await fromBase(admin, 'ingested_sales')
    .update({
      date_start: row.date_start ?? null,
      date_end: row.date_end ?? null,
      time_start: row.time_start ?? null,
      time_end: row.time_end ?? null,
      raw_payload: mergeListingTimezoneIntoIngestRawPayload(params.currentRawPayload, row.listing_timezone),
    })
    .eq('id', params.ingestedSaleId)

  if (upErr) {
    logger.warn('Phase 2A ingest schedule mirror failed', {
      component: 'reconciliation/syncPublishedSaleFromReconciledSource',
      operation: 'mirror_ingest_schedule_from_sale',
      saleId: params.saleId,
      rowId: params.ingestedSaleId,
      message: upErr.message,
    })
    return false
  }

  return true
}

export function resolvePhase2aScheduleSyncGate(params: {
  readonly classes: readonly ReconciliationChangeClass[]
  readonly priorFingerprint: IngestFingerprint
  readonly nextFingerprint: IngestFingerprint
  readonly sale: SaleScheduleForBundleCompare
  readonly scheduleBundleResult: ReconciledScheduleBundleResult
}): {
  readonly scheduleGate: boolean
  readonly scheduleDriftFromBundle: boolean
  readonly scheduleBundleReason: string | null
} {
  const { classes, priorFingerprint, nextFingerprint, sale, scheduleBundleResult } = params
  const scheduleBundleReason = scheduleBundleResult.ok ? scheduleBundleResult.schedule_bundle_reason : null
  if (!scheduleBundleResult.ok) {
    return { scheduleGate: false, scheduleDriftFromBundle: false, scheduleBundleReason }
  }
  const hashScheduleChanged =
    classes.includes('schedule_changed') && priorFingerprint.scheduleHash !== nextFingerprint.scheduleHash
  const scheduleDriftFromBundle = saleScheduleDiffersFromCanonicalBundle(sale, scheduleBundleResult)
  const scheduleGate = hashScheduleChanged || scheduleDriftFromBundle
  return { scheduleGate, scheduleDriftFromBundle, scheduleBundleReason }
}

export async function buildSafePublishedSaleSyncPatch(params: {
  readonly admin: AdminDbForSaleEnds
  readonly sale: SaleRowForSync
  readonly snapshot: ParsedListingSnapshotForReconciliation
  readonly ingest: {
    readonly normalized_address: string | null
    readonly zip_code: string | null
    readonly lat: number | null
    readonly lng: number | null
    readonly time_start: string | null
    readonly time_end: string | null
    readonly raw_payload: unknown
    readonly image_source_url: string | null
  }
  readonly classes: readonly ReconciliationChangeClass[]
  readonly priorFingerprint: IngestFingerprint
  readonly nextFingerprint: IngestFingerprint
  readonly city: string | null
  readonly state: string | null
  readonly rowId: string
  readonly saleId: string
  readonly scheduleBundleResult: ReconciledScheduleBundleResult
}): Promise<{
  patch: Record<string, unknown>
  manualReviewAddress: boolean
  titlesUpdated: boolean
  descriptionsUpdated: boolean
  imagesUpdated: boolean
  schedulesUpdated: boolean
  scheduleMutationInhibited?: boolean
  scheduleMutationInhibitedReason?: string
  scheduleDriftFromBundle: boolean
  scheduleBundleReason: string | null
}> {
  const { sale, snapshot, ingest, classes, priorFingerprint, nextFingerprint, city, state, admin, rowId, saleId, scheduleBundleResult } =
    params

  const manualReviewAddress = computeIngestVsSaleAddressManualReview({
    ingestNormalizedAddress: ingest.normalized_address,
    ingestCity: city,
    ingestState: state,
    saleAddress: sale.address,
    saleCity: sale.city,
    saleState: sale.state,
  })

  const saleState = normalizeTextOrNull(sale.state) ?? normalizeTextOrNull(state) ?? ''

  const patch: Record<string, unknown> = {}
  let titlesUpdated = false
  let descriptionsUpdated = false
  let imagesUpdated = false
  let schedulesUpdated = false

  const rawPayloadForImages =
    typeof ingest.raw_payload === 'object' && ingest.raw_payload
      ? { ...(ingest.raw_payload as object), imageUrls: snapshot.imageUrls }
      : { imageUrls: snapshot.imageUrls }

  const imageCandidates = extractPublishImageCandidates(rawPayloadForImages, ingest.image_source_url)
  const sanitizedRaw = await sanitizeExternalImageUrls(imageCandidates, {
    rowId,
    city,
    state,
    max: MAX_IMPORTED_LISTING_IMAGES,
  })
  const sanitizedImages = sanitizedRaw

  if (classes.some((c) => c === 'images_changed' || c === 'placeholder_resolved') && sanitizedImages.length > 0) {
    const intent = computeImportedListingImageSyncIntent({
      sale: {
        cover_image_url: sale.cover_image_url,
        images: sale.images,
        description: sale.description,
      },
      sanitizedImages,
    })
    if (intent.kind === 'full') {
      patch.images = intent.images
      patch.cover_image_url = intent.cover_image_url
      imagesUpdated = true
    } else if (intent.kind === 'cover_only') {
      patch.cover_image_url = intent.cover_image_url
      imagesUpdated = true
    }
  }

  if (
    classes.some((c) => c === 'description_changed' || c === 'placeholder_resolved') &&
    shouldApplyDescriptionUpdate({
      existing: sale.description,
      next: snapshot.description,
      classes,
    })
  ) {
    patch.description = normalizeTextOrNull(snapshot.description)
    descriptionsUpdated = true
  }

  const titleClassGate = classes.some(
    (c) => c === 'placeholder_resolved' || c === 'description_changed' || c === 'images_changed'
  )
  if (
    titleClassGate &&
    shouldApplyTitleUpdate(sale.title, snapshot.title, city)
  ) {
    const t = normalizeTextOrNull(snapshot.title)
    if (t) {
      patch.title = t
      titlesUpdated = true
    }
  }

  const { scheduleGate, scheduleDriftFromBundle, scheduleBundleReason } = resolvePhase2aScheduleSyncGate({
    classes,
    priorFingerprint,
    nextFingerprint,
    sale: {
      date_start: sale.date_start,
      date_end: sale.date_end,
      time_start: sale.time_start,
      time_end: sale.time_end,
    },
    scheduleBundleResult,
  })

  let scheduleMutationInhibited: boolean | undefined
  let scheduleMutationInhibitedReason: string | undefined

  if (scheduleGate && scheduleBundleResult.ok) {
    const schedulePatchResult = await buildCanonicalLinkedSaleSchedulePatch({
      admin,
      refreshedDescription: snapshot.description,
      ingest: {
        date_start: ingest.date_start ?? null,
        date_end: ingest.date_end ?? null,
        time_start: ingest.time_start,
        time_end: ingest.time_end,
        raw_payload: ingest.raw_payload,
      },
      sale: {
        date_start: sale.date_start,
        date_end: sale.date_end,
        time_start: sale.time_start,
        time_end: sale.time_end,
      },
      parsed: snapshot,
      lat: Number(sale.lat ?? ingest.lat ?? NaN),
      lng: Number(sale.lng ?? ingest.lng ?? NaN),
      zip_code: normalizeTextOrNull(sale.zip_code) ?? normalizeTextOrNull(ingest.zip_code),
      state: saleState || null,
      rowId,
      saleId,
      operation: 'reconciliation_phase2a_safe_sync',
      skipWhenSaleMatchesBundle: false,
    })
    if (schedulePatchResult.schedulePatch) {
      Object.assign(patch, schedulePatchResult.schedulePatch)
      schedulesUpdated = true
    } else if (schedulePatchResult.scheduleMutationInhibited) {
      scheduleMutationInhibited = true
      scheduleMutationInhibitedReason = schedulePatchResult.scheduleMutationInhibitedReason
    }
  }

  return {
    patch,
    manualReviewAddress,
    titlesUpdated,
    descriptionsUpdated,
    imagesUpdated,
    schedulesUpdated,
    scheduleMutationInhibited,
    scheduleMutationInhibitedReason,
    scheduleDriftFromBundle,
    scheduleBundleReason,
  }
}

/**
 * Phase 2A: apply bounded, classification-gated updates to an existing published `sales` row
 * from a freshly parsed external snapshot. Never relocates address or coordinates.
 */
export async function tryApplySafePublishedSaleSyncFromReconciliation(
  admin: AdminDbForSaleEnds,
  ctx: {
    readonly saleId: string
    readonly ingestedSaleId: string
    readonly rowId: string
    readonly snapshot: ParsedListingSnapshotForReconciliation
    readonly ingest: {
      readonly normalized_address: string | null
      readonly zip_code: string | null
      readonly lat: number | null
      readonly lng: number | null
      readonly time_start: string | null
      readonly time_end: string | null
      readonly raw_payload: unknown
      readonly image_source_url: string | null
    }
    readonly classes: readonly ReconciliationChangeClass[]
    readonly priorFingerprint: IngestFingerprint
    readonly nextFingerprint: IngestFingerprint
    readonly city: string | null
    readonly state: string | null
    readonly dryRun: boolean
    readonly nowMs: number
    readonly scheduleBundleResult: ReconciledScheduleBundleResult
  }
): Promise<SafePublishedSaleSyncRunResult> {
  const { data, error } = await fromBase(admin, 'sales')
    .select(
      [
        'id',
        'ingested_sale_id',
        'title',
        'description',
        'address',
        'city',
        'state',
        'zip_code',
        'lat',
        'lng',
        'date_start',
        'date_end',
        'time_start',
        'time_end',
        'ends_at',
        'listing_timezone',
        'cover_image_url',
        'images',
        'moderation_status',
      ].join(', ')
    )
    .eq('id', ctx.saleId)
    .maybeSingle()

  if (error || !data) {
    logger.warn('Phase 2A sale sync skipped: load failed', {
      component: 'reconciliation/syncPublishedSaleFromReconciledSource',
      operation: 'safe_sale_sync',
      saleId: ctx.saleId,
      rowId: ctx.rowId,
      message: error?.message ?? 'no_row',
    })
    return {
      outcome: 'failed',
      skipReason: 'load_failed',
      shadowWouldUpdate: false,
      manualReviewAddress: false,
      titlesUpdated: false,
      descriptionsUpdated: false,
      imagesUpdated: false,
      schedulesUpdated: false,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: false,
      scheduleBundleReason: null,
    }
  }

  const sale = data as unknown as SaleRowForSync
  if (sale.ingested_sale_id !== ctx.ingestedSaleId) {
    return {
      outcome: 'skipped',
      skipReason: 'ingest_link_mismatch',
      shadowWouldUpdate: false,
      manualReviewAddress: false,
      titlesUpdated: false,
      descriptionsUpdated: false,
      imagesUpdated: false,
      schedulesUpdated: false,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: false,
      scheduleBundleReason: null,
    }
  }

  if (sale.moderation_status === 'hidden_by_admin') {
    return {
      outcome: 'skipped',
      skipReason: 'hidden_by_admin',
      shadowWouldUpdate: false,
      manualReviewAddress: false,
      titlesUpdated: false,
      descriptionsUpdated: false,
      imagesUpdated: false,
      schedulesUpdated: false,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: false,
      scheduleBundleReason: null,
    }
  }

  const phase2aScheduleGate = resolvePhase2aScheduleSyncGate({
    classes: ctx.classes,
    priorFingerprint: ctx.priorFingerprint,
    nextFingerprint: ctx.nextFingerprint,
    sale: {
      date_start: sale.date_start,
      date_end: sale.date_end,
      time_start: sale.time_start,
      time_end: sale.time_end,
    },
    scheduleBundleResult: ctx.scheduleBundleResult,
  })
  const allowScheduleDriftOnly = phase2aScheduleGate.scheduleDriftFromBundle

  if (!reconciliationClassesAllowSafeSaleSync(ctx.classes) && !allowScheduleDriftOnly) {
    return {
      outcome: 'skipped',
      skipReason: 'no_safe_class',
      shadowWouldUpdate: false,
      manualReviewAddress: false,
      titlesUpdated: false,
      descriptionsUpdated: false,
      imagesUpdated: false,
      schedulesUpdated: false,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: false,
      scheduleBundleReason: phase2aScheduleGate.scheduleBundleReason,
    }
  }

  if (
    !fingerprintsDifferMaterially(ctx.priorFingerprint, ctx.nextFingerprint) &&
    !allowScheduleDriftOnly
  ) {
    return {
      outcome: 'skipped',
      skipReason: 'no_hash_delta',
      shadowWouldUpdate: false,
      manualReviewAddress: false,
      titlesUpdated: false,
      descriptionsUpdated: false,
      imagesUpdated: false,
      schedulesUpdated: false,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: false,
      scheduleBundleReason: phase2aScheduleGate.scheduleBundleReason,
    }
  }

  const built = await buildSafePublishedSaleSyncPatch({
    admin,
    sale,
    snapshot: ctx.snapshot,
    ingest: ctx.ingest,
    classes: ctx.classes,
    priorFingerprint: ctx.priorFingerprint,
    nextFingerprint: ctx.nextFingerprint,
    city: ctx.city,
    state: ctx.state,
    rowId: ctx.rowId,
    saleId: ctx.saleId,
    scheduleBundleResult: ctx.scheduleBundleResult,
  })

  if (Object.keys(built.patch).length === 0) {
    return {
      outcome: 'skipped',
      skipReason: 'empty_patch',
      shadowWouldUpdate: false,
      manualReviewAddress: built.manualReviewAddress,
      titlesUpdated: false,
      descriptionsUpdated: false,
      imagesUpdated: false,
      schedulesUpdated: false,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: built.scheduleDriftFromBundle,
      scheduleBundleReason: built.scheduleBundleReason,
    }
  }

  built.patch.updated_at = new Date(ctx.nowMs).toISOString()

  if (ctx.dryRun) {
    return {
      outcome: 'skipped',
      skipReason: 'dry_run',
      shadowWouldUpdate: true,
      manualReviewAddress: built.manualReviewAddress,
      titlesUpdated: built.titlesUpdated,
      descriptionsUpdated: built.descriptionsUpdated,
      imagesUpdated: built.imagesUpdated,
      schedulesUpdated: built.schedulesUpdated,
      scheduleMutationInhibited: built.scheduleMutationInhibited,
      scheduleMutationInhibitedReason: built.scheduleMutationInhibitedReason,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: built.scheduleDriftFromBundle,
      scheduleBundleReason: built.scheduleBundleReason,
    }
  }

  const { error: upErr } = await fromBase(admin, 'sales').update(built.patch).eq('id', ctx.saleId)

  if (upErr) {
    logger.warn('Phase 2A sale sync failed', {
      component: 'reconciliation/syncPublishedSaleFromReconciledSource',
      operation: 'safe_sale_sync',
      saleId: ctx.saleId,
      rowId: ctx.rowId,
      message: upErr.message,
    })
    return {
      outcome: 'failed',
      skipReason: 'db_update_failed',
      shadowWouldUpdate: false,
      manualReviewAddress: built.manualReviewAddress,
      titlesUpdated: false,
      imagesUpdated: false,
      descriptionsUpdated: false,
      schedulesUpdated: false,
      mirroredIngestSchedule: false,
      scheduleDriftFromBundle: built.scheduleDriftFromBundle,
      scheduleBundleReason: built.scheduleBundleReason,
    }
  }

  let mirroredIngestSchedule = false
  if (built.schedulesUpdated && !built.scheduleMutationInhibited) {
    mirroredIngestSchedule = await mirrorIngestScheduleFieldsFromPublishedSalePhase2A(admin, {
      ingestedSaleId: ctx.ingestedSaleId,
      saleId: ctx.saleId,
      currentRawPayload: ctx.ingest.raw_payload,
    })
  }

  return {
    outcome: 'updated',
    shadowWouldUpdate: true,
    manualReviewAddress: built.manualReviewAddress,
    titlesUpdated: built.titlesUpdated,
    descriptionsUpdated: built.descriptionsUpdated,
    imagesUpdated: built.imagesUpdated,
    schedulesUpdated: built.schedulesUpdated,
    scheduleMutationInhibited: built.scheduleMutationInhibited,
    scheduleMutationInhibitedReason: built.scheduleMutationInhibitedReason,
    mirroredIngestSchedule,
    scheduleDriftFromBundle: built.scheduleDriftFromBundle,
    scheduleBundleReason: built.scheduleBundleReason,
  }
}
