import { getAdminDb } from '@/lib/supabase/clients'
import { logger } from '@/lib/log'
import { buildTelemetryRecord, emitObservabilityRecord } from '@/lib/observability/emit'
import { ObservabilityEvents } from '@/lib/observability/events'

export type AdminDbForArchive = ReturnType<typeof getAdminDb>

export type PendingArchiveCounts = {
  today_utc_date: string
  pending_via_ends_at: number
  pending_via_legacy: number
  published_past_ends_at: number
  active_past_ends_at: number
  suspicious_ends_before_starts: number
}

export type ArchiveEndedSalesJobResult = {
  ok: true
  archived: number
  errors: 0
  archived_via_ends_at: number
  archived_via_legacy_fallback: number
  batches_run: number
  duration_ms: number
  pending_before?: PendingArchiveCounts
  pending_after?: PendingArchiveCounts
  stale_pending_total_after?: number
  max_iterations_hit: boolean
}

function parseEnvInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(Math.max(n, min), max)
}

function parseArchiveRpcRow(data: unknown): { archived_via_ends_at: number; archived_via_legacy: number } {
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : (data as Record<string, unknown> | null)
  if (!row || typeof row !== 'object') {
    return { archived_via_ends_at: 0, archived_via_legacy: 0 }
  }
  const n1 = Number((row as { archived_via_ends_at?: unknown }).archived_via_ends_at ?? 0)
  const n2 = Number((row as { archived_via_legacy?: unknown }).archived_via_legacy ?? 0)
  return {
    archived_via_ends_at: Number.isFinite(n1) ? n1 : 0,
    archived_via_legacy: Number.isFinite(n2) ? n2 : 0,
  }
}

function parsePendingJson(data: unknown): PendingArchiveCounts | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const num = (k: string) => {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'bigint') return Number(v)
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    return 0
  }
  return {
    today_utc_date: String(o.today_utc_date ?? ''),
    pending_via_ends_at: num('pending_via_ends_at'),
    pending_via_legacy: num('pending_via_legacy'),
    published_past_ends_at: num('published_past_ends_at'),
    active_past_ends_at: num('active_past_ends_at'),
    suspicious_ends_before_starts: num('suspicious_ends_before_starts'),
  }
}

async function fetchPendingArchiveCounts(admin: AdminDbForArchive, nowIso: string): Promise<PendingArchiveCounts | null> {
  const { data, error } = await admin.rpc('count_sales_pending_archive', { p_now: nowIso })
  if (error) {
    logger.warn('archive_sales: count_sales_pending_archive failed', {
      component: 'sales/archive_sql',
      operation: 'count_pending',
      message: error.message,
    })
    return null
  }
  return parsePendingJson(data)
}

/**
 * Archives ended sales using SQL batches (no full-table select into app memory).
 * Primary path: ends_at &lt; now. Transitional fallback: legacy UTC calendar rules when ends_at IS NULL.
 */
export async function runArchiveEndedSalesJob(options: {
  admin?: AdminDbForArchive
  now?: Date
  logBase: Record<string, unknown>
  /** Merged into structured telemetry records (no PII). */
  telemetryContext?: Record<string, unknown>
}): Promise<ArchiveEndedSalesJobResult> {
  const admin = options.admin ?? getAdminDb()
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const batchLimit = parseEnvInt('ARCHIVE_SALES_BATCH_SIZE', 250, 1, 5000)
  const maxIterations = parseEnvInt('ARCHIVE_SALES_MAX_ITERATIONS', 2000, 1, 50_000)
  const started = Date.now()
  const telemBase = { ...(options.telemetryContext ?? {}), ...options.logBase }

  const pendingBefore = await fetchPendingArchiveCounts(admin, nowIso)

  let archivedViaEndsAt = 0
  let archivedViaLegacy = 0
  let batchesRun = 0
  let maxIterationsHit = false

  for (let i = 0; i < maxIterations; i++) {
    const { data, error } = await admin.rpc('archive_sales_ended_batch', {
      p_now: nowIso,
      p_batch_limit: batchLimit,
    })

    if (error) {
      logger.error(
        'archive_sales: archive_sales_ended_batch RPC failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'sales/archive_sql',
          operation: 'archive_sales_ended_batch',
          iteration: i,
          ...options.logBase,
        }
      )
      throw new Error(error.message || 'archive_sales_ended_batch failed')
    }

    const { archived_via_ends_at: n1, archived_via_legacy: n2 } = parseArchiveRpcRow(data)
    archivedViaEndsAt += n1
    archivedViaLegacy += n2
    batchesRun += 1

    logger.info('archive_sales_sql_batch', {
      component: 'sales/archive_sql',
      operation: 'archive_sales_ended_batch',
      iteration: i,
      batch_archived_via_ends_at: n1,
      batch_archived_via_legacy_fallback: n2,
      batch_limit: batchLimit,
      ...options.logBase,
    })

    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.archive.batchIteration, {
        ...telemBase,
        iteration: i,
        batchArchivedViaEndsAt: n1,
        batchArchivedViaLegacyFallback: n2,
        batchLimit,
        durationMs: Date.now() - started,
      })
    )

    if (n2 > 0) {
      logger.info('archive_sales_used_legacy_fallback', {
        component: 'sales/archive_sql',
        operation: 'archive_transitional_fallback',
        message:
          'Archived rows with ends_at IS NULL using legacy UTC date rules (explicit transitional behavior).',
        batch_legacy_count: n2,
        ...options.logBase,
      })
    }

    if (n1 === 0 && n2 === 0) {
      break
    }

    if (i === maxIterations - 1) {
      maxIterationsHit = true
      logger.warn('archive_sales_max_iterations_reached', {
        component: 'sales/archive_sql',
        operation: 'archive_sales_ended_batch',
        maxIterations,
        ...options.logBase,
      })
      emitObservabilityRecord(
        buildTelemetryRecord(ObservabilityEvents.archive.maxIterations, {
          ...telemBase,
          maxIterations,
          batchesRun,
          archivedViaEndsAt,
          archivedViaLegacy,
        })
      )
    }
  }

  const pendingAfter = await fetchPendingArchiveCounts(admin, nowIso)
  const staleTotal =
    pendingAfter != null ? pendingAfter.pending_via_ends_at + pendingAfter.pending_via_legacy : undefined

  if (staleTotal != null && staleTotal > 0) {
    logger.warn('archive_sales_stale_pending_after_job', {
      component: 'sales/archive_sql',
      operation: 'stale_pending_detection',
      pending_via_ends_at: pendingAfter?.pending_via_ends_at,
      pending_via_legacy: pendingAfter?.pending_via_legacy,
      suspicious_ends_before_starts: pendingAfter?.suspicious_ends_before_starts,
      message:
        'Published/active rows remain that match archive criteria (investigate locks, clock skew, or data drift).',
      ...options.logBase,
    })
    emitObservabilityRecord(
      buildTelemetryRecord(ObservabilityEvents.archive.stalePending, {
        ...telemBase,
        stalePendingTotal: staleTotal,
        pendingViaEndsAt: pendingAfter?.pending_via_ends_at,
        pendingViaLegacy: pendingAfter?.pending_via_legacy,
        suspiciousEndsBeforeStarts: pendingAfter?.suspicious_ends_before_starts,
      })
    )
  }

  const durationMs = Date.now() - started
  const archived = archivedViaEndsAt + archivedViaLegacy

  logger.info('archive_sales_job_summary', {
    component: 'sales/archive_sql',
    operation: 'archive_job_complete',
    archived,
    archived_via_ends_at: archivedViaEndsAt,
    archived_via_legacy_fallback: archivedViaLegacy,
    batches_run: batchesRun,
    duration_ms: durationMs,
    max_iterations_hit: maxIterationsHit,
    pending_before: pendingBefore ?? undefined,
    pending_after: pendingAfter ?? undefined,
    ...options.logBase,
  })

  emitObservabilityRecord(
    buildTelemetryRecord(ObservabilityEvents.archive.jobSummary, {
      ...telemBase,
      archived,
      archivedViaEndsAt,
      archivedViaLegacyFallback: archivedViaLegacy,
      batchesRun,
      durationMs,
      maxIterationsHit,
      stalePendingTotalAfter: staleTotal ?? null,
      pendingBeforeTodayUtc: pendingBefore?.today_utc_date ?? null,
      pendingAfterTodayUtc: pendingAfter?.today_utc_date ?? null,
    })
  )

  return {
    ok: true,
    archived,
    errors: 0,
    archived_via_ends_at: archivedViaEndsAt,
    archived_via_legacy_fallback: archivedViaLegacy,
    batches_run: batchesRun,
    duration_ms: durationMs,
    pending_before: pendingBefore ?? undefined,
    pending_after: pendingAfter ?? undefined,
    stale_pending_total_after: staleTotal,
    max_iterations_hit: maxIterationsHit,
  }
}

/** Read-only pending counts (admin cron / status UI). */
export async function getPendingArchiveCounts(admin?: AdminDbForArchive): Promise<PendingArchiveCounts | null> {
  const db = admin ?? getAdminDb()
  const nowIso = new Date().toISOString()
  return fetchPendingArchiveCounts(db, nowIso)
}
