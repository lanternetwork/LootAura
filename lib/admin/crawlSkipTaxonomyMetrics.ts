import {
  type ExternalCrawlSkipSubReasonCounts,
  benignCrawlSkipSubReasons,
  emptyExternalCrawlSkipSubReasonCounts,
  mergeCrawlSkipSubReasonFromRecord,
  operationalCrawlSkipSubReasons,
  suspiciousCrawlSkipSubReasons,
  totalCrawlSkipSubReasons,
} from '@/lib/ingestion/acquisition/externalCrawlSkipTaxonomy'
import type { ExternalIngestionOrchestrationNote } from '@/lib/ingestion/orchestrationMetrics'

export type CrawlSkipTaxonomyRollup = {
  subReasons: ExternalCrawlSkipSubReasonCounts
  suspicious: number
  benign: number
  operational: number
  total: number
  suspiciousShare: number | null
}

export function emptyCrawlSkipTaxonomyRollup(): CrawlSkipTaxonomyRollup {
  const subReasons = emptyExternalCrawlSkipSubReasonCounts()
  return {
    subReasons,
    suspicious: 0,
    benign: 0,
    operational: 0,
    total: 0,
    suspiciousShare: null,
  }
}

export function finalizeCrawlSkipTaxonomyRollup(
  rollup: CrawlSkipTaxonomyRollup
): CrawlSkipTaxonomyRollup {
  const suspicious = suspiciousCrawlSkipSubReasons(rollup.subReasons)
  const benign = benignCrawlSkipSubReasons(rollup.subReasons)
  const operational = operationalCrawlSkipSubReasons(rollup.subReasons)
  const total = totalCrawlSkipSubReasons(rollup.subReasons)
  return {
    subReasons: rollup.subReasons,
    suspicious,
    benign,
    operational,
    total,
    suspiciousShare: total > 0 ? suspicious / total : null,
  }
}

export function accumulateCrawlSkipFromExternalNote(
  rollup: CrawlSkipTaxonomyRollup,
  note: ExternalIngestionOrchestrationNote
): void {
  mergeCrawlSkipSubReasonFromRecord(rollup.subReasons, note.crawlSkipSubReasons)
}
