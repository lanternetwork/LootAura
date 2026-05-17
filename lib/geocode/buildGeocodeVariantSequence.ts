import {
  primaryAndFallbackCitiesEquivalent,
  type GeocodeAttemptPlan,
} from '@/lib/ingestion/geocodeAttemptPlan'
import { stripUnitDesignatorFromAddressLineForGeocode } from '@/lib/geocode/stripUnitDesignatorForGeocode'
import type { GeocodeVariantId } from '@/lib/geocode/geocodeVariantIds'
import {
  hasUsZipInAddressLine,
  isIntersectionOrHighwayLine,
  normalizeGeocodeAddressLine,
  stripZipFromAddressLine,
} from '@/lib/geocode/normalizeGeocodeAddress'
import type { GeocodeMode } from '@/lib/geocode/geocodeAddress'

export type GeocodeVariantSpec = {
  variantId: GeocodeVariantId
  addressLine: string
  city: string
  mode: GeocodeMode
  municipalitySource: string
  fallbackArbitrationApplied: boolean
  classificationMode: 'strict' | 'allow_broad_locality'
  diagnosticStrategy: string
}

export function buildGeocodeVariantSequence(plan: GeocodeAttemptPlan): GeocodeVariantSpec[] {
  const base = normalizeGeocodeAddressLine(plan.addressLine)
  if (!base || !plan.state.trim()) return []

  const out: GeocodeVariantSpec[] = []

  const push = (spec: GeocodeVariantSpec) => {
    const key = `${spec.variantId}|${spec.addressLine}|${spec.city}|${spec.mode}`
    if (out.some((x) => `${x.variantId}|${x.addressLine}|${x.city}|${x.mode}` === key)) return
    out.push(spec)
  }

  push({
    variantId: 'primary_full',
    addressLine: base,
    city: plan.primaryCity,
    mode: 'primary',
    municipalitySource: plan.primaryMunicipalitySource,
    fallbackArbitrationApplied: false,
    classificationMode: 'strict',
    diagnosticStrategy: 'primary_full',
  })

  const stripped = stripUnitDesignatorFromAddressLineForGeocode(base)
  if (stripped) {
    push({
      variantId: 'unit_stripped',
      addressLine: normalizeGeocodeAddressLine(stripped),
      city: plan.primaryCity,
      mode: 'primary',
      municipalitySource: plan.primaryMunicipalitySource,
      fallbackArbitrationApplied: false,
      classificationMode: 'strict',
      diagnosticStrategy: 'unit_stripped',
    })
  }

  if (hasUsZipInAddressLine(base, plan.state)) {
    const noZip = stripZipFromAddressLine(base, plan.state)
    if (noZip) {
      push({
        variantId: 'no_zip',
        addressLine: normalizeGeocodeAddressLine(noZip),
        city: plan.primaryCity,
        mode: 'primary',
        municipalitySource: plan.primaryMunicipalitySource,
        fallbackArbitrationApplied: false,
        classificationMode: 'strict',
        diagnosticStrategy: 'no_zip',
      })
    }
  }

  if (isIntersectionOrHighwayLine(base)) {
    const intersectionLine = normalizeGeocodeAddressLine(base)
    push({
      variantId: 'intersection_normalized',
      addressLine: intersectionLine,
      city: plan.primaryCity,
      mode: 'primary',
      municipalitySource: plan.primaryMunicipalitySource,
      fallbackArbitrationApplied: false,
      classificationMode: 'strict',
      diagnosticStrategy: 'intersection_normalized',
    })
  }

  if (
    plan.fallbackCity &&
    !primaryAndFallbackCitiesEquivalent(plan.primaryCity, plan.fallbackCity)
  ) {
    push({
      variantId: 'municipality_fallback',
      addressLine: base,
      city: plan.fallbackCity,
      mode: 'fallback_arbitrated',
      municipalitySource: plan.fallbackMunicipalitySource,
      fallbackArbitrationApplied: true,
      classificationMode: 'strict',
      diagnosticStrategy: 'municipality_fallback',
    })
  }

  push({
    variantId: 'locality_metadata_only',
    addressLine: '',
    city: plan.fallbackCity || plan.primaryCity,
    mode: 'fallback_arbitrated',
    municipalitySource: plan.fallbackMunicipalitySource,
    fallbackArbitrationApplied: Boolean(plan.fallbackCity),
    classificationMode: 'allow_broad_locality',
    diagnosticStrategy: 'locality_metadata_only',
  })

  return out
}
