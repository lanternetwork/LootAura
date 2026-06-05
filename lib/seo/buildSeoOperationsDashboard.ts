import type { CrawlSmokeReport } from '@/lib/seo/crawlSmoke'
import type { SeoOperationalSnapshot } from '@/lib/seo/buildSeoOperationalSnapshot'
import { getSeoBaseUrl } from '@/lib/seo/constants'
import { resolveListingIndexRobots } from '@/lib/seo/indexRollout'
import { resolveSeoSitemapPlan } from '@/lib/seo/sitemap/resolveSitemapPlan'
import type { SeoRolloutRuntimeState } from '@/lib/seo/seoRolloutTypes'
import type {
  SeoCanonicalSummary,
  SeoHealthBlocker,
  SeoHealthState,
  SeoIndexabilitySummary,
  SeoInternalLinkSample,
  SeoListingFootprint,
  SeoOperationsDashboard,
  SeoSitemapDiagnostics,
} from '@/lib/seo/seoOperationsDashboardTypes'

const SEO_CANONICAL_FALLBACK = 'https://lootaura.app'

export function deriveSeoHealthState(snapshot: SeoOperationalSnapshot): SeoHealthState {
  if (snapshot.rollout.indexingAllowed) {
    return 'READY'
  }
  if (!snapshot.allowlist.indexingAllowed) {
    return 'BLOCKED'
  }
  return 'ACTION_REQUIRED'
}

export function buildSeoHealthBlockers(snapshot: SeoOperationalSnapshot): SeoHealthBlocker[] {
  const blockers: SeoHealthBlocker[] = []
  const seen = new Set<string>()

  for (const text of snapshot.allowlist.blockers) {
    const key = `ingestion:${text}`
    if (!seen.has(key)) {
      seen.add(key)
      blockers.push({ source: 'ingestion', text })
    }
  }

  for (const text of snapshot.rollout.blockers) {
    const source: SeoHealthBlocker['source'] =
      text.toLowerCase().includes('metro') || text.toLowerCase().includes('qualified')
        ? 'metro'
        : 'rollout'
    const key = `${source}:${text}`
    if (!seen.has(key)) {
      seen.add(key)
      blockers.push({ source, text })
    }
  }

  return blockers
}

export function buildCanonicalSummary(
  configuredEnv: string | null | undefined
): SeoCanonicalSummary {
  const trimmed = configuredEnv?.trim() || null
  const effectiveCanonical = getSeoBaseUrl()
  const usingFallback = !trimmed

  return {
    configuredEnv: trimmed,
    effectiveCanonical,
    usingFallback,
    fallbackUrl: SEO_CANONICAL_FALLBACK,
  }
}

export function buildIndexabilitySummary(
  snapshot: SeoOperationalSnapshot,
  rolloutState: SeoRolloutRuntimeState
): SeoIndexabilitySummary {
  const listingRobots = resolveListingIndexRobots(rolloutState)
  const qualifiedMetroCount = snapshot.metroParticipation.participatingMetroSlugs.length
  const totalMetroCount = snapshot.metroParticipation.rows.length
  const blockedMetroCount = totalMetroCount - qualifiedMetroCount
  const defaultDirective = listingRobots.index ? 'index,follow' : 'noindex,follow'

  return {
    listings: listingRobots.index ? 'INDEX' : 'NOINDEX',
    qualifiedMetroCount,
    blockedMetroCount,
    totalMetroCount,
    defaultDirective,
  }
}

export function buildListingFootprint(
  publishedCount: number,
  indexingAllowed: boolean
): SeoListingFootprint {
  if (indexingAllowed) {
    return {
      published: publishedCount,
      indexable: publishedCount,
      noindex: 0,
    }
  }
  return {
    published: publishedCount,
    indexable: 0,
    noindex: publishedCount,
  }
}

export function buildSitemapDiagnostics(
  snapshot: SeoOperationalSnapshot,
  rolloutState: SeoRolloutRuntimeState,
  publishedCount: number
): SeoSitemapDiagnostics {
  const baseUrl = getSeoBaseUrl()
  const plan = resolveSeoSitemapPlan(publishedCount, rolloutState)

  return {
    sitemapUrl: `${baseUrl}/sitemap.xml`,
    indexingEnabled: plan.indexingEnabled,
    segments: plan.segmentIds.map(String),
    staticUrlCount: snapshot.sitemap.staticUrlCount,
    listingUrlCount: snapshot.sitemap.listingUrlCount,
    cityUrlCount: snapshot.sitemap.cityUrlCount,
    weekendUrlCount: snapshot.sitemap.weekendUrlCount,
  }
}

export function emptyInternalLinkSample(): SeoInternalLinkSample {
  return {
    sampleSize: 0,
    listingsWithCityLink: 0,
    listingsWithWeekendLink: 0,
    nearbySaleLinks: 0,
    nearbySampleSize: 0,
    label: 'Sample estimate (0 listings)',
  }
}

export function buildSeoOperationsDashboard(options: {
  snapshot: SeoOperationalSnapshot
  rolloutState: SeoRolloutRuntimeState
  publishedListingCount: number
  configuredSiteUrl?: string | null
  internalLinks?: SeoInternalLinkSample
  crawlSmoke?: CrawlSmokeReport | null
}): SeoOperationsDashboard {
  const {
    snapshot,
    rolloutState,
    publishedListingCount,
    configuredSiteUrl,
    internalLinks = emptyInternalLinkSample(),
    crawlSmoke = null,
  } = options

  return {
    generatedAt: new Date().toISOString(),
    health: deriveSeoHealthState(snapshot),
    blockers: buildSeoHealthBlockers(snapshot),
    rolloutState,
    canonical: buildCanonicalSummary(configuredSiteUrl),
    indexability: buildIndexabilitySummary(snapshot, rolloutState),
    listingFootprint: buildListingFootprint(
      publishedListingCount,
      snapshot.rollout.indexingAllowed
    ),
    sitemap: buildSitemapDiagnostics(snapshot, rolloutState, publishedListingCount),
    internalLinks,
    snapshot,
    crawlSmoke,
  }
}

export function formatSeoDiagnosticsText(dashboard: SeoOperationsDashboard): string {
  const lines: string[] = [
    `SEO HEALTH: ${dashboard.health}`,
    '',
  ]

  if (dashboard.blockers.length > 0) {
    lines.push('Blockers:')
    for (const blocker of dashboard.blockers) {
      lines.push(`- [${blocker.source}] ${blocker.text}`)
    }
    lines.push('')
  }

  lines.push('Rollout:')
  lines.push(`- Public Indexing: ${dashboard.rolloutState.publicIndexingEnabled}`)
  lines.push(`- Crawl Validation: ${dashboard.rolloutState.crawlValidationPassed}`)
  lines.push(
    `- Search Console Validation: ${dashboard.rolloutState.searchConsoleValidationPassed}`
  )
  if (dashboard.rolloutState.crawlValidationPassedAt) {
    lines.push(`- Crawl attested at: ${dashboard.rolloutState.crawlValidationPassedAt}`)
  }
  lines.push('')

  lines.push('Canonical:')
  lines.push(`- Configured env: ${dashboard.canonical.configuredEnv ?? '(not set)'}`)
  lines.push(`- Effective: ${dashboard.canonical.effectiveCanonical}`)
  if (dashboard.canonical.usingFallback) {
    lines.push(`- WARNING: Fallback canonical in use (${dashboard.canonical.fallbackUrl})`)
  }
  lines.push('')

  lines.push('Indexability:')
  lines.push(`- Listings: ${dashboard.indexability.listings}`)
  lines.push(
    `- Metro Pages: ${dashboard.indexability.qualifiedMetroCount} qualified → INDEX · ${dashboard.indexability.blockedMetroCount} blocked → NOINDEX`
  )
  lines.push(`- Weekend Pages: same qualification as Metro Pages`)
  lines.push(`- Default directive: ${dashboard.indexability.defaultDirective}`)
  lines.push('')

  lines.push('Sitemap:')
  lines.push(`- URL: ${dashboard.sitemap.sitemapUrl}`)
  lines.push(`- Indexing enabled: ${dashboard.sitemap.indexingEnabled ? 'yes' : 'no'}`)
  lines.push(`- Segments: ${dashboard.sitemap.segments.join(', ')}`)
  lines.push(`- Static URLs: ${dashboard.sitemap.staticUrlCount}`)
  lines.push(`- Listings: ${dashboard.sitemap.listingUrlCount}`)
  lines.push(`- Metros: ${dashboard.sitemap.cityUrlCount}`)
  lines.push(`- Weekends: ${dashboard.sitemap.weekendUrlCount}`)
  lines.push('')

  lines.push('Metro Coverage:')
  lines.push(`- Total: ${dashboard.indexability.totalMetroCount}`)
  lines.push(`- Qualified: ${dashboard.indexability.qualifiedMetroCount}`)
  lines.push(`- Blocked: ${dashboard.indexability.blockedMetroCount}`)
  lines.push('')

  lines.push('Listings:')
  lines.push(`- Published: ${dashboard.listingFootprint.published}`)
  lines.push(`- Indexable: ${dashboard.listingFootprint.indexable}`)
  lines.push(`- Noindex: ${dashboard.listingFootprint.noindex}`)
  lines.push('')

  lines.push('Internal Links (sample):')
  lines.push(`- ${dashboard.internalLinks.label}`)
  lines.push(`- Listings → City links: ${dashboard.internalLinks.listingsWithCityLink}`)
  lines.push(`- Listings → Weekend links: ${dashboard.internalLinks.listingsWithWeekendLink}`)
  lines.push(`- Nearby sale links: ${dashboard.internalLinks.nearbySaleLinks}`)
  lines.push('')

  if (dashboard.crawlSmoke) {
    lines.push('Crawl Smoke:')
    lines.push(`- ${dashboard.crawlSmoke.passed ? 'PASS' : 'FAIL'}`)
    lines.push(`- Run at: ${dashboard.crawlSmoke.generatedAt}`)
    const failed = dashboard.crawlSmoke.checks.filter((c) => !c.pass)
    if (failed.length > 0) {
      lines.push('- Failed checks:')
      for (const check of failed) {
        lines.push(`  - ${check.label}: ${check.detail}`)
      }
    }
  } else {
    lines.push('Crawl Smoke:')
    lines.push('- Not run (use Run crawl smoke on dashboard)')
  }

  return lines.join('\n')
}
