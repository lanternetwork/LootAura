import type { SourceRefreshCapability } from '@/lib/reconciliation/types'

/**
 * Explicit refresh capability for observability and future gating (no implicit defaults at call sites).
 */
export function resolveSourceRefreshCapability(input: {
  readonly sourcePlatform: string
  readonly sourceHost: string
}): SourceRefreshCapability {
  const host = input.sourceHost.trim().toLowerCase()
  if (!host) {
    return 'unsupported_for_reconciliation'
  }
  // Reserved: sources that require extension-assisted capture in a later phase.
  if (input.sourcePlatform === 'extension_only_placeholder') {
    return 'extension_assisted_required'
  }
  if (/^localhost$|\.local$/.test(host)) {
    return 'unsupported_for_reconciliation'
  }
  return 'server_refetch_supported'
}
