import { getAdminDb, fromBase } from '@/lib/supabase/clients'

export type NeedsCheckBreakdownPair = {
  addressStatus: string
  coordinatePrecision: string
  count: number
}

export type NeedsCheckBreakdown = {
  total: number
  scanned: number
  byAddressStatus: Record<string, number>
  byCoordinatePrecision: Record<string, number>
  topPairs: NeedsCheckBreakdownPair[]
}

const UNKNOWN = '(null)'

function bucketKey(value: string | null | undefined): string {
  if (value == null || value === '') return UNKNOWN
  return value
}

/**
 * Aggregate `needs_check` rows by address_status and coordinate_precision for operator triage.
 * Scans all matching rows (paginated) — typical backlog is a few hundred rows.
 */
export async function countNeedsCheckBreakdown(): Promise<NeedsCheckBreakdown> {
  const admin = getAdminDb()
  const pageSize = 1000
  let from = 0
  const byAddressStatus: Record<string, number> = {}
  const byCoordinatePrecision: Record<string, number> = {}
  const pairCounts = new Map<string, NeedsCheckBreakdownPair>()
  let scanned = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('address_status, coordinate_precision')
      .eq('status', 'needs_check')
      .range(from, from + pageSize - 1)

    if (error) {
      throw new Error(error.message)
    }

    const chunk = (Array.isArray(data) ? data : []) as Array<{
      address_status: string | null
      coordinate_precision: string | null
    }>

    for (const row of chunk) {
      scanned += 1
      const addressStatus = bucketKey(row.address_status)
      const coordinatePrecision = bucketKey(row.coordinate_precision)
      byAddressStatus[addressStatus] = (byAddressStatus[addressStatus] ?? 0) + 1
      byCoordinatePrecision[coordinatePrecision] =
        (byCoordinatePrecision[coordinatePrecision] ?? 0) + 1
      const pairKey = `${addressStatus}\0${coordinatePrecision}`
      const existing = pairCounts.get(pairKey)
      if (existing) {
        existing.count += 1
      } else {
        pairCounts.set(pairKey, { addressStatus, coordinatePrecision, count: 1 })
      }
    }

    if (chunk.length < pageSize) {
      break
    }
    from += pageSize
  }

  const topPairs = [...pairCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  return {
    total: scanned,
    scanned,
    byAddressStatus,
    byCoordinatePrecision,
    topPairs,
  }
}
