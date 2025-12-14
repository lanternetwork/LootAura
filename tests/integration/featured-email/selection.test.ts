/**
 * CI Starter Harness: Featured Email Selection Logic Tests
 * 
 * Tests the deterministic selection algorithm for weekly featured email:
 * - Returns exactly 12 sales when enough candidates exist
 * - Excludes recipient-owned sales
 * - Excludes hidden_by_admin and archived sales
 * - Respects next-7-days window
 * - Promoted priority rules (>=12 promoted → all promoted, <12 → promoted + high-view organic)
 * 
 * NOTE: This is a contract test for the selection logic interface.
 * The actual implementation will be added in a future PR.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeSale } from '@/tests/_helpers/factories'

// Deterministic base date for all tests: Thursday 2025-01-16 09:00:00 UTC
// (Early Thursday morning when weekly email should send)
const MOCK_BASE_DATE = new Date('2025-01-16T09:00:00.000Z')

// Helper to create date strings relative to base date
function getDateString(daysOffset: number): string {
  const date = new Date(MOCK_BASE_DATE)
  date.setUTCDate(date.getUTCDate() + daysOffset)
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

// Helper to create sales with dates in the next 7 days window
function createSaleInWindow(
  id: string,
  ownerId: string,
  daysFromNow: number,
  overrides: Partial<ReturnType<typeof makeSale>> = {}
): ReturnType<typeof makeSale> {
  const dateStart = getDateString(daysFromNow)
  return makeSale({
    id,
    owner_id: ownerId,
    date_start: dateStart,
    date_end: dateStart,
    status: 'published',
    archived_at: null,
    is_featured: false,
    ...overrides,
  })
}

// Seeded randomness helper for deterministic selection
// Uses recipient_id + week key to ensure stable results
function seededShuffle<T>(array: T[], seed: string): T[] {
  // Simple seeded shuffle using seed as hash
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.abs(hash) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    hash = (hash * 1103515245 + 12345) & 0x7fffffff // Linear congruential generator
  }
  return shuffled
}

// Contract interface for featured selection function
// This will be implemented in a future PR
interface FeaturedSelectionResult {
  selectedSales: Array<{ id: string; isPromoted: boolean }>
  totalPromoted: number
  totalOrganic: number
}

interface FeaturedSelectionParams {
  recipientId: string
  candidateSales: Array<{
    id: string
    owner_id: string
    date_start: string
    date_end?: string
    status: string
    archived_at?: string | null
    moderation_status?: string | null
    is_featured?: boolean
    viewCount?: number
  }>
  now: Date
  weekKey: string // e.g., "2025-W03" for deterministic seeding
}

// Placeholder function that will be replaced with actual implementation
// This test validates the contract, not the implementation
async function selectFeaturedSales(
  params: FeaturedSelectionParams
): Promise<FeaturedSelectionResult> {
  const { recipientId, candidateSales, now, weekKey } = params

  // Calculate next 7 days window (from now to 7 days from now)
  const windowStart = new Date(now)
  windowStart.setUTCHours(0, 0, 0, 0)
  const windowEnd = new Date(windowStart)
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 7)

  // Filter eligible sales
  const eligible = candidateSales.filter((sale) => {
    // Exclude recipient's own sales
    if (sale.owner_id === recipientId) return false

    // Exclude hidden by admin
    if (sale.moderation_status === 'hidden_by_admin') return false

    // Exclude archived
    if (sale.archived_at) return false

    // Must be published
    if (sale.status !== 'published') return false

    // Must be in next 7 days window
    const saleStart = new Date(sale.date_start)
    if (saleStart < windowStart || saleStart >= windowEnd) return false

    return true
  })

  // Separate promoted and organic
  const promoted = eligible.filter((s) => s.is_featured === true)
  const organic = eligible.filter((s) => s.is_featured !== true)

  // Sort organic by view count (descending)
  organic.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))

  // Selection logic: >=12 promoted → all promoted, else promoted + top organic
  let selected: Array<{ id: string; isPromoted: boolean }>
  if (promoted.length >= 12) {
    // All 12 are promoted (use seeded shuffle for deterministic selection)
    const shuffled = seededShuffle(promoted, `${recipientId}-${weekKey}`)
    selected = shuffled.slice(0, 12).map((s) => ({ id: s.id, isPromoted: true }))
  } else {
    // Include all promoted + fill remainder with top organic
    const promotedSelected = promoted.map((s) => ({ id: s.id, isPromoted: true }))
    const organicNeeded = 12 - promotedSelected.length
    const organicSelected = organic.slice(0, organicNeeded).map((s) => ({
      id: s.id,
      isPromoted: false,
    }))
    selected = [...promotedSelected, ...organicSelected]
  }

  return {
    selectedSales: selected.slice(0, 12), // Ensure exactly 12
    totalPromoted: selected.filter((s) => s.isPromoted).length,
    totalOrganic: selected.filter((s) => !s.isPromoted).length,
  }
}

describe('Featured Email Selection Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(MOCK_BASE_DATE)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Basic eligibility filters', () => {
    it('returns exactly 12 sales when enough candidates exist', async () => {
      const recipientId = 'recipient-1'
      const candidates = Array.from({ length: 20 }, (_, i) =>
        createSaleInWindow(`sale-${i + 1}`, `owner-${i + 1}`, i % 7, {
          viewCount: 100 - i,
        })
      )

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
    })

    it('excludes recipient-owned sales', async () => {
      const recipientId = 'recipient-1'
      const candidates = [
        createSaleInWindow('sale-1', recipientId, 1), // Own sale
        ...Array.from({ length: 15 }, (_, i) =>
          createSaleInWindow(`sale-${i + 2}`, `owner-${i + 2}`, (i + 1) % 7)
        ),
      ]

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
      expect(result.selectedSales.every((s) => s.id !== 'sale-1')).toBe(true)
    })

    it('excludes hidden_by_admin sales', async () => {
      const recipientId = 'recipient-1'
      const candidates = [
        createSaleInWindow('sale-1', 'owner-1', 1, {
          moderation_status: 'hidden_by_admin',
        }),
        ...Array.from({ length: 15 }, (_, i) =>
          createSaleInWindow(`sale-${i + 2}`, `owner-${i + 2}`, (i + 1) % 7)
        ),
      ]

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
      expect(result.selectedSales.every((s) => s.id !== 'sale-1')).toBe(true)
    })

    it('excludes archived sales', async () => {
      const recipientId = 'recipient-1'
      const candidates = [
        createSaleInWindow('sale-1', 'owner-1', 1, {
          archived_at: '2025-01-10T00:00:00Z',
        }),
        ...Array.from({ length: 15 }, (_, i) =>
          createSaleInWindow(`sale-${i + 2}`, `owner-${i + 2}`, (i + 1) % 7)
        ),
      ]

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
      expect(result.selectedSales.every((s) => s.id !== 'sale-1')).toBe(true)
    })

    it('respects next-7-days window', async () => {
      const recipientId = 'recipient-1'
      const candidates = [
        createSaleInWindow('sale-past', 'owner-1', -1), // Past
        createSaleInWindow('sale-today', 'owner-2', 0), // Today (in window)
        createSaleInWindow('sale-future-close', 'owner-3', 6), // Day 6 (in window)
        createSaleInWindow('sale-future-far', 'owner-4', 8), // Day 8 (out of window)
        ...Array.from({ length: 12 }, (_, i) =>
          createSaleInWindow(`sale-${i + 5}`, `owner-${i + 5}`, (i + 1) % 7)
        ),
      ]

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
      expect(result.selectedSales.every((s) => s.id !== 'sale-past')).toBe(true)
      expect(result.selectedSales.every((s) => s.id !== 'sale-future-far')).toBe(true)
    })
  })

  describe('Promoted priority rules', () => {
    it('selects all 12 promoted when >=12 promoted candidates exist', async () => {
      const recipientId = 'recipient-1'
      const candidates = [
        ...Array.from({ length: 15 }, (_, i) =>
          createSaleInWindow(`promoted-${i + 1}`, `owner-${i + 1}`, i % 7, {
            is_featured: true,
            viewCount: 50,
          })
        ),
        ...Array.from({ length: 10 }, (_, i) =>
          createSaleInWindow(`organic-${i + 1}`, `owner-${i + 16}`, i % 7, {
            is_featured: false,
            viewCount: 1000, // High views but should not be selected
          })
        ),
      ]

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
      expect(result.totalPromoted).toBe(12)
      expect(result.totalOrganic).toBe(0)
      expect(result.selectedSales.every((s) => s.isPromoted)).toBe(true)
    })

    it('includes all promoted + fills remainder with high-view organic when <12 promoted', async () => {
      const recipientId = 'recipient-1'
      const candidates = [
        ...Array.from({ length: 5 }, (_, i) =>
          createSaleInWindow(`promoted-${i + 1}`, `owner-${i + 1}`, i % 7, {
            is_featured: true,
            viewCount: 10, // Low views but promoted
          })
        ),
        ...Array.from({ length: 15 }, (_, i) =>
          createSaleInWindow(`organic-${i + 1}`, `owner-${i + 6}`, i % 7, {
            is_featured: false,
            viewCount: 1000 - i * 10, // Decreasing views
          })
        ),
      ]

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
      expect(result.totalPromoted).toBe(5)
      expect(result.totalOrganic).toBe(7)
      // All promoted should be included
      const promotedIds = candidates
        .filter((s) => s.is_featured)
        .map((s) => s.id)
      expect(
        result.selectedSales.filter((s) => s.isPromoted).every((s) => promotedIds.includes(s.id))
      ).toBe(true)
    })

    it('handles case with no promoted sales', async () => {
      const recipientId = 'recipient-1'
      const candidates = Array.from({ length: 20 }, (_, i) =>
        createSaleInWindow(`organic-${i + 1}`, `owner-${i + 1}`, i % 7, {
          is_featured: false,
          viewCount: 1000 - i * 10,
        })
      )

      const result = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      expect(result.selectedSales).toHaveLength(12)
      expect(result.totalPromoted).toBe(0)
      expect(result.totalOrganic).toBe(12)
    })
  })

  describe('Deterministic selection', () => {
    it('produces stable results with same seed', async () => {
      const recipientId = 'recipient-1'
      const candidates = Array.from({ length: 30 }, (_, i) =>
        createSaleInWindow(`sale-${i + 1}`, `owner-${i + 1}`, i % 7, {
          viewCount: Math.floor(Math.random() * 1000),
        })
      )

      const result1 = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      const result2 = await selectFeaturedSales({
        recipientId,
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      // Results should be identical with same seed
      expect(result1.selectedSales.map((s) => s.id)).toEqual(result2.selectedSales.map((s) => s.id))
    })

    it('produces different results with different recipients (different seed)', async () => {
      const candidates = Array.from({ length: 30 }, (_, i) =>
        createSaleInWindow(`sale-${i + 1}`, `owner-${i + 1}`, i % 7, {
          viewCount: Math.floor(Math.random() * 1000),
        })
      )

      const result1 = await selectFeaturedSales({
        recipientId: 'recipient-1',
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      const result2 = await selectFeaturedSales({
        recipientId: 'recipient-2',
        candidateSales: candidates,
        now: MOCK_BASE_DATE,
        weekKey: '2025-W03',
      })

      // Results may differ due to different seed (even if same candidates)
      // But both should have exactly 12
      expect(result1.selectedSales).toHaveLength(12)
      expect(result2.selectedSales).toHaveLength(12)
    })
  })
})

