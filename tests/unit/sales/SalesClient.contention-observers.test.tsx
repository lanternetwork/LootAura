/**
 * Unit tests that SalesClient contention observers (Long Task + RAF) start only after map_idle.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MAP_IDLE_EVENT } from '@/components/analytics/ClarityClient'

const observeSpy = vi.fn()
const MockPerformanceObserver = vi.fn().mockImplementation(function (this: any, callback: () => void) {
  this.observe = observeSpy
  this.disconnect = vi.fn()
  return this
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/sales',
}))

vi.mock('@/components/location/SimpleMap', () => ({ default: () => <div data-testid="simple-map" /> }))
vi.mock('@/app/sales/MobileSalesShell', () => ({ default: () => <div data-testid="mobile-shell" /> }))
vi.mock('@/components/sales/FiltersBar', () => ({ default: () => null }))
vi.mock('@/components/SaleCardSkeleton', () => ({ default: () => null }))
vi.mock('@/components/SalesList', () => ({ default: () => null }))
vi.mock('@/components/EmptyState', () => ({ default: () => null }))
vi.mock('@/components/sales/MobileFilterSheet', () => ({ default: () => null }))
vi.mock('@/components/map/UseMyLocationButton', () => ({ default: () => null }))
vi.mock('@/components/sales/MobileSaleCallout', () => ({ default: () => null }))
vi.mock('@/lib/hooks/useFilters', () => ({
  useFilters: () => ({
    filters: { distance: 10, dateRange: 'any', categories: [] },
    updateFilters: vi.fn(),
    clearFilters: vi.fn(),
    hasActiveFilters: false,
  }),
}))
vi.mock('@/contexts/MobileFilterContext', () => ({
  useMobileFilter: () => ({ open: vi.fn(), close: vi.fn() }),
}))
vi.mock('@/lib/keyboard/shortcuts', () => ({ useKeyboardShortcuts: () => {}, COMMON_SHORTCUTS: {} }))

describe('SalesClient contention observers', () => {
  let PerformanceObserverOriginal: typeof PerformanceObserver

  beforeEach(() => {
    vi.clearAllMocks()
    observeSpy.mockClear()
    PerformanceObserverOriginal = (global as any).PerformanceObserver
    ;(global as any).PerformanceObserver = MockPerformanceObserver
  })

  afterEach(() => {
    ;(global as any).PerformanceObserver = PerformanceObserverOriginal
  })

  it('does not start Long Task observer until after map_idle is observed', async () => {
    const SalesClient = (await import('@/app/sales/SalesClient')).default
    render(
      <SalesClient
        initialSales={[]}
        initialBufferedBounds={null}
        initialCenter={{ lat: 39.8283, lng: -98.5795 }}
        user={null}
      />
    )

    // Before map_idle: observer should not have been started (effect returns early because !mapIdleObserved)
    expect(observeSpy).not.toHaveBeenCalled()

    window.dispatchEvent(new CustomEvent(MAP_IDLE_EVENT))

    await waitFor(() => {
      expect(observeSpy).toHaveBeenCalled()
    })
  })
})
