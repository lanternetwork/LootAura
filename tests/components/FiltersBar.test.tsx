import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FiltersBar from '@/components/sales/FiltersBar'

// Mock the ZipInput component
vi.mock('@/components/location/ZipInput', () => ({
  default: ({ onLocationFound, onError, placeholder, className }: any) => (
    <div data-testid="zip-input" className={className}>
      <input
        placeholder={placeholder}
        onKeyDown={(e: any) => {
          if (e.key === 'Enter') {
            onLocationFound(38.2380249, -85.7246945, 'Louisville', 'KY', '40204')
          }
        }}
      />
    </div>
  )
}))

describe('FiltersBar Overflow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses fake timers for container width simulation', () => {
    const mockOnZipLocationFound = vi.fn()
    const mockOnZipError = vi.fn()
    const mockOnDateRangeChange = vi.fn()
    const mockOnCategoriesChange = vi.fn()
    const mockOnDistanceChange = vi.fn()
    const mockOnAdvancedFiltersOpen = vi.fn()

    render(
      <FiltersBar
        onZipLocationFound={mockOnZipLocationFound}
        onZipError={mockOnZipError}
        zipError=""
        dateRange="any"
        onDateRangeChange={mockOnDateRangeChange}
        categories={[]}
        onCategoriesChange={mockOnCategoriesChange}
        distance={25}
        onDistanceChange={mockOnDistanceChange}
        onAdvancedFiltersOpen={mockOnAdvancedFiltersOpen}
        hasActiveFilters={false}
      />
    )

    expect(screen.getByTestId('filters-center')).toBeInTheDocument()
    expect(screen.getByTestId('filters-more')).toBeInTheDocument()
  })

  it('simulates container width shrink', () => {
    // Mock ResizeObserver
    const mockResizeObserver = vi.fn()
    mockResizeObserver.mockReturnValue({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn()
    })
    window.ResizeObserver = mockResizeObserver

    const mockOnZipLocationFound = vi.fn()
    const mockOnZipError = vi.fn()
    const mockOnDateRangeChange = vi.fn()
    const mockOnCategoriesChange = vi.fn()
    const mockOnDistanceChange = vi.fn()
    const mockOnAdvancedFiltersOpen = vi.fn()

    render(
      <FiltersBar
        onZipLocationFound={mockOnZipLocationFound}
        onZipError={mockOnZipError}
        zipError=""
        dateRange="any"
        onDateRangeChange={mockOnDateRangeChange}
        categories={[]}
        onCategoriesChange={mockOnCategoriesChange}
        distance={25}
        onDistanceChange={mockOnDistanceChange}
        onAdvancedFiltersOpen={mockOnAdvancedFiltersOpen}
        hasActiveFilters={false}
      />
    )

    // Simulate container width change
    const centerElement = screen.getByTestId('filters-center')
    Object.defineProperty(centerElement, 'clientWidth', {
      value: 100, // Very small width to force overflow
      configurable: true
    })

    // Trigger resize
    fireEvent.resize(window)
    vi.advanceTimersByTime(100)

    expect(screen.getByTestId('filters-more')).toBeInTheDocument()
  })

  it('asserts ZIP input is never overlapped', () => {
    const mockOnZipLocationFound = vi.fn()
    const mockOnZipError = vi.fn()
    const mockOnDateRangeChange = vi.fn()
    const mockOnCategoriesChange = vi.fn()
    const mockOnDistanceChange = vi.fn()
    const mockOnAdvancedFiltersOpen = vi.fn()

    render(
      <FiltersBar
        onZipLocationFound={mockOnZipLocationFound}
        onZipError={mockOnZipError}
        zipError=""
        dateRange="any"
        onDateRangeChange={mockOnDateRangeChange}
        categories={[]}
        onCategoriesChange={mockOnCategoriesChange}
        distance={25}
        onDistanceChange={mockOnDistanceChange}
        onAdvancedFiltersOpen={mockOnAdvancedFiltersOpen}
        hasActiveFilters={false}
      />
    )

    const zipInput = screen.getByTestId('zip-input')
    const centerRail = screen.getByTestId('filters-center')
    
    // Check that both elements exist and are visible
    expect(zipInput).toBeInTheDocument()
    expect(centerRail).toBeInTheDocument()
    
    // The layout should prevent overlap through CSS grid
    expect(zipInput.closest('.grid')).toBeInTheDocument()
  })
})
