import { fromBase, getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'

const DEFAULT_POOL_MAX = 10_000
const ABS_POOL_CAP = 50_000

/** Max rows loaded per reconcile invocation (memory-bounded keyset page). */
export function parseReconciliationCandidatePoolMax(): number {
  const raw = process.env.RECONCILIATION_CANDIDATE_POOL_MAX
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_POOL_MAX
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_POOL_MAX
  }
  return Math.min(parsed, ABS_POOL_CAP)
}

export type ReconciliationCoverageCursor = {
  readonly tier: number
  readonly placeholder: number
  readonly never: number
  readonly ingestId: string
}

export function reconciliationCoverageStateKey(opts: {
  readonly sourcePlatform?: string
  readonly onlyPlaceholder?: boolean
}): string | null {
  if (opts.onlyPlaceholder) {
    return null
  }
  const p = typeof opts.sourcePlatform === 'string' ? opts.sourcePlatform.trim() : ''
  if (p) {
    return `sp:${p}`
  }
  return 'default'
}

export type SalePeekRow = {
  readonly address: string | null
  readonly city: string | null
  readonly state: string | null
  readonly date_start: string | null
  readonly date_end: string | null
  readonly time_start: string | null
  readonly time_end: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

/** Map RPC json to IngestRowDb shape + sale peek map (internal to reconcile module). */
export function parseReconciliationCandidateRpcPayload(data: unknown): {
  readonly rows: RpcIngestRow[]
  readonly salePeekBySaleId: Map<string, SalePeekRow>
} {
  const arr = Array.isArray(data) ? data : []
  const rows: RpcIngestRow[] = []
  const salePeekBySaleId = new Map<string, SalePeekRow>()
  for (const item of arr) {
    if (!isRecord(item)) continue
    const ingest = item.ingest
    const saleId = item.sale_id
    const peek = item.sale_peek
    if (!isRecord(ingest) || typeof saleId !== 'string' || !isRecord(peek)) continue
    rows.push(ingest as RpcIngestRow)
    salePeekBySaleId.set(saleId, {
      address: typeof peek.address === 'string' ? peek.address : null,
      city: typeof peek.city === 'string' ? peek.city : null,
      state: typeof peek.state === 'string' ? peek.state : null,
      date_start: typeof peek.date_start === 'string' ? peek.date_start : null,
      date_end: typeof peek.date_end === 'string' ? peek.date_end : null,
      time_start: typeof peek.time_start === 'string' ? peek.time_start : null,
      time_end: typeof peek.time_end === 'string' ? peek.time_end : null,
    })
  }
  return { rows, salePeekBySaleId }
}

export type RpcIngestRow = Record<string, unknown>

export async function fetchReconciliationCandidatePageRpc(
  admin: ReturnType<typeof getAdminDb>,
  params: {
    readonly nowMs: number
    readonly poolLimit: number
    readonly cursor: ReconciliationCoverageCursor | null
    readonly sourcePlatform: string | undefined
  }
): Promise<{ readonly rows: RpcIngestRow[]; readonly salePeekBySaleId: Map<string, SalePeekRow> }> {
  const iso = new Date(params.nowMs).toISOString()
  const { data, error } = await admin.rpc('reconciliation_candidate_rows_page', {
    p_now_utc: iso,
    p_pool_limit: params.poolLimit,
    p_after_tier: params.cursor?.tier ?? null,
    p_after_placeholder: params.cursor?.placeholder ?? null,
    p_after_never: params.cursor?.never ?? null,
    p_after_ingest_id: params.cursor?.ingestId ?? null,
    p_source_platform: params.sourcePlatform?.trim() || null,
  })
  if (error) {
    logger.warn('reconciliation: reconciliation_candidate_rows_page RPC failed', {
      component: 'reconciliation/reconciliationCandidateLoad',
      operation: 'rpc_page',
      message: error.message,
    })
    return { rows: [], salePeekBySaleId: new Map() }
  }
  return parseReconciliationCandidateRpcPayload(data)
}

export async function readReconciliationCoverageCursor(
  admin: ReturnType<typeof getAdminDb>,
  stateKey: string
): Promise<ReconciliationCoverageCursor | null> {
  const { data, error } = await fromBase(admin, 'reconciliation_selection_state')
    .select('cursor_tier, cursor_placeholder, cursor_never, cursor_ingest_id')
    .eq('state_key', stateKey)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  const r = data as {
    cursor_tier: number | null
    cursor_placeholder: number | null
    cursor_never: number | null
    cursor_ingest_id: string | null
  }
  if (
    r.cursor_tier == null ||
    r.cursor_placeholder == null ||
    r.cursor_never == null ||
    r.cursor_ingest_id == null ||
    String(r.cursor_ingest_id).trim() === ''
  ) {
    return null
  }
  return {
    tier: Number(r.cursor_tier),
    placeholder: Number(r.cursor_placeholder),
    never: Number(r.cursor_never),
    ingestId: String(r.cursor_ingest_id),
  }
}

export async function writeReconciliationCoverageCursor(
  admin: ReturnType<typeof getAdminDb>,
  stateKey: string,
  cursor: ReconciliationCoverageCursor | null
): Promise<void> {
  const payload =
    cursor == null
      ? {
          cursor_tier: null,
          cursor_placeholder: null,
          cursor_never: null,
          cursor_ingest_id: null,
          updated_at: new Date().toISOString(),
        }
      : {
          cursor_tier: cursor.tier,
          cursor_placeholder: cursor.placeholder,
          cursor_never: cursor.never,
          cursor_ingest_id: cursor.ingestId,
          updated_at: new Date().toISOString(),
        }
  const { error } = await fromBase(admin, 'reconciliation_selection_state').upsert(
    {
      state_key: stateKey,
      ...payload,
    },
    { onConflict: 'state_key' }
  )
  if (error) {
    logger.warn('reconciliation: failed to persist coverage cursor', {
      component: 'reconciliation/reconciliationCandidateLoad',
      operation: 'write_cursor',
      stateKey,
      message: error.message,
    })
  }
}
