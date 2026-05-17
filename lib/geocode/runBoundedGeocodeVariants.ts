import { geocodeAddress, type GeocodeAddressOutcome } from '@/lib/geocode/geocodeAddress'
import { buildGeocodeVariantSequence } from '@/lib/geocode/buildGeocodeVariantSequence'
import type { GeocodeVariantId } from '@/lib/geocode/geocodeVariantIds'
import {
  isAcceptablePublishableMatch,
  isCoordinatePrecisionPublishable,
  MAX_PROVIDER_CALLS_PER_GEOCODE_CLAIM,
  precisionRank,
  type CoordinatePrecision,
  type GeocodeConfidence,
  type GeocodeMethod,
} from '@/lib/geocode/geocodePrecisionPolicy'
import { structuredReasonFromGeocodeOutcome } from '@/lib/geocode/geocodeRetryReasons'
import type { GeocodeAttemptPlan } from '@/lib/ingestion/geocodeAttemptPlan'
import type { GeocodeAttemptDiagnostic } from '@/lib/ingestion/geocodeWorker'

export type GeocodeVariantAttemptDiagnostic = GeocodeAttemptDiagnostic & {
  variantId: GeocodeVariantId
  structuredReason?: string
}

export type BoundedGeocodeVariantsResult = {
  providerCalls: number
  variantBudgetExhausted: boolean
  diagnostics: GeocodeVariantAttemptDiagnostic[]
  /** Set when a publishable match is found. */
  publishable?: {
    coords: { lat: number; lng: number }
    coordinatePrecision: CoordinatePrecision
    geocodeConfidence: GeocodeConfidence
    geocodeMethod: GeocodeMethod
    outcome: GeocodeAddressOutcome
  }
  /** Locality probe metadata (never publishable in D2). */
  localityMetadataOnly?: {
    coordinatePrecision: CoordinatePrecision
    geocodeConfidence: GeocodeConfidence
    geocodeMethod: GeocodeMethod
    queryFingerprint?: string
  }
  /** Last provider outcome for failure persistence. */
  lastOutcome: GeocodeAddressOutcome | null
  lastStructuredReason: string
}

function toVariantDiagnostic(
  plan: GeocodeAttemptPlan,
  variantId: GeocodeVariantId,
  geo: GeocodeAddressOutcome,
  spec: {
    municipalitySource: string
    fallbackArbitrationApplied: boolean
    diagnosticStrategy: string
  }
): GeocodeVariantAttemptDiagnostic {
  const rawQs = geo.attemptLog?.queryString
  const queryCharLength =
    typeof rawQs === 'string' && rawQs.length > 0 ? rawQs.length : undefined
  let resultType: GeocodeVariantAttemptDiagnostic['resultType'] = 'empty_results'
  if (geo.coords) resultType = 'success'
  else if (geo.hit429) resultType = 'rate_limited'
  else if (geo.noCoordsReason === 'low_confidence') resultType = 'low_confidence'
  else if (geo.noCoordsReason === 'empty_input') resultType = 'empty_input'
  else if (geo.noCoordsReason === 'fetch_exception') resultType = 'fetch_exception'
  else if (geo.noCoordsReason === 'http_not_ok') resultType = 'http_error'
  else if (geo.noCoordsReason === 'invalid_coordinates') resultType = 'invalid_coordinates'
  else if (geo.noCoordsReason === 'empty_results') resultType = 'empty_results'

  return {
    variantId,
    strategy: spec.diagnosticStrategy as GeocodeVariantAttemptDiagnostic['strategy'],
    queryStrategy:
      geo.attemptLog?.queryStrategy ?? (variantId === 'municipality_fallback' ? 'normalize_locality' : 'minimal_locality'),
    addressSource: plan.addressLineSource,
    municipalitySource: spec.municipalitySource,
    fallbackArbitrationApplied: spec.fallbackArbitrationApplied,
    queryCharLength,
    queryFingerprint: geo.queryFingerprint,
    resultType,
    structuredReason: structuredReasonFromGeocodeOutcome({
      noCoordsReason: geo.noCoordsReason,
      hit429: geo.hit429,
      providerClassification: geo.providerClassification,
      lowConfidenceReasons: geo.lowConfidenceReasons,
    }),
  }
}

export async function runBoundedGeocodeVariants(plan: GeocodeAttemptPlan): Promise<BoundedGeocodeVariantsResult> {
  const sequence = buildGeocodeVariantSequence(plan)
  const diagnostics: GeocodeVariantAttemptDiagnostic[] = []
  let providerCalls = 0
  let lastOutcome: GeocodeAddressOutcome | null = null
  let lastStructuredReason = 'provider_empty_results'
  let bestPublishable: BoundedGeocodeVariantsResult['publishable'] | undefined
  let localityMetadataOnly: BoundedGeocodeVariantsResult['localityMetadataOnly'] | undefined

  for (const spec of sequence) {
    if (providerCalls >= MAX_PROVIDER_CALLS_PER_GEOCODE_CLAIM) {
      lastStructuredReason = 'variant_budget_exhausted'
      break
    }

    if (!spec.city.trim() || !plan.state.trim()) continue
    if (spec.variantId !== 'locality_metadata_only' && !spec.addressLine.trim()) continue

    providerCalls += 1
    const geo = await geocodeAddress(
      { address: spec.addressLine, city: spec.city, state: plan.state },
      { mode: spec.mode, classificationMode: spec.classificationMode }
    )
    lastOutcome = geo
    diagnostics.push(
      toVariantDiagnostic(plan, spec.variantId, geo, {
        municipalitySource: spec.municipalitySource,
        fallbackArbitrationApplied: spec.fallbackArbitrationApplied,
        diagnosticStrategy: spec.diagnosticStrategy,
      })
    )

    if (geo.hit429) {
      lastStructuredReason = 'provider_rate_limited'
      break
    }

    if (!geo.coords) {
      lastStructuredReason = structuredReasonFromGeocodeOutcome({
        noCoordsReason: geo.noCoordsReason,
        hit429: geo.hit429,
        providerClassification: geo.providerClassification,
        lowConfidenceReasons: geo.lowConfidenceReasons,
      })
      continue
    }

    const precision = geo.coordinatePrecision ?? 'exact_address'
    if (!isCoordinatePrecisionPublishable(precision)) {
      if (spec.variantId === 'locality_metadata_only') {
        localityMetadataOnly = {
          coordinatePrecision: precision,
          geocodeConfidence: geo.geocodeConfidence ?? 'low',
          geocodeMethod: geo.geocodeMethod ?? 'nominatim_locality',
          queryFingerprint: geo.queryFingerprint,
        }
        lastStructuredReason = 'broad_locality_match'
      }
      continue
    }

    if (!isAcceptablePublishableMatch(precision)) {
      continue
    }

    const candidate = {
      coords: geo.coords,
      coordinatePrecision: precision,
      geocodeConfidence: geo.geocodeConfidence ?? 'high',
      geocodeMethod: geo.geocodeMethod ?? 'nominatim_exact',
      outcome: geo,
    }

    if (
      !bestPublishable ||
      precisionRank(precision) < precisionRank(bestPublishable.coordinatePrecision)
    ) {
      bestPublishable = candidate
    }

    if (precision === 'exact_address') {
      break
    }
  }

  if (providerCalls >= MAX_PROVIDER_CALLS_PER_GEOCODE_CLAIM && !bestPublishable) {
    lastStructuredReason = 'variant_budget_exhausted'
  }

  return {
    providerCalls,
    variantBudgetExhausted: providerCalls >= MAX_PROVIDER_CALLS_PER_GEOCODE_CLAIM && !bestPublishable,
    diagnostics,
    publishable: bestPublishable,
    localityMetadataOnly,
    lastOutcome,
    lastStructuredReason,
  }
}
