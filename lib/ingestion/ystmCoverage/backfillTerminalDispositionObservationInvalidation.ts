import { canonicalSourceUrl } from '@/lib/ingestion/address/canonicalSourceUrl'
import { isTerminalAddressDisposition } from '@/lib/ingestion/address/terminalAddressDisposition'
import { buildTerminalDispositionObservationInvalidationFields } from '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

const PAGE_SIZE = 500

export type TerminalDispositionObservationBackfillResult = {
  updated: number
  skipped: number
}

type TerminalDispositionObservationRow = {
  canonical_url: string
  matched_ingested_sale_id: string | null
}

type TerminalDispositionIngestedRow = {
  id: string
  source_url: string
  address_status: string | null
}

async function fetchCohort(
  admin: ReturnType<typeof getAdminDb>
): Promise<TerminalDispositionObservationRow[]> {
  const rows: TerminalDispositionObservationRow[] = []
  let from = 0

  for (;;) {
    const { data, error } = await fromBase(admin, 'ystm_coverage_observations')
      .select('canonical_url, matched_ingested_sale_id')
      .eq('ystm_valid_active', true)
      .eq('lootaura_visible', false)
      .eq('false_exclusion_primary_bucket', 'terminal_disposition')
      .order('canonical_url', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const chunk = (Array.isArray(data) ? data : []) as TerminalDispositionObservationRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

async function fetchIngestedByUrls(
  admin: ReturnType<typeof getAdminDb>,
  urls: string[]
): Promise<Map<string, TerminalDispositionIngestedRow>> {
  const map = new Map<string, TerminalDispositionIngestedRow>()
  if (urls.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('id, source_url, address_status')
      .in('source_url', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as TerminalDispositionIngestedRow[]) {
      const canonical = canonicalSourceUrl(row.source_url)
      map.set(canonical, row)
      map.set(row.source_url, row)
    }
  }

  return map
}

async function fetchIngestedByIds(
  admin: ReturnType<typeof getAdminDb>,
  ids: string[]
): Promise<Map<string, TerminalDispositionIngestedRow>> {
  const map = new Map<string, TerminalDispositionIngestedRow>()
  if (ids.length === 0) return map

  const chunkSize = 100
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const { data, error } = await fromBase(admin, 'ingested_sales')
      .select('id, source_url, address_status')
      .in('id', chunk)

    if (error) throw new Error(error.message)

    for (const row of (Array.isArray(data) ? data : []) as TerminalDispositionIngestedRow[]) {
      map.set(String(row.id), row)
    }
  }

  return map
}

export function resolveTerminalDispositionIngestedRow(
  observation: TerminalDispositionObservationRow,
  ingestedByUrl: Map<string, TerminalDispositionIngestedRow>,
  ingestedById: Map<string, TerminalDispositionIngestedRow>
): TerminalDispositionIngestedRow | null {
  const matchedIngestedId = observation.matched_ingested_sale_id?.trim()
  if (matchedIngestedId) {
    const byId = ingestedById.get(matchedIngestedId)
    if (byId) return byId
  }

  return (
    ingestedByUrl.get(observation.canonical_url) ??
    ingestedByUrl.get(canonicalSourceUrl(observation.canonical_url)) ??
    null
  )
}

/**
 * Idempotent backfill: terminal_disposition observations linked to terminal address ingested rows
 * (ADDRESS_ENRICHMENT_TERMINAL_REPAIR_V1 Part A).
 */
export async function backfillTerminalDispositionObservationInvalidation(
  admin: ReturnType<typeof getAdminDb>,
  nowIso: string = new Date().toISOString()
): Promise<TerminalDispositionObservationBackfillResult> {
  const cohort = await fetchCohort(admin)
  if (cohort.length === 0) {
    return { updated: 0, skipped: 0 }
  }

  const canonicalUrls = [...new Set(cohort.map((row) => row.canonical_url))]
  const ingestedIds = [
    ...new Set(
      cohort
        .map((row) => row.matched_ingested_sale_id?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const [ingestedByUrl, ingestedById] = await Promise.all([
    fetchIngestedByUrls(admin, canonicalUrls),
    fetchIngestedByIds(admin, ingestedIds),
  ])

  let updated = 0
  let skipped = 0

  for (const observation of cohort) {
    const ingested = resolveTerminalDispositionIngestedRow(observation, ingestedByUrl, ingestedById)
    if (!ingested || !isTerminalAddressDisposition(ingested.address_status)) {
      skipped += 1
      continue
    }

    const { error } = await fromBase(admin, 'ystm_coverage_observations')
      .update({
        ...buildTerminalDispositionObservationInvalidationFields(),
        updated_at: nowIso,
      })
      .eq('canonical_url', observation.canonical_url)
      .eq('ystm_valid_active', true)

    if (error) throw new Error(error.message)

    updated += 1
  }

  return { updated, skipped }
}
