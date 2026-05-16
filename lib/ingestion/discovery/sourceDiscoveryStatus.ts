export const SOURCE_DISCOVERY_STATUS = {
  pending: 'pending',
  discovered: 'discovered',
  validated: 'validated',
  failed: 'failed',
  manual: 'manual',
} as const

export type SourceDiscoveryStatus =
  (typeof SOURCE_DISCOVERY_STATUS)[keyof typeof SOURCE_DISCOVERY_STATUS]
