// lib/sales/intent.ts
export type Intent = 
  | { kind: 'Filters' }
  | { kind: 'UserPan' }
  | { kind: 'ClusterDrilldown'; targetBounds?: any; leafIds?: string[] };

export type FetchCause = 'Filters' | 'UserPan' | 'ClusterDrilldown';

export type FetchContext = {
  cause: FetchCause;
  seq: number;
};

// Helper: determines if a result from `cause` can still apply given current intent.
export function isCauseCompatibleWithIntent(cause: FetchCause, intent: Intent): boolean {
  if (cause === 'ClusterDrilldown') return intent.kind === 'ClusterDrilldown' || intent.kind === 'UserPan';
  if (cause === 'UserPan')          return intent.kind === 'UserPan'          || intent.kind === 'ClusterDrilldown';
  if (cause === 'Filters')          return intent.kind === 'Filters';
  return false;
}
