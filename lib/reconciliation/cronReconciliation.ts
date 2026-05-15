import { RECONCILIATION_HARD_LIMIT_CAP } from '@/lib/reconciliation/reconcileExternalSources'

export const DEFAULT_CRON_RECONCILIATION_LIMIT = 20

/** Bounded batch size for GET/POST `/api/cron/reconciliation` (env: CRON_RECONCILIATION_BATCH_LIMIT). */
export function parseCronReconciliationBatchLimit(): number {
  const raw = process.env.CRON_RECONCILIATION_BATCH_LIMIT
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_CRON_RECONCILIATION_LIMIT
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_CRON_RECONCILIATION_LIMIT
  }
  return Math.min(parsed, RECONCILIATION_HARD_LIMIT_CAP)
}
