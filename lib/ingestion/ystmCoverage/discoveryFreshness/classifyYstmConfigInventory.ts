export type YstmConfigInventoryClass = 'ACTIVE' | 'LOW_ACTIVITY' | 'DORMANT' | 'DEAD'

export type YstmConfigInventorySnapshot = {
  configKey: string
  inventoryClass: YstmConfigInventoryClass
  lastListingSeenAt: string | null
  listingsSeen30d: number
  listingsSeen90d: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function classifyYstmConfigInventory(params: {
  lastListingSeenAt: string | null
  nowMs?: number
}): YstmConfigInventoryClass {
  const nowMs = params.nowMs ?? Date.now()
  const lastSeenMs = params.lastListingSeenAt ? Date.parse(params.lastListingSeenAt) : NaN
  if (!Number.isFinite(lastSeenMs)) {
    return 'DEAD'
  }
  const daysSince = (nowMs - lastSeenMs) / MS_PER_DAY
  if (daysSince <= 30) return 'ACTIVE'
  if (daysSince <= 90) return 'LOW_ACTIVITY'
  if (daysSince <= 180) return 'DORMANT'
  return 'DEAD'
}

export function summarizeYstmConfigInventoryClasses(
  snapshots: readonly YstmConfigInventorySnapshot[]
): Record<YstmConfigInventoryClass, number> {
  const counts: Record<YstmConfigInventoryClass, number> = {
    ACTIVE: 0,
    LOW_ACTIVITY: 0,
    DORMANT: 0,
    DEAD: 0,
  }
  for (const snap of snapshots) {
    counts[snap.inventoryClass] += 1
  }
  return counts
}

export type YstmVelocityPool = 'HOT' | 'WARM' | 'COLD'

export function recommendYstmVelocityPool(params: {
  inventoryClass: YstmConfigInventoryClass
  listingsPerDay: number
}): YstmVelocityPool {
  if (params.inventoryClass === 'DEAD' || params.inventoryClass === 'DORMANT') {
    return 'COLD'
  }
  if (params.listingsPerDay >= 5) return 'HOT'
  if (params.listingsPerDay >= 1) return 'WARM'
  return 'COLD'
}

export function velocityPoolWeight(pool: YstmVelocityPool): number {
  switch (pool) {
    case 'HOT':
      return 4
    case 'WARM':
      return 2
    case 'COLD':
      return 1
  }
}

export function computeInventoryConcentrationThresholds(
  configs: readonly { configKey: string; listingsPerWeek: number }[]
): {
  configsFor50PctListings: number
  configsFor80PctListings: number
  configsFor95PctListings: number
  zeroYieldConfigCount: number
} {
  const sorted = [...configs].sort((a, b) => b.listingsPerWeek - a.listingsPerWeek)
  const total = sorted.reduce((sum, row) => sum + row.listingsPerWeek, 0)
  if (total <= 0) {
    return {
      configsFor50PctListings: 0,
      configsFor80PctListings: 0,
      configsFor95PctListings: 0,
      zeroYieldConfigCount: sorted.length,
    }
  }

  const countForShare = (share: number): number => {
    let cumulative = 0
    for (let i = 0; i < sorted.length; i += 1) {
      cumulative += sorted[i]!.listingsPerWeek
      if (cumulative / total >= share) {
        return i + 1
      }
    }
    return sorted.length
  }

  return {
    configsFor50PctListings: countForShare(0.5),
    configsFor80PctListings: countForShare(0.8),
    configsFor95PctListings: countForShare(0.95),
    zeroYieldConfigCount: sorted.filter((row) => row.listingsPerWeek <= 0).length,
  }
}
