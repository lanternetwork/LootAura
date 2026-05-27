import { isCrossProviderPublishLinkEnforcementEnabled } from '@/lib/ingestion/identity/crossProviderShadowEnforcement'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

export type CanonicalPublishedSiblingMatchMethod =
  | 'canonical_published_sibling'
  | 'canonical_published_sibling_same_platform'

export type CrossProviderPublishLink = {
  publishedSaleId: string
  primaryIngestedSaleId: string
  matchedIngestedSaleId: string
  matchMethod: CanonicalPublishedSiblingMatchMethod
}

type PublishLinkCandidate = {
  id: string
  source_platform: string
  published_sale_id: string | null
  is_duplicate: boolean
}

export type CrossProviderPublishLinkInput = {
  id: string
  source_platform: string
  canonical_sale_instance_key?: string | null
}

async function saleExistsForId(saleId: string): Promise<boolean> {
  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'sales')
    .select('id')
    .eq('id', saleId)
    .limit(1)
  if (error) {
    logger.warn('cross_provider_publish_link: sale lookup failed', {
      component: 'ingestion/cross_provider_publish_link',
      saleId,
      message: error.message,
    })
    return false
  }
  return Array.isArray(data) && data.length > 0
}

function pickPublishedSibling(
  candidates: readonly PublishLinkCandidate[],
  incomingSourcePlatform: string
): {
  sibling: PublishLinkCandidate
  primaryIngestedSaleId: string
  matchMethod: CanonicalPublishedSiblingMatchMethod
} | null {
  const withSale = candidates.filter((c) => c.published_sale_id?.trim())
  if (withSale.length === 0) return null

  const incomingPlatform = incomingSourcePlatform.trim()
  const sorted = withSale.slice().sort((a, b) => {
    const aSame = a.source_platform.trim() === incomingPlatform ? 0 : 1
    const bSame = b.source_platform.trim() === incomingPlatform ? 0 : 1
    if (aSame !== bSame) return aSame - bSame
    if (a.is_duplicate !== b.is_duplicate) {
      return a.is_duplicate ? 1 : -1
    }
    return a.id.localeCompare(b.id)
  })
  const sibling = sorted[0]
  const primaryRow = sorted.find((c) => !c.is_duplicate) ?? sibling
  const matchMethod: CanonicalPublishedSiblingMatchMethod =
    sibling.source_platform.trim() === incomingPlatform
      ? 'canonical_published_sibling_same_platform'
      : 'canonical_published_sibling'
  return { sibling, primaryIngestedSaleId: primaryRow.id, matchMethod }
}

/**
 * Phase D/E: reuse an already-published canonical sibling sale (cross-provider or same-platform).
 * Prevents duplicate visible pins when two rows share `canonical_sale_instance_key`.
 */
export async function resolveCrossProviderPublishLink(
  record: CrossProviderPublishLinkInput
): Promise<CrossProviderPublishLink | null> {
  if (!isCrossProviderPublishLinkEnforcementEnabled()) {
    return null
  }

  const canonicalKey = record.canonical_sale_instance_key?.trim() ?? ''
  if (!canonicalKey) {
    return null
  }

  const admin = getAdminDb()
  const { data, error } = await fromBase(admin, 'ingested_sales')
    .select('id, source_platform, published_sale_id, is_duplicate')
    .eq('canonical_sale_instance_key', canonicalKey)
    .neq('id', record.id)
    .not('published_sale_id', 'is', null)
    .is('superseded_by_ingested_sale_id', null)
    .order('is_duplicate', { ascending: true })
    .order('id', { ascending: true })
    .limit(20)

  if (error) {
    logger.warn('cross_provider_publish_link: sibling query failed', {
      component: 'ingestion/cross_provider_publish_link',
      rowId: record.id,
      message: error.message,
    })
    return null
  }

  const rows = (data ?? []) as PublishLinkCandidate[]
  const picked = pickPublishedSibling(rows, record.source_platform)
  if (!picked?.sibling.published_sale_id) {
    return null
  }

  const saleId = picked.sibling.published_sale_id.trim()
  if (!saleId) {
    return null
  }

  const exists = await saleExistsForId(saleId)
  if (!exists) {
    logger.warn('cross_provider_publish_link: sibling published_sale_id missing sales row', {
      component: 'ingestion/cross_provider_publish_link',
      rowId: record.id,
      matchedIngestedSaleId: picked.sibling.id,
      saleId,
    })
    return null
  }

  return {
    publishedSaleId: saleId,
    primaryIngestedSaleId: picked.primaryIngestedSaleId,
    matchedIngestedSaleId: picked.sibling.id,
    matchMethod: picked.matchMethod,
  }
}
