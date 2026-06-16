import { diagnosticsBullet, formatDiagnosticsPct } from '@/lib/admin/diagnosticsMarkdown'
import type { SeoOperationalSnapshot } from '@/lib/seo/buildSeoOperationalSnapshot'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'

export type BuildSeoOperationalDiagnosticsInput = {
  snapshot: SeoOperationalSnapshot
  rolloutState: SeoRolloutRuntimeState
  metroCount: number
  inventoryLoadStatus: 'loaded' | 'loading' | 'error' | 'unavailable'
}

/**
 * Markdown for SEO operational readiness panel on /admin/ingestion.
 */
export function buildSeoOperationalDiagnostics(input: BuildSeoOperationalDiagnosticsInput): string {
  const { snapshot, rolloutState, metroCount, inventoryLoadStatus } = input
  const lines: string[] = [
    '## SEO operational readiness',
    diagnosticsBullet('generatedAt', snapshot.generatedAt),
    diagnosticsBullet('metro inventory load', inventoryLoadStatus),
    diagnosticsBullet('discovered metros', metroCount),
    diagnosticsBullet(
      'ops allowlist',
      snapshot.allowlist.indexingAllowed ? 'pass' : 'blocked'
    ),
    diagnosticsBullet('tier 1 ready', snapshot.allowlist.tier1Ready ? 'yes' : 'no'),
    diagnosticsBullet('tier 2 ready', snapshot.allowlist.tier2Ready ? 'yes' : 'no'),
    diagnosticsBullet(
      'index rollout',
      snapshot.rollout.indexingAllowed ? 'ready' : 'blocked'
    ),
    diagnosticsBullet(
      'public indexing enabled',
      rolloutState.publicIndexingEnabled ? 'yes' : 'no'
    ),
    diagnosticsBullet(
      'crawl validation attested',
      rolloutState.crawlValidationPassed ? 'yes' : 'no'
    ),
    diagnosticsBullet(
      'search console attested',
      rolloutState.searchConsoleValidationPassed ? 'yes' : 'no'
    ),
    diagnosticsBullet('indexed metros', snapshot.metrics.indexedMetros),
    diagnosticsBullet(
      'participating metros',
      snapshot.metroParticipation.participatingMetroSlugs.length
    ),
    diagnosticsBullet(
      'avg crawlable inventory',
      snapshot.metrics.crawlableInventoryPct != null
        ? formatDiagnosticsPct(snapshot.metrics.crawlableInventoryPct)
        : '—'
    ),
    diagnosticsBullet(
      'stale inventory share',
      snapshot.metrics.staleInventoryPct != null
        ? formatDiagnosticsPct(snapshot.metrics.staleInventoryPct)
        : '—'
    ),
    diagnosticsBullet(
      'canonical coverage',
      snapshot.metrics.canonicalCoveragePct != null
        ? `${snapshot.metrics.canonicalCoveragePct.toFixed(1)}%`
        : '—'
    ),
    diagnosticsBullet(
      'duplicate canonical clusters',
      snapshot.metrics.duplicateCanonicalClusters ?? '—'
    ),
    diagnosticsBullet(
      'duplicate visible clusters',
      snapshot.metrics.duplicateVisibleClusters ?? '—'
    ),
    diagnosticsBullet(
      'catalog repair queue',
      snapshot.metrics.catalogRepairQueue ?? '—'
    ),
    diagnosticsBullet('missing valid URLs', snapshot.metrics.missingValidUrls ?? '—'),
    diagnosticsBullet('sitemap listing URLs', snapshot.sitemap.listingUrlCount),
    diagnosticsBullet('sitemap city URLs', snapshot.sitemap.cityUrlCount),
    diagnosticsBullet('sitemap weekend URLs', snapshot.sitemap.weekendUrlCount),
    diagnosticsBullet('sitemap static URLs', snapshot.sitemap.staticUrlCount),
    diagnosticsBullet(
      'sitemap indexing enabled',
      snapshot.sitemap.indexingEnabled ? 'yes' : 'no'
    ),
  ]

  if (snapshot.rollout.blockers.length > 0) {
    lines.push('', '### Rollout blockers')
    for (const blocker of snapshot.rollout.blockers) {
      lines.push(diagnosticsBullet('blocker', blocker))
    }
  }

  if (snapshot.rollout.qualifiedMetroSlugs.length > 0) {
    lines.push(
      '',
      diagnosticsBullet(
        'qualified metros for index rollout',
        snapshot.rollout.qualifiedMetroSlugs.join(', ')
      )
    )
  }

  const qualifiedCount = snapshot.metroQualification.filter((m) => m.qualified).length
  if (qualifiedCount > 0) {
    lines.push(
      diagnosticsBullet('metro qualification pass count', qualifiedCount)
    )
  }

  return lines.join('\n')
}
