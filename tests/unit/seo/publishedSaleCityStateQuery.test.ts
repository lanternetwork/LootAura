import { describe, it, expect } from 'vitest'
import { applyPublishedSaleCityStateFootprint } from '@/lib/seo/publishedSaleCityStateQuery'

describe('applyPublishedSaleCityStateFootprint', () => {
  it('filters published sales with city and state', () => {
    const calls: string[] = []
    const query = {
      eq: (col: string, val: string) => {
        calls.push(`eq:${col}=${val}`)
        return query
      },
      not: (col: string, op: string, val: null) => {
        calls.push(`not:${col}.${op}`)
        return query
      },
    }

    applyPublishedSaleCityStateFootprint(query)

    expect(calls).toContain('eq:status=published')
    expect(calls).toContain('not:city.is')
    expect(calls).toContain('not:state.is')
  })
})
