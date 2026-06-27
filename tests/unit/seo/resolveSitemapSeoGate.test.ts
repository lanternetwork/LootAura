import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveSitemapSeoGate } from '@/lib/seo/resolveSitemapSeoGate'
import { SEO_SNAPSHOT_MAX_AGE_MS } from '@/lib/seo/snapshots/constants'
import { enabledSeoRolloutState } from './seoRolloutTestHelpers'

const loadSeoEnablementSnapshotMock = vi.fn()
const fetchSeoRolloutStateMock = vi.fn()
const countQualifiedSeoMetrosMock = vi.fn()
const countGeographyQualifiedOverridesMock = vi.fn()

vi.mock('@/lib/seo/snapshots/loadSeoEnablementSnapshot', () => ({
  loadSeoEnablementSnapshot: (...args: unknown[]) => loadSeoEnablementSnapshotMock(...args),
  isEnablementSnapshotFresh: (updatedAt: string | null | undefined, now: number, maxAgeMs: number) => {
    if (!updatedAt) return false
    const ageMs = now - new Date(updatedAt).getTime()
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs
  },
}))

vi.mock('@/lib/seo/seoRolloutState', () => ({
  fetchSeoRolloutState: (...args: unknown[]) => fetchSeoRolloutStateMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoQualifiedMetros', () => ({
  countQualifiedSeoMetros: (...args: unknown[]) => countQualifiedSeoMetrosMock(...args),
}))

vi.mock('@/lib/seo/snapshots/loadSeoMetroGeography', () => ({
  countGeographyQualifiedOverrides: (...args: unknown[]) =>
    countGeographyQualifiedOverridesMock(...args),
}))

function freshSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    coverage_pct: 98.6,
    effective_missing_valid: 36,
    duplicate_canonical_clusters: 0,
    published_active_inventory: 2581,
    seo_gate_passed: true,
    updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    ...overrides,
  }
}

describe('resolveSitemapSeoGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchSeoRolloutStateMock.mockResolvedValue(enabledSeoRolloutState())
    countQualifiedSeoMetrosMock.mockResolvedValue(3)
    countGeographyQualifiedOverridesMock.mockResolvedValue(12)
  })

  it('fail-closed when enablement snapshot is missing', async () => {
    loadSeoEnablementSnapshotMock.mockResolvedValue(null)
    const gate = await resolveSitemapSeoGate()
    expect(gate).toEqual({
      seoEmissionAllowed: false,
      indexingAllowed: false,
      snapshotFresh: false,
      qualifiedMetroCount: 0,
    })
  })

  it('fail-closed when enablement snapshot is stale', async () => {
    loadSeoEnablementSnapshotMock.mockResolvedValue(
      freshSnapshot({
        updated_at: new Date(Date.now() - SEO_SNAPSHOT_MAX_AGE_MS - 60_000).toISOString(),
      })
    )
    const gate = await resolveSitemapSeoGate()
    expect(gate.seoEmissionAllowed).toBe(false)
    expect(gate.snapshotFresh).toBe(false)
  })

  it('seoEmissionAllowed requires metric gate and attestations', async () => {
    loadSeoEnablementSnapshotMock.mockResolvedValue(freshSnapshot())
    fetchSeoRolloutStateMock.mockResolvedValue(
      enabledSeoRolloutState({ publicIndexingEnabled: false })
    )
    const gate = await resolveSitemapSeoGate()
    expect(gate.seoEmissionAllowed).toBe(false)
    expect(gate.indexingAllowed).toBe(false)
  })

  it('indexingAllowed allows geo segments when seeded majors exist even with zero qualified metros', async () => {
    loadSeoEnablementSnapshotMock.mockResolvedValue(freshSnapshot())
    countQualifiedSeoMetrosMock.mockResolvedValue(0)
    const gate = await resolveSitemapSeoGate()
    expect(gate.seoEmissionAllowed).toBe(true)
    expect(gate.indexingAllowed).toBe(true)
    expect(gate.qualifiedMetroCount).toBe(0)
  })

  it('allows emission and indexing when snapshot fresh, metrics pass, and metros qualified', async () => {
    loadSeoEnablementSnapshotMock.mockResolvedValue(freshSnapshot())
    const gate = await resolveSitemapSeoGate()
    expect(gate).toEqual({
      seoEmissionAllowed: true,
      indexingAllowed: true,
      snapshotFresh: true,
      qualifiedMetroCount: 3,
    })
  })
})
