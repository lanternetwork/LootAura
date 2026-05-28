import { describe, it, expect } from 'vitest'
import { getSaleFreshnessSignals, formatFreshnessSignalLabel } from '@/lib/seo/fetchMetroWeekendInventory'
import type { Sale } from '@/lib/types'

describe('fetchMetroWeekendInventory helpers', () => {
  const baseSale = {
    id: '1',
    owner_id: 'o',
    title: 'Test',
    status: 'published',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Sale

  it('includes active_this_weekend and newly_added for recent sales', () => {
    const signals = getSaleFreshnessSignals(baseSale)
    expect(signals).toContain('active_this_weekend')
    expect(signals).toContain('newly_added')
    expect(signals).toContain('updated_recently')
  })

  it('formats signal labels', () => {
    expect(formatFreshnessSignalLabel('newly_added')).toBe('Newly added')
  })
})
