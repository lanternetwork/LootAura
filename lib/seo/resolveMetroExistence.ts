import {
  getSeededMajorMetroBySlug,
  isSeededMajorMetroSlug,
} from '@/lib/seo/seededMajorMetros'

export type MetroExistenceResult = {
  exists: boolean
  seededMajor: boolean
  inventoryDbCount: number
  historicalCount90d: number
}

/**
 * Existence resolution priority (CITY_PAGE_COVERAGE_V2.1):
 * seeded_major → inventory DB count → historical 90d → not found
 */
export function resolveMetroExistence(options: {
  slug: string
  inventoryDbCount: number
  historicalCount90d: number
}): MetroExistenceResult {
  const seededMajor = isSeededMajorMetroSlug(options.slug)
  const exists =
    seededMajor || options.inventoryDbCount > 0 || options.historicalCount90d > 0

  return {
    exists,
    seededMajor,
    inventoryDbCount: options.inventoryDbCount,
    historicalCount90d: options.historicalCount90d,
  }
}

export function getSeededMetroForSlug(slug: string) {
  return getSeededMajorMetroBySlug(slug)
}
