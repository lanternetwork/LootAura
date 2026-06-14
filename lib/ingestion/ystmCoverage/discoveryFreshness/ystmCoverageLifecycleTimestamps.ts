import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'

export async function markYstmCoverageObservationFirstIngested(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  atIso: string = new Date().toISOString()
): Promise<void> {
  const url = canonicalSourceUrl(canonicalUrl)
  if (!url) return

  const { error } = await fromBase(admin, 'ystm_coverage_observations')
    .update({
      first_ingested_at: atIso,
      updated_at: atIso,
    })
    .eq('canonical_url', url)
    .is('first_ingested_at', null)

  if (error) {
    throw new Error(error.message)
  }
}

export async function markYstmCoverageObservationFirstPublished(
  admin: ReturnType<typeof getAdminDb>,
  canonicalUrl: string,
  atIso: string = new Date().toISOString()
): Promise<void> {
  const url = canonicalSourceUrl(canonicalUrl)
  if (!url) return

  const patch: Record<string, unknown> = {
    first_published_at: atIso,
    lootaura_visible: true,
    updated_at: atIso,
  }

  const { error } = await fromBase(admin, 'ystm_coverage_observations')
    .update(patch)
    .eq('canonical_url', url)
    .is('first_published_at', null)

  if (error) {
    throw new Error(error.message)
  }
}

export async function markYstmCoverageObservationFirstPublishedBySourceUrl(
  admin: ReturnType<typeof getAdminDb>,
  sourceUrl: string,
  atIso: string = new Date().toISOString()
): Promise<void> {
  const canonical = canonicalSourceUrl(sourceUrl)
  if (!canonical) return
  await markYstmCoverageObservationFirstPublished(admin, canonical, atIso)
}
