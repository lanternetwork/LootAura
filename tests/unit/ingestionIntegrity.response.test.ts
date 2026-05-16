import { describe, expect, it } from 'vitest'
import { buildIngestionIntegrityResponse, CRITICAL_INDEX_NAMES } from '@/lib/admin/ingestionIntegrity'

describe('buildIngestionIntegrityResponse', () => {
  it('returns ok when all hard checks pass and no URL duplicate warning', () => {
    const payload = {
      generated_at: '2026-01-01T00:00:00+00:00',
      duplicate_ingested_sale_id_group_count: 0,
      duplicate_ingested_sale_id_samples: [],
      orphan_published_sale_id_count: 0,
      orphan_sales_ingested_id_count: 0,
      index_presence: CRITICAL_INDEX_NAMES.map((name) => ({ name, present: true })),
      duplicate_external_source_url_group_count: 0,
      duplicate_external_source_url_samples: [],
    }
    const res = buildIngestionIntegrityResponse(payload)
    expect(res.ok).toBe(true)
    expect(res.hardFailures).toEqual([])
    expect(res.warnings).toEqual([])
    expect(res.checks.some((c) => c.id === 'duplicate_sales_ingested_sale_id' && c.ok)).toBe(true)
    expect(res.checks.filter((c) => c.level === 'hard').every((c) => c.ok)).toBe(true)
  })

  it('fails hard on duplicate ingested_sale_id groups', () => {
    const res = buildIngestionIntegrityResponse({
      duplicate_ingested_sale_id_group_count: 2,
      duplicate_ingested_sale_id_samples: [{ ingested_sale_id: 'a', sale_count: 3 }],
      orphan_published_sale_id_count: 0,
      orphan_sales_ingested_id_count: 0,
      index_presence: CRITICAL_INDEX_NAMES.map((name) => ({ name, present: true })),
      duplicate_external_source_url_group_count: 0,
      duplicate_external_source_url_samples: [],
    })
    expect(res.ok).toBe(false)
    expect(res.hardFailures.some((m) => m.includes('ingested_sale_id'))).toBe(true)
  })

  it('fails hard when a critical index is missing', () => {
    const res = buildIngestionIntegrityResponse({
      duplicate_ingested_sale_id_group_count: 0,
      orphan_published_sale_id_count: 0,
      orphan_sales_ingested_id_count: 0,
      index_presence: [
        { name: 'idx_sales_ingested_sale_id_unique', present: false },
        { name: 'sales_geom_gist_idx', present: true },
        { name: 'idx_ingested_sales_publish_worker_claim', present: true },
        { name: 'idx_ingested_sales_geocode_claim', present: true },
      ],
      duplicate_external_source_url_group_count: 0,
      duplicate_external_source_url_samples: [],
    })
    expect(res.ok).toBe(false)
    expect(res.hardFailures.some((m) => m.includes('idx_sales_ingested_sale_id_unique'))).toBe(true)
  })

  it('warns on duplicate external_source_url but leaves ok true when no hard failures', () => {
    const res = buildIngestionIntegrityResponse({
      duplicate_ingested_sale_id_group_count: 0,
      orphan_published_sale_id_count: 0,
      orphan_sales_ingested_id_count: 0,
      index_presence: CRITICAL_INDEX_NAMES.map((name) => ({ name, present: true })),
      duplicate_external_source_url_group_count: 1,
      duplicate_external_source_url_samples: [{ external_source_url: 'https://example.com/a', sale_count: 2 }],
    })
    expect(res.ok).toBe(true)
    expect(res.warnings.length).toBeGreaterThan(0)
    const w = res.checks.find((c) => c.id === 'duplicate_external_source_url_published_imported')
    expect(w?.level).toBe('warning')
    expect(w?.ok).toBe(false)
  })

  it('includes raw when includeRaw is true', () => {
    const raw = { duplicate_ingested_sale_id_group_count: 0 }
    const res = buildIngestionIntegrityResponse(raw, { includeRaw: true })
    expect(res.raw).toEqual(raw)
  })
})
