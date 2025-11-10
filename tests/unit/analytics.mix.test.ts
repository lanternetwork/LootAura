/**
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest'

/**
 * Event mix helper function
 * Calculates event distribution based on mix percentages
 */
function calculateEventMix(
  totalEvents: number,
  mix: { view?: number; save?: number; click?: number; share?: number; favorite?: number }
): Array<{ type: string; count: number }> {
  const totalMix = Object.values(mix).reduce((sum, val) => sum + (val || 0), 0)
  if (totalMix === 0) {
    return []
  }

  return Object.entries(mix)
    .map(([type, count]) => ({
      type,
      count: Math.round((count || 0) / totalMix * totalEvents),
    }))
    .filter(item => item.count > 0)
}

describe('analytics event mix', () => {
  it('should calculate event distribution correctly', () => {
    const mix = { view: 50, save: 20, click: 15, share: 10, favorite: 5 }
    const totalEvents = 100
    const result = calculateEventMix(totalEvents, mix)

    expect(result).toHaveLength(5)
    expect(result.find(r => r.type === 'view')?.count).toBe(50)
    expect(result.find(r => r.type === 'save')?.count).toBe(20)
    expect(result.find(r => r.type === 'click')?.count).toBe(15)
    expect(result.find(r => r.type === 'share')?.count).toBe(10)
    expect(result.find(r => r.type === 'favorite')?.count).toBe(5)
  })

  it('should handle partial mix', () => {
    const mix = { view: 50, save: 50 }
    const totalEvents = 100
    const result = calculateEventMix(totalEvents, mix)

    expect(result).toHaveLength(2)
    expect(result.find(r => r.type === 'view')?.count).toBe(50)
    expect(result.find(r => r.type === 'save')?.count).toBe(50)
  })

  it('should handle zero mix values', () => {
    const mix = { view: 50, save: 0, click: 50 }
    const totalEvents = 100
    const result = calculateEventMix(totalEvents, mix)

    expect(result).toHaveLength(2)
    expect(result.find(r => r.type === 'view')?.count).toBe(50)
    expect(result.find(r => r.type === 'click')?.count).toBe(50)
    expect(result.find(r => r.type === 'save')).toBeUndefined()
  })

  it('should return empty array for zero total mix', () => {
    const mix = { view: 0, save: 0 }
    const totalEvents = 100
    const result = calculateEventMix(totalEvents, mix)

    expect(result).toHaveLength(0)
  })

  it('should round counts correctly', () => {
    const mix = { view: 33, save: 33, click: 34 }
    const totalEvents = 100
    const result = calculateEventMix(totalEvents, mix)

    const total = result.reduce((sum, r) => sum + r.count, 0)
    expect(total).toBe(100)
  })
})

