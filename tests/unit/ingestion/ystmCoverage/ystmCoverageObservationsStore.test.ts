import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFromBase = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/clients', () => ({
  fromBase: mockFromBase,
}))

const CANONICAL_URL =
  'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html'
const NOW = '2026-06-07T12:00:00.000Z'

const EXPIRED_INVALIDATION_FIELDS = {
  ystm_valid_active: false,
  ystm_invalid_reason: 'expired',
  false_exclusion_primary_bucket: null,
  false_exclusion_secondary_tags: [],
  false_exclusion_evidence: null,
  false_exclusion_summary: null,
  false_exclusion_traced_at: null,
} as const

function baseMissingIngestionFields(outcome: string, failureReason: string | null) {
  return {
    missing_ingestion_attempted_at: NOW,
    missing_ingestion_outcome: outcome,
    missing_ingestion_failure_reason: failureReason,
    updated_at: NOW,
  }
}

function setupUpdateMock(error: { message: string } | null = null) {
  const eq = vi.fn().mockResolvedValue({ error })
  const update = vi.fn(() => ({ eq }))
  mockFromBase.mockImplementation((_admin, table: string) => {
    if (table === 'ystm_coverage_observations') {
      return { update }
    }
    return { update }
  })
  return { update, eq }
}

describe('buildMissingIngestionObservationUpdate', () => {
  it('scenario 1 — failed + expired_after_detail invalidates and clears trace fields', async () => {
    const { buildMissingIngestionObservationUpdate } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    const update = buildMissingIngestionObservationUpdate(
      { outcome: 'failed', failureReason: 'expired_after_detail' },
      NOW
    )

    expect(update).toEqual({
      ...baseMissingIngestionFields('failed', 'expired_after_detail'),
      ...EXPIRED_INVALIDATION_FIELDS,
    })
  })

  it('scenario 2 — failed + fetch_failed does not invalidate', async () => {
    const { buildMissingIngestionObservationUpdate } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    const update = buildMissingIngestionObservationUpdate(
      { outcome: 'failed', failureReason: 'fetch_failed' },
      NOW
    )

    expect(update).toEqual(baseMissingIngestionFields('failed', 'fetch_failed'))
    expect(update).not.toHaveProperty('ystm_valid_active')
    expect(update).not.toHaveProperty('ystm_invalid_reason')
    expect(update).not.toHaveProperty('false_exclusion_primary_bucket')
  })

  it('scenario 3 — failed + insert_failed does not invalidate', async () => {
    const { buildMissingIngestionObservationUpdate } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    const update = buildMissingIngestionObservationUpdate(
      { outcome: 'failed', failureReason: 'insert_failed' },
      NOW
    )

    expect(update).toEqual(baseMissingIngestionFields('failed', 'insert_failed'))
    expect(update).not.toHaveProperty('ystm_valid_active')
  })

  it('scenario 4 — already-invalid observation remains idempotent on expired_after_detail', async () => {
    const { buildMissingIngestionObservationUpdate } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    const update = buildMissingIngestionObservationUpdate(
      { outcome: 'failed', failureReason: 'expired_after_detail' },
      NOW
    )

    expect(update.ystm_valid_active).toBe(false)
    expect(update.ystm_invalid_reason).toBe('expired')
    expect(update.false_exclusion_secondary_tags).toEqual([])
  })

  it('scenario 5 — repeated expired_after_detail writes produce stable final state', async () => {
    const { buildMissingIngestionObservationUpdate } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    const first = buildMissingIngestionObservationUpdate(
      { outcome: 'failed', failureReason: 'expired_after_detail' },
      NOW
    )
    const second = buildMissingIngestionObservationUpdate(
      { outcome: 'failed', failureReason: 'expired_after_detail' },
      NOW
    )

    expect(second).toEqual(first)
  })

  it('scenario 6 — non-failed outcome with expired_after_detail does not invalidate', async () => {
    const { buildMissingIngestionObservationUpdate } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    const update = buildMissingIngestionObservationUpdate(
      { outcome: 'ingested', failureReason: 'expired_after_detail' },
      NOW
    )

    expect(update).toEqual(baseMissingIngestionFields('ingested', 'expired_after_detail'))
    expect(update).not.toHaveProperty('ystm_valid_active')
  })

  it('preserves lootauraVisible=true when set', async () => {
    const { buildMissingIngestionObservationUpdate } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    const update = buildMissingIngestionObservationUpdate(
      { outcome: 'published', lootauraVisible: true },
      NOW
    )

    expect(update.lootaura_visible).toBe(true)
  })
})

describe('recordYstmCoverageMissingIngestionOutcome', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFromBase.mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('scenario 1 — persists atomic invalidation for expired_after_detail', async () => {
    const { update, eq } = setupUpdateMock()
    const { recordYstmCoverageMissingIngestionOutcome } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    await recordYstmCoverageMissingIngestionOutcome({} as never, CANONICAL_URL, {
      outcome: 'failed',
      failureReason: 'expired_after_detail',
    })

    expect(mockFromBase).toHaveBeenCalledWith({}, 'ystm_coverage_observations')
    expect(update).toHaveBeenCalledWith({
      ...baseMissingIngestionFields('failed', 'expired_after_detail'),
      ...EXPIRED_INVALIDATION_FIELDS,
    })
    expect(eq).toHaveBeenCalledWith('canonical_url', CANONICAL_URL)
  })

  it('scenario 2 — failed + fetch_failed writes missing-ingest fields only', async () => {
    const { update } = setupUpdateMock()
    const { recordYstmCoverageMissingIngestionOutcome } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    await recordYstmCoverageMissingIngestionOutcome({} as never, CANONICAL_URL, {
      outcome: 'failed',
      failureReason: 'fetch_failed',
    })

    expect(update).toHaveBeenCalledWith(baseMissingIngestionFields('failed', 'fetch_failed'))
  })

  it('throws on DB error (fail closed)', async () => {
    setupUpdateMock({ message: 'connection refused' })
    const { recordYstmCoverageMissingIngestionOutcome } = await import(
      '@/lib/ingestion/ystmCoverage/ystmCoverageObservationsStore'
    )

    await expect(
      recordYstmCoverageMissingIngestionOutcome({} as never, CANONICAL_URL, {
        outcome: 'failed',
        failureReason: 'expired_after_detail',
      })
    ).rejects.toThrow('connection refused')
  })
})
