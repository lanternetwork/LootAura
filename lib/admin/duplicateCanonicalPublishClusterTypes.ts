export type DuplicateCanonicalPublishClusterRow = {
  ingestedSaleId: string
  publishedSaleId: string
  sourcePlatform: string
  sourceUrl: string
  city: string | null
  state: string | null
}

export type DuplicateCanonicalPublishCluster = {
  canonicalSaleInstanceKey: string
  publishedSaleCount: number
  rows: DuplicateCanonicalPublishClusterRow[]
}

type PublishedCanonicalRow = {
  ingestedSaleId: string
  publishedSaleId: string
  canonicalSaleInstanceKey: string
  sourcePlatform: string
  sourceUrl: string
  city: string | null
  state: string | null
}

/**
 * Groups published external ingested rows into clusters where one canonical key maps to multiple sales.
 */
export function groupDuplicateCanonicalPublishClusters(
  rows: PublishedCanonicalRow[]
): DuplicateCanonicalPublishCluster[] {
  const byKey = new Map<string, PublishedCanonicalRow[]>()
  for (const row of rows) {
    const list = byKey.get(row.canonicalSaleInstanceKey) ?? []
    list.push(row)
    byKey.set(row.canonicalSaleInstanceKey, list)
  }

  const clusters: DuplicateCanonicalPublishCluster[] = []
  for (const [canonicalSaleInstanceKey, members] of byKey) {
    const saleIds = new Set(members.map((m) => m.publishedSaleId))
    if (saleIds.size <= 1) continue
    clusters.push({
      canonicalSaleInstanceKey,
      publishedSaleCount: saleIds.size,
      rows: members.map((m) => ({
        ingestedSaleId: m.ingestedSaleId,
        publishedSaleId: m.publishedSaleId,
        sourcePlatform: m.sourcePlatform,
        sourceUrl: m.sourceUrl,
        city: m.city,
        state: m.state,
      })),
    })
  }

  return clusters.sort((a, b) => b.publishedSaleCount - a.publishedSaleCount)
}

/** Markdown for clipboard when remediating Workstream A clusters. */
export function formatDuplicateCanonicalClustersClipboard(
  clusters: DuplicateCanonicalPublishCluster[],
  generatedAt: string
): string {
  const lines = [
    '# Duplicate canonical publish clusters',
    `- generatedAt: ${generatedAt}`,
    `- clusterCount: ${clusters.length}`,
    '',
  ]
  for (const cluster of clusters) {
    lines.push(`## ${cluster.canonicalSaleInstanceKey}`)
    lines.push(`- publishedSaleCount: ${cluster.publishedSaleCount}`)
    for (const row of cluster.rows) {
      lines.push(
        `- ingested ${row.ingestedSaleId} → published ${row.publishedSaleId} (${row.sourcePlatform}) ${row.sourceUrl}`
      )
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
