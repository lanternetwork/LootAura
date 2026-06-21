import { sanitizeMissingIngestCronLogText } from '@/lib/admin/sanitizeMissingIngestCronLog'

export function extractSanitizedStackTop(err: unknown): string | null {
  if (!(err instanceof Error) || !err.stack?.trim()) {
    return null
  }
  const lines = err.stack
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const frame = lines.find((line) => line.startsWith('at ')) ?? lines[1] ?? null
  return frame ? sanitizeMissingIngestCronLogText(frame) : null
}

export function formatAdminIngestionJobError(err: unknown): {
  error: string
  stack_top: string | null
} {
  const message = err instanceof Error ? err.message : String(err)
  return {
    error: sanitizeMissingIngestCronLogText(message),
    stack_top: extractSanitizedStackTop(err),
  }
}
