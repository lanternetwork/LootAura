import type { SaleInstanceShadowComparison } from '@/lib/ingestion/identity/shadowSaleInstanceReplay'

export type SaleInstanceShadowReplayRow = {
  canonicalUrl: string
  state: string | null
  city: string | null
  replayedAt: string
  comparison: SaleInstanceShadowComparison
  ingestedSaleId: string | null
}

export type SaleInstanceShadowReplayReport = {
  generatedAt: string
  replayedCount: number
  oldSuppressCount: number
  newSuppressCount: number
  wouldPublishCount: number
  divergenceOldSuppressNewPublishCount: number
  ambiguousCount: number
  sampleDivergences: Array<{
    canonicalUrl: string
    oldDecision: string
    newDecision: string
    wouldPublish: boolean
    divergenceKind: string | null
    reasonCodes: string[]
  }>
}

export const SALE_INSTANCE_SHADOW_REPLAY_SAMPLE_LIMIT = 40
