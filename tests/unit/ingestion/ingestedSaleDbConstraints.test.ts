import { describe, expect, it } from 'vitest'
import { ingestedSaleTimeSourceForDb } from '@/lib/ingestion/ingestedSaleDbConstraints'

describe('ingestedSaleTimeSourceForDb', () => {
  it('passes explicit and default through', () => {
    expect(ingestedSaleTimeSourceForDb('explicit')).toBe('explicit')
    expect(ingestedSaleTimeSourceForDb('default')).toBe('default')
  })

  it('maps ystm_detail_page to explicit for legacy CHECK compatibility', () => {
    expect(ingestedSaleTimeSourceForDb('ystm_detail_page')).toBe('explicit')
  })

  it('returns null for empty values', () => {
    expect(ingestedSaleTimeSourceForDb(null)).toBeNull()
    expect(ingestedSaleTimeSourceForDb('')).toBeNull()
    expect(ingestedSaleTimeSourceForDb('   ')).toBeNull()
  })

  it('coerces unknown values to explicit', () => {
    expect(ingestedSaleTimeSourceForDb('external_list_page')).toBe('explicit')
  })
})
