import { describe, expect, it } from 'vitest'
import { buildYstmIngestionRepairDiagnostics } from '@/lib/admin/buildYstmIngestionRepairDiagnostics'
import { minimalMetrics } from './ystmStabilizationExitCriteria.test'
import { minimalYstmCoverageScoreboard } from './evaluateYstmSaleInstanceRolloutGates.test'

describe('buildYstmIngestionRepairDiagnostics', () => {
  it('includes workstreams and needs_check breakdown', () => {
    const text = buildYstmIngestionRepairDiagnostics(
      minimalMetrics({
        failureBreakdown: {
          needs_check: 3,
          publish_failed: 0,
          expired: 0,
          ready: 0,
          publishing: 0,
        },
        needsCheckBreakdown: {
          total: 3,
          legacyTotalIncludingArchivedTerminal: 3,
          terminalActive: 0,
          terminalArchived: 0,
          scanned: 3,
          byAddressStatus: { address_gated: 2, address_available: 1 },
          byCoordinatePrecision: { locality: 2, rooftop: 1 },
          topPairs: [
            {
              addressStatus: 'address_gated',
              coordinatePrecision: 'locality',
              count: 2,
            },
          ],
        },
      }),
      minimalYstmCoverageScoreboard()
    )

    expect(text).toContain('## YSTM ingestion repair program')
    expect(text).toContain('### Workstreams A–G')
    expect(text).toContain('### needs_check breakdown')
    expect(text).toContain('address_gated')
    expect(text).toContain('locality')
  })
})
