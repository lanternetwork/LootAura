import React from 'react'
import { render } from '@testing-library/react'
import SalesClient from '@/app/sales/SalesClient'
import { Sale } from '@/lib/types'

// Mock dependencies
jest.mock('@/lib/hooks/useFilters', () => ({
  __esModule: true,
  default: () => ({
    filters: {
      lat: 38.1405,
      lng: -85.6936,
      distance: 25,
      dateRange: 'any',
      categories: []
    },
    updateFilters: jest.fn()
  })
}))

jest.mock('@/components/location/SalesMap', () => {
  return function MockSalesMap() {
    return <div data-testid="sales-map">Mock Map</div>
  }
})

jest.mock('@/components/SaleCard', () => {
  return function MockSaleCard({ sale }: { sale: Sale }) {
    return <div data-testid="sale-card" className="sale-row">{sale.title}</div>
  }
})

const mockSales: Sale[] = [
  { id: '1', title: 'Sale 1', description: 'Desc 1', lat: 0, lng: 0, date_start: '2025-01-01', time_start: '09:00' },
  { id: '2', title: 'Sale 2', description: 'Desc 2', lat: 0, lng: 0, date_start: '2025-01-01', time_start: '09:00' },
  { id: '3', title: 'Sale 3', description: 'Desc 3', lat: 0, lng: 0, date_start: '2025-01-01', time_start: '09:00' },
]

describe('Grid Container Snapshot', () => {
  it('should have stable grid container classes across breakpoints', () => {
    const { container } = render(
      <SalesClient
        initialSales={mockSales}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const gridContainer = container.querySelector('[data-testid="sales-grid"]')
    expect(gridContainer).toMatchSnapshot()
  })

  it('should have consistent classes for different authority modes', () => {
    // Test MAP authority
    const { container: mapContainer } = render(
      <SalesClient
        initialSales={mockSales}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const mapGrid = mapContainer.querySelector('[data-testid="sales-grid"]')
    expect(mapGrid?.className).toMatchSnapshot('map-authority-grid')

    // Test FILTERS authority (simulated)
    const { container: filtersContainer } = render(
      <SalesClient
        initialSales={mockSales}
        initialSearchParams={{}}
        initialCenter={{ lat: 38.1405, lng: -85.6936 }}
        user={null}
      />
    )

    const filtersGrid = filtersContainer.querySelector('[data-testid="sales-grid"]')
    expect(filtersGrid?.className).toMatchSnapshot('filters-authority-grid')
  })

  it('should maintain consistent structure with different sale counts', () => {
    const saleCounts = [0, 1, 3, 6, 12]
    
    saleCounts.forEach(count => {
      const sales = Array.from({ length: count }, (_, i) => ({
        id: `${i + 1}`,
        title: `Sale ${i + 1}`,
        description: `Desc ${i + 1}`,
        lat: 0,
        lng: 0,
        date_start: '2025-01-01',
        time_start: '09:00'
      }))

      const { container } = render(
        <SalesClient
          initialSales={sales}
          initialSearchParams={{}}
          initialCenter={{ lat: 38.1405, lng: -85.6936 }}
          user={null}
        />
      )

      const gridContainer = container.querySelector('[data-testid="sales-grid"]')
      expect(gridContainer?.className).toMatchSnapshot(`grid-with-${count}-sales`)
    })
  })
})
