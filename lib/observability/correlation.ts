import { randomUUID } from 'crypto'
import { generateOperationId } from '@/lib/log'

/** Fields safe to attach to structured logs (no PII). */
export type CorrelationFields = {
  requestId?: string
  operationId?: string
  correlationId?: string
  workerId?: string
  jobType?: string
}

export type CorrelationBundle = {
  operationId: string
  correlationId: string
  requestId: string
  workerId?: string
  jobType?: string
}

/**
 * Creates a stable correlation bundle for a cron/worker run.
 * `operationId` defaults to a new generateOperationId(); pass an existing request op id to align with HTTP cron entry.
 */
export function createCorrelationBundle(overrides: Partial<CorrelationFields> = {}): CorrelationBundle {
  const operationId = overrides.operationId ?? overrides.requestId ?? generateOperationId()
  const correlationId = overrides.correlationId ?? randomUUID()
  return {
    operationId,
    correlationId,
    requestId: overrides.requestId ?? operationId,
    workerId: overrides.workerId,
    jobType: overrides.jobType,
  }
}

/** Merge correlation into a logger / telemetry payload (undefined keys omitted by callers). */
export function mergeCorrelation(
  base: Record<string, unknown>,
  correlation: Partial<CorrelationBundle>
): Record<string, unknown> {
  return {
    ...base,
    ...(correlation.requestId != null ? { requestId: correlation.requestId } : {}),
    ...(correlation.operationId != null ? { operationId: correlation.operationId } : {}),
    ...(correlation.correlationId != null ? { correlationId: correlation.correlationId } : {}),
    ...(correlation.workerId != null ? { workerId: correlation.workerId } : {}),
    ...(correlation.jobType != null ? { jobType: correlation.jobType } : {}),
  }
}
