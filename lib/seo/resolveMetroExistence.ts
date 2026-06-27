export type MetroExistenceResult = {
  exists: boolean
  /** @deprecated use qualifiedOverride */
  seededMajor: boolean
  qualifiedOverride: boolean
  inventoryDbCount: number
  historicalCount90d: number
}

/**
 * Existence resolution priority (METRO_GEOGRAPHY_UNIFICATION_V1.1):
 * qualified_override → inventory DB count → historical 90d → not found
 */
export function resolveMetroExistence(options: {
  slug: string
  inventoryDbCount: number
  historicalCount90d: number
  qualifiedOverride?: boolean
}): MetroExistenceResult {
  const qualifiedOverride = options.qualifiedOverride ?? false
  const exists =
    qualifiedOverride || options.inventoryDbCount > 0 || options.historicalCount90d > 0

  return {
    exists,
    seededMajor: qualifiedOverride,
    qualifiedOverride,
    inventoryDbCount: options.inventoryDbCount,
    historicalCount90d: options.historicalCount90d,
  }
}
