import type { NextRequest } from 'next/server'
import { GET as getIngestionMetrics } from '@/app/api/admin/ingestion/metrics/route'
import { GET as getYstmCoverage } from '@/app/api/admin/ingestion/ystm-coverage/route'
import type { IngestionMetricsResponse } from '@/lib/admin/ingestionMetricsTypes'
import type { YstmCoverageMetricsResponse } from '@/lib/admin/ystmCoverageMetricsTypes'
import { buildSeoOperationalSnapshot } from '@/lib/seo/buildSeoOperationalSnapshot'
import { buildSeoOperationsDashboard } from '@/lib/seo/buildSeoOperationsDashboard'
import type {
  SeoInternalLinkSample,
  SeoOperationsDashboard,
} from '@/lib/seo/seoOperationsDashboardTypes'
import { runSeoCrawlSmokeChecks, type CrawlSmokeReport } from '@/lib/seo/crawlSmoke'
import { fetchNationwideSeoMetroInventory } from '@/lib/seo/fetchAllSeoMetroInventory'
import {
  buildListingGeoLinks,
  buildNearbyListingLinks,
} from '@/lib/seo/geoLinking'
import { SeoOperationalGateUnavailableError } from '@/lib/seo/loadSeoIndexAllowlistForAdmin'
import { fetchPublishedListingRowsForSitemap } from '@/lib/seo/sitemap/fetchPublishedListingRows'
import { computeSeoSitemapCounts } from '@/lib/seo/sitemap/computeSitemapCounts'
import { fetchSeoRolloutState } from '@/lib/seo/seoRolloutState'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { T } from '@/lib/supabase/tables'
import { adminSupabase } from '@/lib/supabase/admin'
import type { Sale } from '@/lib/types'
import type { SeoMetro } from '@/lib/seo/types'

const GEO_LINK_SAMPLE_SIZE = 100
const NEARBY_LINK_SAMPLE_SIZE = 20

async function loadIngestionInputs(
  request: NextRequest
): Promise<{
  metrics: IngestionMetricsResponse
  coverage: YstmCoverageMetricsResponse
}> {
  const [coverageRes, metricsRes] = await Promise.all([
    getYstmCoverage(request),
    getIngestionMetrics(request),
  ])

  if (!coverageRes.ok || !metricsRes.ok) {
    throw new SeoOperationalGateUnavailableError(
      `Operational gate inputs unavailable (coverage HTTP ${coverageRes.status}, metrics HTTP ${metricsRes.status})`
    )
  }

  const coverage = (await coverageRes.json()) as YstmCoverageMetricsResponse
  const metrics = (await metricsRes.json()) as IngestionMetricsResponse

  if (!coverage.ok || !metrics.ok) {
    throw new SeoOperationalGateUnavailableError('Ingestion operational metrics reported failure')
  }

  return { metrics, coverage }
}

async function sampleInternalLinkCounts(metros: SeoMetro[]): Promise<SeoInternalLinkSample> {
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, T.sales)
    .select('id, city, state, title')
    .eq('status', 'published')
    .order('updated_at', { ascending: false })
    .limit(GEO_LINK_SAMPLE_SIZE)

  if (error || !data?.length) {
    return {
      sampleSize: 0,
      listingsWithCityLink: 0,
      listingsWithWeekendLink: 0,
      nearbySaleLinks: 0,
      nearbySampleSize: 0,
      label: 'Sample estimate (0 listings)',
    }
  }

  let listingsWithCityLink = 0
  let listingsWithWeekendLink = 0

  for (const row of data) {
    const geo = buildListingGeoLinks(row as Sale, metros)
    if (geo.city) listingsWithCityLink++
    if (geo.weekend) listingsWithWeekendLink++
  }

  const nearbySample = data.slice(0, NEARBY_LINK_SAMPLE_SIZE)
  let nearbySaleLinks = 0

  const { getNearestSalesForSale } = await import('@/lib/data/salesAccess')
  const nearestResults = await Promise.all(
    nearbySample.map(async (row) => {
      try {
        const nearby = await getNearestSalesForSale(adminSupabase, String(row.id), 6)
        return buildNearbyListingLinks(nearby).length
      } catch {
        return 0
      }
    })
  )
  nearbySaleLinks = nearestResults.reduce((sum, n) => sum + n, 0)

  const sampleSize = data.length
  return {
    sampleSize,
    listingsWithCityLink,
    listingsWithWeekendLink,
    nearbySaleLinks,
    nearbySampleSize: nearbySample.length,
    label: `Sample estimate (${sampleSize} listings; nearby from ${nearbySample.length})`,
  }
}

export async function loadSeoOperationsDashboard(
  request: NextRequest,
  options?: { runCrawlSmoke?: boolean }
): Promise<SeoOperationsDashboard> {
  const [{ metrics, coverage }, rolloutState, metroSnapshot, publishedRows] = await Promise.all([
    loadIngestionInputs(request),
    fetchSeoRolloutState(getAdminDb()),
    fetchNationwideSeoMetroInventory(),
    fetchPublishedListingRowsForSitemap(),
  ])

  const { metros, inventoryBySlug } = metroSnapshot
  const publishedListingCount = publishedRows.length

  const provisional = buildSeoOperationalSnapshot({
    metrics,
    coverage,
    sitemapCounts: computeSeoSitemapCounts({
      totalPublishedListings: publishedListingCount,
      inventoryIndexingAllowed: false,
      metros,
      inventoryBySlug,
    }),
    metros,
    inventoryByMetroSlug: inventoryBySlug,
    rolloutState,
  })

  const snapshot = buildSeoOperationalSnapshot({
    metrics,
    coverage,
    sitemapCounts: computeSeoSitemapCounts({
      totalPublishedListings: publishedListingCount,
      inventoryIndexingAllowed: provisional.rollout.indexingAllowed,
      metros,
      inventoryBySlug,
    }),
    metros,
    inventoryByMetroSlug: inventoryBySlug,
    rolloutState,
  })

  const [internalLinks, crawlSmoke] = await Promise.all([
    sampleInternalLinkCounts(metros),
    options?.runCrawlSmoke ? runSeoCrawlSmokeChecks() : Promise.resolve(null as CrawlSmokeReport | null),
  ])

  return buildSeoOperationsDashboard({
    snapshot,
    rolloutState,
    publishedListingCount,
    configuredSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    internalLinks,
    crawlSmoke,
  })
}
