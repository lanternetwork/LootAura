import { fromBase, getAdminDb } from '@/lib/supabase/clients'

export type YstmCoverageAuditConfigEventOutcome =
  | 'skipped_no_pages'
  | 'fetch_failed'
  | 'zero_urls_extracted'
  | 'budget_exhausted'
  | 'ok_with_observations'

export type YstmCoverageAuditConfigEventInsert = {
  auditRunId: string
  configId: string | null
  tier: 1 | 2
  selectionIndex: number
  city: string
  state: string
  listPageUrl: string | null
  selected: boolean
  fetchStarted: boolean
  fetchCompleted: boolean
  urlsExtracted: number
  observationsWritten: number
  outcome: YstmCoverageAuditConfigEventOutcome
  listFetchError: string | null
}

export async function insertYstmCoverageAuditConfigEvents(
  admin: ReturnType<typeof getAdminDb>,
  rows: YstmCoverageAuditConfigEventInsert[]
): Promise<void> {
  if (rows.length === 0) return

  const payload = rows.map((row) => ({
    audit_run_id: row.auditRunId,
    config_id: row.configId,
    tier: row.tier,
    selection_index: row.selectionIndex,
    city: row.city,
    state: row.state,
    list_page_url: row.listPageUrl,
    selected: row.selected,
    fetch_started: row.fetchStarted,
    fetch_completed: row.fetchCompleted,
    urls_extracted: row.urlsExtracted,
    observations_written: row.observationsWritten,
    outcome: row.outcome,
    list_fetch_error: row.listFetchError,
  }))

  const chunkSize = 100
  for (let i = 0; i < payload.length; i += chunkSize) {
    const slice = payload.slice(i, i + chunkSize)
    const { error } = await fromBase(admin, 'ystm_coverage_audit_config_events').insert(slice)
    if (error) {
      throw new Error(error.message)
    }
  }
}
