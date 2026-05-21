import { listNationwideDiscoveryStateCodes } from '@/lib/ingestion/discovery/discoveryStateCursor'
import { buildYstmSourceExpansionMetrics, type YstmSourceExpansionMetrics } from '@/lib/admin/ystmSourceExpansionMetrics'
import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmGraphEnumerationMetrics = {
  generatedAt: string
  catalogStates: number
  statesWithCandidates: number
  statesRemaining: number
  candidatesDiscovered: number
  validatedPages: number
  pendingValidation: number
  invalidPagesByStatus: Record<string, number>
  promotedCandidates: number
  validationsLast24h: number
  fetchFailureRate24h: number
  blockRate24h: number
  throttleRecommended: boolean
  sourceExpansion: YstmSourceExpansionMetrics
}

export async function buildYstmGraphEnumerationMetrics(
  admin: ReturnType<typeof getAdminDb>,
  nowMs: number = Date.now()
): Promise<YstmGraphEnumerationMetrics> {
  const since = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const catalogStates = listNationwideDiscoveryStateCodes().length

  const [rowsResult, recentResult, sourceExpansion] = await Promise.all([
    fromBase(admin, 'ystm_source_page_candidates').select('state, validation_status, promoted_at'),
    fromBase(admin, 'ystm_source_page_candidates')
      .select('validation_status, validation_failure_reason')
      .gte('last_seen_at', since),
    buildYstmSourceExpansionMetrics(admin, nowMs),
  ])

  if (rowsResult.error) throw new Error(rowsResult.error.message)
  if (recentResult.error) throw new Error(recentResult.error.message)

  const rows = (rowsResult.data ?? []) as Array<{
    state: string
    validation_status: string
    promoted_at: string | null
  }>

  const statesWithCandidates = new Set(rows.map((r) => r.state)).size
  const invalidPagesByStatus: Record<string, number> = {}
  let validatedPages = 0
  let pendingValidation = 0
  let promotedCandidates = 0

  for (const row of rows) {
    if (row.validation_status === 'validated') validatedPages += 1
    if (row.validation_status === 'pending') pendingValidation += 1
    if (row.promoted_at) promotedCandidates += 1
    if (row.validation_status !== 'validated' && row.validation_status !== 'pending') {
      invalidPagesByStatus[row.validation_status] = (invalidPagesByStatus[row.validation_status] ?? 0) + 1
    }
  }

  const recent = (recentResult.data ?? []) as Array<{
    validation_status: string
    validation_failure_reason: string | null
  }>
  const validationsLast24h = recent.length
  let fetchFailures = 0
  let blocked = 0
  for (const row of recent) {
    if (row.validation_status === 'fetch_failed') fetchFailures += 1
    if (row.validation_status === 'blocked') blocked += 1
  }
  const fetchFailureRate24h =
    validationsLast24h > 0 ? Math.round((fetchFailures / validationsLast24h) * 1000) / 1000 : 0
  const blockRate24h =
    validationsLast24h > 0 ? Math.round((blocked / validationsLast24h) * 1000) / 1000 : 0

  return {
    generatedAt: new Date(nowMs).toISOString(),
    catalogStates,
    statesWithCandidates,
    statesRemaining: Math.max(0, catalogStates - statesWithCandidates),
    candidatesDiscovered: rows.length,
    validatedPages,
    pendingValidation,
    invalidPagesByStatus,
    promotedCandidates,
    validationsLast24h,
    fetchFailureRate24h,
    blockRate24h,
    throttleRecommended: fetchFailureRate24h > 0.1 || blockRate24h > 0.01,
    sourceExpansion,
  }
}
