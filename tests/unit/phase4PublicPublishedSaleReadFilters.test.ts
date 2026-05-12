import { describe, it, expect, vi } from 'vitest'
import {
  applyPhase4PublicPublishedSaleReadFilters,
  phase4PublicLiveEndsAtOrFilter,
  phase4PublicModerationVisibleOrFilter,
  PHASE4_PUBLIC_PUBLISHED_READ_SQL_PREDICATE,
} from '@/lib/sales/phase4PublicPublishedSaleReadFilters'

describe('phase4PublicPublishedSaleReadFilters', () => {
  it('documents the SQL predicate string', () => {
    expect(PHASE4_PUBLIC_PUBLISHED_READ_SQL_PREDICATE).toContain("status = 'published'")
    expect(PHASE4_PUBLIC_PUBLISHED_READ_SQL_PREDICATE).toContain('archived_at IS NULL')
    expect(PHASE4_PUBLIC_PUBLISHED_READ_SQL_PREDICATE).toContain('ends_at IS NULL OR ends_at > now()')
    expect(PHASE4_PUBLIC_PUBLISHED_READ_SQL_PREDICATE).toContain(
      "moderation_status IS DISTINCT FROM 'hidden_by_admin'"
    )
  })

  it('phase4PublicLiveEndsAtOrFilter uses strict gt for boundary (ends_at = now is excluded)', () => {
    const t = new Date('2026-05-11T12:00:00.000Z')
    expect(phase4PublicLiveEndsAtOrFilter(t)).toBe('ends_at.is.null,ends_at.gt.2026-05-11T12:00:00.000Z')
  })

  it('phase4PublicModerationVisibleOrFilter keeps NULL moderation visible', () => {
    expect(phase4PublicModerationVisibleOrFilter()).toBe(
      'moderation_status.is.null,moderation_status.neq.hidden_by_admin'
    )
  })

  it('applyPhase4PublicPublishedSaleReadFilters chains eq, is, or, or by default', () => {
    const calls: string[] = []
    const query: any = {
      eq: vi.fn((a: string, b: string) => {
        calls.push(`eq:${a}=${b}`)
        return query
      }),
      is: vi.fn((a: string, b: string, c: null) => {
        calls.push(`is:${a}.${b}`)
        return query
      }),
      or: vi.fn((s: string) => {
        calls.push(`or:${s}`)
        return query
      }),
    }
    applyPhase4PublicPublishedSaleReadFilters(query, { now: new Date('2026-01-01T00:00:00.000Z') })
    expect(calls[0]).toBe('eq:status=published')
    expect(calls[1]).toBe('is:archived_at.is')
    expect(calls[2]).toBe('or:ends_at.is.null,ends_at.gt.2026-01-01T00:00:00.000Z')
    expect(calls[3]).toBe('or:moderation_status.is.null,moderation_status.neq.hidden_by_admin')
  })

  it('applyPhase4PublicPublishedSaleReadFilters can omit moderation or fragment', () => {
    const calls: string[] = []
    const query: any = {
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      or: vi.fn((s: string) => {
        calls.push(`or:${s}`)
        return query
      }),
    }
    applyPhase4PublicPublishedSaleReadFilters(query, { includeModeration: false })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('ends_at.is.null')
  })
})
