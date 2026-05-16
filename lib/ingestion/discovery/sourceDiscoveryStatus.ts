export const SOURCE_DISCOVERY_STATUS = {
  pending: 'pending',
  /** Reserved for future intermediate state; automated discovery does not write this today. */
  discovered: 'discovered',
  validated: 'validated',
  failed: 'failed',
  manual: 'manual',
} as const

export type SourceDiscoveryStatus =
  (typeof SOURCE_DISCOVERY_STATUS)[keyof typeof SOURCE_DISCOVERY_STATUS]
