export const GEOCODE_VARIANT_IDS = [
  'primary_full',
  'unit_stripped',
  'no_zip',
  'intersection_normalized',
  'municipality_fallback',
  'locality_metadata_only',
] as const

export type GeocodeVariantId = (typeof GEOCODE_VARIANT_IDS)[number]
