import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NearbySalesCard } from '@/components/sales/NearbySalesCard'
import { Sale } from '@/lib/types'

describe('NearbySalesCard', () => {
  const mockSale1: Sale & { distance_m: number } = {
    id: 'sale-1',
    owner_id: 'user-1',
    title: 'Test Sale 1',
    description: 'A test sale',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40202',
    lat: 38.2527,
    lng: -85.7585,
    date_start: '2024-12-15',
    time_start: '09:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: '2024-12-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    distance_m: 500, // 500 meters
    cover_image_url: 'https://res.cloudinary.com/test/image.jpg',
  }

  const mockSale2: Sale & { distance_m: number } = {
    id: 'sale-2',
    owner_id: 'user-2',
    title: 'Test Sale 2',
    description: 'Another test sale',
    city: 'Louisville',
    state: 'KY',
    zip_code: '40203',
    lat: 38.2600,
    lng: -85.7600,
    date_start: '2024-12-16',
    time_start: '10:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    created_at: '2024-12-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    distance_m: 1200, // 1.2 km
  }

  it('renders nothing when nearbySales is empty', () => {
    const { container } = render(<NearbySalesCard nearbySales={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when nearbySales is undefined', () => {
    const { container } = render(<NearbySalesCard nearbySales={undefined as any} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders heading when sales are provided', () => {
    render(<NearbySalesCard nearbySales={[mockSale1]} />)
    expect(screen.getByText('Nearby Sales')).toBeDefined()
  })

  it('renders sale title', () => {
    render(<NearbySalesCard nearbySales={[mockSale1]} />)
    expect(screen.getByText('Test Sale 1')).toBeDefined()
  })

  it('renders distance information', () => {
    render(<NearbySalesCard nearbySales={[mockSale1]} />)
    // formatDistance(500, 'miles') should produce something like "0.3 mi"
    expect(screen.getByText(/away/i)).toBeDefined()
  })

  it('renders date information', () => {
    render(<NearbySalesCard nearbySales={[mockSale1]} />)
    // Date should be formatted
    expect(screen.getByText(/Sat|Sun|Mon|Tue|Wed|Thu|Fri/i)).toBeDefined()
  })

  it('renders location information', () => {
    render(<NearbySalesCard nearbySales={[mockSale1]} />)
    expect(screen.getByText('Louisville, KY')).toBeDefined()
  })

  it('renders link to sale detail page', () => {
    render(<NearbySalesCard nearbySales={[mockSale1]} />)
    const link = screen.getByRole('link', { name: /test sale 1/i })
    expect(link).toBeDefined()
    expect(link.getAttribute('href')).toBe('/sales/sale-1')
  })

  it('renders multiple sales', () => {
    render(<NearbySalesCard nearbySales={[mockSale1, mockSale2]} />)
    expect(screen.getByText('Test Sale 1')).toBeDefined()
    expect(screen.getByText('Test Sale 2')).toBeDefined()
  })

  it('renders placeholder when sale has no cover image', () => {
    const saleWithoutImage: Sale & { distance_m: number } = {
      ...mockSale1,
      cover_image_url: null,
      images: null,
    }
    render(<NearbySalesCard nearbySales={[saleWithoutImage]} />)
    // Should still render the sale, just without an image
    expect(screen.getByText('Test Sale 1')).toBeDefined()
  })
})

