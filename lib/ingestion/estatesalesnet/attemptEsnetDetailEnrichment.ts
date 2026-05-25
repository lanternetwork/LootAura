import type {
  ExternalPageSourceIngestionConfig,
  ExternalPageSourceListing,
} from '@/lib/ingestion/adapters/externalPageSourceTypes'
import { fetchSafeExternalPageHtml } from '@/lib/ingestion/adapters/externalPageSafeFetch'
import { isEstatesalesNetSourceUrl } from '@/lib/ingestion/estatesalesnet/esnetHosts'
import { mergeEsnetDetailIntoListing } from '@/lib/ingestion/estatesalesnet/mergeEsnetDetailIntoListing'
import { parseEsnetNgrxDetailHtml } from '@/lib/ingestion/estatesalesnet/parseEsnetNgrxDetailHtml'
import { logger } from '@/lib/log'

const ADAPTER_ID = 'external_page_source'

export type EsnetDetailEnrichmentResult =
  | { outcome: 'enriched'; listing: ExternalPageSourceListing; detailPageHtml: string }
  | { outcome: 'fallback'; listing: ExternalPageSourceListing; reason: string; detailPageHtml?: string }

export type EsnetDetailEnrichmentMetrics = {
  attempted: number
  enriched: number
  fetchFailed: number
  parseFailed: number
}

export function emptyEsnetDetailEnrichmentMetrics(): EsnetDetailEnrichmentMetrics {
  return { attempted: 0, enriched: 0, fetchFailed: 0, parseFailed: 0 }
}

export function mergeEsnetDetailEnrichmentMetrics(
  target: EsnetDetailEnrichmentMetrics,
  delta: EsnetDetailEnrichmentMetrics
): void {
  target.attempted += delta.attempted
  target.enriched += delta.enriched
  target.fetchFailed += delta.fetchFailed
  target.parseFailed += delta.parseFailed
}

export async function attemptEsnetDetailEnrichment(input: {
  config: ExternalPageSourceIngestionConfig
  listSeed: ExternalPageSourceListing
  pageIndex: number
  beforeDetailFetch?: (params: {
    detailUrl: string
    pageIndex: number
    city: string
    state: string
  }) => Promise<void>
}): Promise<{ result: EsnetDetailEnrichmentResult; metrics: EsnetDetailEnrichmentMetrics }> {
  const metrics = emptyEsnetDetailEnrichmentMetrics()
  metrics.attempted = 1

  const sourceUrl = input.listSeed.sourceUrl?.trim() ?? ''
  if (!isEstatesalesNetSourceUrl(sourceUrl)) {
    return {
      result: { outcome: 'fallback', listing: input.listSeed, reason: 'not_esnet_url' },
      metrics,
    }
  }

  if (input.beforeDetailFetch) {
    try {
      await input.beforeDetailFetch({
        detailUrl: sourceUrl,
        pageIndex: input.pageIndex,
        city: input.config.city,
        state: input.config.state,
      })
    } catch (e) {
      logger.warn('ES.net detail enrich: pre-fetch hook failed', {
        component: 'ingestion/estatesalesnet/attemptEsnetDetailEnrichment',
        operation: 'prefetch_hook',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  let html: string
  try {
    html = await fetchSafeExternalPageHtml(sourceUrl, {
      city: input.config.city,
      state: input.config.state,
      pageIndex: input.pageIndex,
      adapter: ADAPTER_ID,
    })
  } catch (e) {
    metrics.fetchFailed = 1
    return {
      result: {
        outcome: 'fallback',
        listing: input.listSeed,
        reason: 'detail_fetch_failed',
      },
      metrics,
    }
  }

  const parsed = parseEsnetNgrxDetailHtml(html, sourceUrl, input.config)
  if (!parsed) {
    metrics.parseFailed = 1
    return {
      result: {
        outcome: 'fallback',
        listing: input.listSeed,
        reason: 'detail_parse_failed',
        detailPageHtml: html,
      },
      metrics,
    }
  }

  metrics.enriched = 1
  return {
    result: {
      outcome: 'enriched',
      listing: mergeEsnetDetailIntoListing(input.listSeed, parsed),
      detailPageHtml: html,
    },
    metrics,
  }
}
