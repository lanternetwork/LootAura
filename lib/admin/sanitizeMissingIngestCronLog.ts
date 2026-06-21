export const MISSING_INGEST_CRON_LOG_MAX_CHARS = 500 as const

export function sanitizeMissingIngestCronLogText(
  raw: string,
  maxLen: number = MISSING_INGEST_CRON_LOG_MAX_CHARS
): string {
  const cappedMax = Math.max(1, Math.floor(maxLen))
  const message = String(raw ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
    .replace(/yardsaletreasuremap\.(?:com|net|org)[^\s]*/gi, '[redacted-host-path]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]')
    .trim()

  if (message.length <= cappedMax) {
    return message || 'unknown_error'
  }
  return `${message.slice(0, cappedMax - 3)}...`
}

export function sanitizeMissingIngestCronLogFields(err: unknown): {
  sanitizedMessage: string
  sanitizedStack: string | null
} {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : null
  return {
    sanitizedMessage: sanitizeMissingIngestCronLogText(message),
    sanitizedStack: stack ? sanitizeMissingIngestCronLogText(stack) : null,
  }
}
