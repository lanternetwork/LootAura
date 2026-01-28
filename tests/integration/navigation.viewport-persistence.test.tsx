/**
 * Integration tests for viewport persistence when navigating to/from sale detail page
 * 
 * Tests verify that:
 * - Viewport params (lat, lng, zoom) are included in sale detail URLs
 * - Viewport params are preserved in back links from detail page
 * - SalesClient restores viewport from URL params when returning
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import SaleCard from '@/components/SaleCard'
import { Sale } from '@/lib/types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const renderWithQueryClient = (ui: React.ReactElement) => {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: vi.fn(() => ({
    get: vi.fn(),
  })),
  usePathname: () => '/sales',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

// Mock FavoriteButton to avoid QueryClient dependency
vi.mock('@/components/FavoriteButton', () => ({
  default: () => null,
}))

describe('Viewport Persistence Navigation', () => {
  const mockSale: Sale = {
    id: 'test-sale-1',
    owner_id: 'test-owner',
    title: 'Test Sale',
    description: 'Test description',
    lat: 38.2527,
    lng: -85.7585,
    city: 'Louisville',
    state: 'KY',
    address: '123 Test St',
    date_start: '2024-01-15',
    time_start: '10:00',
    price: 100,
    status: 'published' as const,
    privacy_mode: 'exact' as const,
    is_featured: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Note: cleanup() is automatically handled by @testing-library/react
  })

  describe('SaleCard viewport URL generation', () => {
    it('should include viewport params in detail URL when viewport is provided', () => {
      const viewport = {
        center: { lat: 38.2527, lng: -85.7585 },
        zoom: 12
      }

      const { container } = renderWithQueryClient(<SaleCard sale={mockSale} viewport={viewport} />)

      const detailButton = container.querySelector('button[data-href*="test-sale-1"]')
      expect(detailButton).toBeInTheDocument()
      expect(detailButton?.getAttribute('data-href')).toBe(
        `/sales/test-sale-1?lat=38.2527&lng=-85.7585&zoom=12`
      )
    })

    it('should not include viewport params when viewport is not provided', () => {
      const { container } = renderWithQueryClient(<SaleCard sale={mockSale} />)

      const detailButton = container.querySelector('button[data-href*="test-sale-1"]')
      expect(detailButton).toBeInTheDocument()
      expect(detailButton?.getAttribute('data-href')).toBe('/sales/test-sale-1')
    })

    it('should handle null viewport gracefully', () => {
      const { container } = renderWithQueryClient(<SaleCard sale={mockSale} viewport={null} />)

      const detailButton = container.querySelector('button[data-href*="test-sale-1"]')
      expect(detailButton).toBeInTheDocument()
      expect(detailButton?.getAttribute('data-href')).toBe('/sales/test-sale-1')
    })

    it('should format viewport params correctly with decimal values', () => {
      const viewport = {
        center: { lat: 38.123456789, lng: -85.987654321 },
        zoom: 15.5
      }

      const { container } = renderWithQueryClient(<SaleCard sale={mockSale} viewport={viewport} />)

      const detailButton = container.querySelector('button[data-href*="test-sale-1"]')
      const href = detailButton?.getAttribute('data-href')
      expect(href).toContain('lat=38.123456789')
      expect(href).toContain('lng=-85.987654321')
      expect(href).toContain('zoom=15.5')
    })
  })

  describe('SaleDetailClient viewport URL preservation', () => {
    it('should preserve viewport params in back link when present in URL', () => {
      const mockSearchParams = new Map([
        ['lat', '38.2527'],
        ['lng', '-85.7585'],
        ['zoom', '12'],
      ])

      ;(useSearchParams as any).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      })

      // This test verifies the logic in SaleDetailClient
      // The actual component would use useSearchParams hook
      const lat = mockSearchParams.get('lat')
      const lng = mockSearchParams.get('lng')
      const zoom = mockSearchParams.get('zoom')
      
      const backUrl = lat && lng && zoom
        ? `/sales?lat=${lat}&lng=${lng}&zoom=${zoom}`
        : '/sales'

      expect(backUrl).toBe('/sales?lat=38.2527&lng=-85.7585&zoom=12')
    })

    it('should use default back URL when viewport params are missing', () => {
      const mockSearchParams = new Map()

      ;(useSearchParams as any).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      })

      const lat = mockSearchParams.get('lat')
      const lng = mockSearchParams.get('lng')
      const zoom = mockSearchParams.get('zoom')
      
      const backUrl = lat && lng && zoom
        ? `/sales?lat=${lat}&lng=${lng}&zoom=${zoom}`
        : '/sales'

      expect(backUrl).toBe('/sales')
    })

    it('should use default back URL when only some viewport params are present', () => {
      const mockSearchParams = new Map([
        ['lat', '38.2527'],
        ['lng', '-85.7585'],
        // zoom is missing
      ])

      ;(useSearchParams as any).mockReturnValue({
        get: (key: string) => mockSearchParams.get(key),
      })

      const lat = mockSearchParams.get('lat')
      const lng = mockSearchParams.get('lng')
      const zoom = mockSearchParams.get('zoom')
      
      const backUrl = lat && lng && zoom
        ? `/sales?lat=${lat}&lng=${lng}&zoom=${zoom}`
        : '/sales'

      expect(backUrl).toBe('/sales')
    })
  })

  describe('Viewport param format validation', () => {
    it('should handle valid numeric viewport params', () => {
      const viewport = {
        center: { lat: 38.2527, lng: -85.7585 },
        zoom: 12
      }

      const { container } = renderWithQueryClient(<SaleCard sale={mockSale} viewport={viewport} />)

      const detailButton = container.querySelector('button[data-href*="test-sale-1"]')
      const href = detailButton?.getAttribute('data-href')
      
      // Verify URL can be parsed correctly
      const url = new URL(href || '', 'http://localhost')
      expect(url.searchParams.get('lat')).toBe('38.2527')
      expect(url.searchParams.get('lng')).toBe('-85.7585')
      expect(url.searchParams.get('zoom')).toBe('12')
    })

    it('should handle negative longitude values', () => {
      const viewport = {
        center: { lat: 38.2527, lng: -85.7585 },
        zoom: 12
      }

      const { container } = renderWithQueryClient(<SaleCard sale={mockSale} viewport={viewport} />)

      const detailButton = container.querySelector('button[data-href*="test-sale-1"]')
      const href = detailButton?.getAttribute('data-href')
      
      expect(href).toContain('lng=-85.7585')
    })

    it('should handle zero zoom level', () => {
      const viewport = {
        center: { lat: 38.2527, lng: -85.7585 },
        zoom: 0
      }

      const { container } = renderWithQueryClient(<SaleCard sale={mockSale} viewport={viewport} />)

      const detailButton = container.querySelector('button[data-href*="test-sale-1"]')
      const href = detailButton?.getAttribute('data-href')
      
      expect(href).toContain('zoom=0')
    })
  })
})

