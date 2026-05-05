export interface IngestionMetricsResponse {
  ok: boolean
  generatedAt: string
  backlog: number
  published24h: number
  claimed24h: number
  geocodeTouches24h: number
  efficiency: number | null
  failureBreakdown: {
    needs_check: number
    publish_failed: number
    ready: number
    publishing: number
  }
  timeseries: {
    publishedByHour: Array<{ bucket: string; count: number }>
    ingestedPublishedByHour: Array<{ bucket: string; count: number }>
    durationMsByHour: Array<{ bucket: string; value: number }>
    rate429ByHour: Array<{ bucket: string; count: number }>
    claimedByHour: Array<{ bucket: string; count: number }>
    geocodeSuccessByHour: Array<{ bucket: string; count: number }>
    publishSuccessByHour: Array<{ bucket: string; count: number }>
  }
  oldestStuckRows: Array<{
    id: string
    status: string
    city: string | null
    state: string | null
    geocode_attempts: number | null
    created_at: string
    updated_at: string
    last_geocode_attempt_at: string | null
    source_url: string
  }>
}
