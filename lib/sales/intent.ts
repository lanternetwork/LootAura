// lib/sales/intent.ts
export type Intent =
  | { kind: 'Idle' }
  | { kind: 'ClusterDrilldown'; targetBounds: any; leafIds?: string[] }
  | { kind: 'UserPan' }
  | { kind: 'Filters' };

export type FetchCause = Intent['kind'];

export type FetchContext = {
  cause: FetchCause;
  seq: number;
};

// Helper: determines if a result from `cause` can still apply given current intent.
export function isCauseCompatibleWithIntent(cause: FetchCause, intent: Intent): boolean {
  // ClusterDrilldown results are valid while we're still drilling down;
  // Also allow them to remain if user immediately pans a tiny bit (UserPan) before they land,
  // but DO NOT allow them after Filters re-compute or we've gone Idle via a different interaction.
  if (cause === 'ClusterDrilldown') {
    return intent.kind === 'ClusterDrilldown' || intent.kind === 'UserPan';
  }
  if (cause === 'UserPan') {
    return intent.kind === 'UserPan' || intent.kind === 'ClusterDrilldown';
  }
  if (cause === 'Filters') {
    return intent.kind === 'Filters';
  }
  return false; // Idle never writes
}
