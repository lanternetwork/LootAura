import { sanitizeMissingIngestCronLogFields } from '@/lib/admin/sanitizeMissingIngestCronLog'
import { logger } from '@/lib/log'

export type MissingIngestCronFailureLogContext = {
  phase?: string | null
  telemetry?: Record<string, unknown> | null
}

export function logMissingIngestCronFailure(
  err: unknown,
  context: MissingIngestCronFailureLogContext = {}
): string {
  const { sanitizedMessage, sanitizedStack } = sanitizeMissingIngestCronLogFields(err)
  logger.error(
    'YSTM missing-ingest cron failed',
    err instanceof Error ? err : new Error(sanitizedMessage),
    {
      component: 'api/cron/ystm-missing-ingest',
      errorMessage: sanitizedMessage,
      errorStack: sanitizedStack,
      phase: context.phase ?? null,
      telemetry: context.telemetry ?? null,
    }
  )
  return sanitizedMessage
}
