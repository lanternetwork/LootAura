export type TimedSpan = {
  readonly name: string
  readonly durationMs: number
}

export type RouteWallClockSlowest = {
  readonly slowest_stage: string
  readonly slowest_stage_duration_ms: number
  readonly slowest_stage_kind: 'route_wall_clock'
}

export type SingleSpanSlowest = {
  readonly slowest_single_span: string
  readonly slowest_single_span_duration_ms: number
}

function pickMaxSpan(spans: readonly TimedSpan[]): TimedSpan {
  if (spans.length === 0) {
    return { name: 'none', durationMs: 0 }
  }
  return spans.reduce((max, span) => (span.durationMs > max.durationMs ? span : max), spans[0]!)
}

export function deriveRouteWallClockSlowest(spans: readonly TimedSpan[]): RouteWallClockSlowest {
  const winner = pickMaxSpan(spans)
  return {
    slowest_stage: winner.name,
    slowest_stage_duration_ms: winner.durationMs,
    slowest_stage_kind: 'route_wall_clock',
  }
}

export function deriveSingleSpanSlowest(spans: readonly TimedSpan[]): SingleSpanSlowest {
  const winner = pickMaxSpan(spans)
  return {
    slowest_single_span: winner.name,
    slowest_single_span_duration_ms: winner.durationMs,
  }
}
