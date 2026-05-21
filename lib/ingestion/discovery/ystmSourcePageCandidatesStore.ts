import type { DiscoveredCityPageCandidate } from '@/lib/ingestion/discovery/sourceDiscovery'
import type { YstmSourcePageCandidateStatus } from '@/lib/ingestion/discovery/ystmSourcePageCandidateStatus'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmSourcePageCandidateRow = {
  id: string
  url: string
  canonical_url: string
  state: string
  city_slug: string | null
  discovered_from_url: string | null
  validation_status: YstmSourcePageCandidateStatus
  validation_failure_reason: string | null
  promoted_config_id: string | null
  first_seen_at: string
  last_seen_at: string
  promoted_at: string | null
  metadata: Record<string, unknown>
}

export async function upsertDiscoveredSourcePageCandidates(
  admin: ReturnType<typeof getAdminDb>,
  args: {
    candidates: DiscoveredCityPageCandidate[]
    discoveredFromUrl: string
  }
): Promise<{ insertedOrUpdated: number }> {
  if (args.candidates.length === 0) return { insertedOrUpdated: 0 }
  const now = new Date().toISOString()
  const payload = args.candidates.map((c) => ({
    url: c.canonicalUrl,
    canonical_url: c.canonicalUrl,
    state: c.state,
    city_slug: c.cityPathSegment.replace(/\.html?$/i, '') || null,
    discovered_from_url: args.discoveredFromUrl,
    validation_status: 'pending' as const,
    validation_failure_reason: null,
    last_seen_at: now,
    metadata: {
      sharedHubPage: c.sharedHubPage,
      city: c.city,
    },
  }))

  const chunkSize = 200
  let insertedOrUpdated = 0
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize)
    const canonicals = slice.map((r) => r.canonical_url)
    const { data: existingRows, error: existingError } = await fromBase(admin, 'ystm_source_page_candidates')
      .select('canonical_url')
      .in('canonical_url', canonicals)
    if (existingError) throw new Error(existingError.message)
    const existing = new Set((existingRows ?? []).map((r) => (r as { canonical_url: string }).canonical_url))
    const toInsert = slice.filter((r) => !existing.has(r.canonical_url))
    const toTouch = slice.filter((r) => existing.has(r.canonical_url)).map((r) => r.canonical_url)

    if (toInsert.length > 0) {
      const { error } = await fromBase(admin, 'ystm_source_page_candidates').insert(toInsert)
      if (error) throw new Error(error.message)
      insertedOrUpdated += toInsert.length
    }
    if (toTouch.length > 0) {
      const { error } = await fromBase(admin, 'ystm_source_page_candidates')
        .update({ last_seen_at: now })
        .in('canonical_url', toTouch)
      if (error) throw new Error(error.message)
      insertedOrUpdated += toTouch.length
    }
  }
  return { insertedOrUpdated }
}

export async function listPendingSourcePageCandidates(
  admin: ReturnType<typeof getAdminDb>,
  limit: number
): Promise<YstmSourcePageCandidateRow[]> {
  const { data, error } = await fromBase(admin, 'ystm_source_page_candidates')
    .select(
      'id, url, canonical_url, state, city_slug, discovered_from_url, validation_status, validation_failure_reason, promoted_config_id, first_seen_at, last_seen_at, promoted_at, metadata'
    )
    .eq('validation_status', 'pending')
    .order('last_seen_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as YstmSourcePageCandidateRow[]
}

export async function updateSourcePageCandidateValidation(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  patch: {
    validationStatus: YstmSourcePageCandidateStatus
    validationFailureReason: string | null
  }
): Promise<void> {
  const { error } = await fromBase(admin, 'ystm_source_page_candidates')
    .update({
      validation_status: patch.validationStatus,
      validation_failure_reason: patch.validationFailureReason,
      last_seen_at: new Date().toISOString(),
    })
    .eq('canonical_url', canonicalUrl)
  if (error) throw new Error(error.message)
}

export async function markSourcePageCandidatesPromoted(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrls: string[],
  promotedConfigId: string | null
): Promise<void> {
  if (canonicalUrls.length === 0) return
  const now = new Date().toISOString()
  const { error } = await fromBase(admin, 'ystm_source_page_candidates')
    .update({
      promoted_at: now,
      promoted_config_id: promotedConfigId,
      last_seen_at: now,
    })
    .in('canonical_url', canonicalUrls)
  if (error) throw new Error(error.message)
}

export async function listValidatedUnpromotedCandidates(
  admin: ReturnType<typeof getAdminDb>,
  limit: number
): Promise<YstmSourcePageCandidateRow[]> {
  const { data, error } = await fromBase(admin, 'ystm_source_page_candidates')
    .select(
      'id, url, canonical_url, state, city_slug, discovered_from_url, validation_status, validation_failure_reason, promoted_config_id, first_seen_at, last_seen_at, promoted_at, metadata'
    )
    .eq('validation_status', 'validated')
    .is('promoted_at', null)
    .order('last_seen_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as YstmSourcePageCandidateRow[]
}
