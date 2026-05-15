/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SaleDetailClient from '@/app/sales/[id]/SaleDetailClient'

const { mockGetSaleCoverUrl } = vi.hoisted(() => ({
  mockGetSaleCoverUrl: vi.fn(),
}))

vi.mock('next/navigation', async () => {
  const actual = await vi.importActual('next/navigation')
  return {
    ...actual,
    useSearchParams: vi.fn(() => ({
      get: vi.fn(() => null),
    })),
  }
})

vi.mock('@/lib/location/useLocation', () => ({
  useLocationSearch: vi.fn(() => ({
    location: null,
  })),
}))

vi.mock('@/lib/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ data: null })),
  useFavorites: vi.fn(() => ({ data: [] })),
  useToggleFavorite: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}))

vi.mock('@/lib/images/cover', () => ({
  getSaleCoverUrl: (...args: unknown[]) => mockGetSaleCoverUrl(...args),
}))

vi.mock('@/components/location/SimpleMap', () => ({
  default: () => <div data-testid="simple-map">Map</div>,
}))

vi.mock('@/components/sales/SellerActivityCard', () => ({
  SellerActivityCard: () => <div data-testid="seller-activity-card">Seller Activity</div>,
}))

vi.mock('@/components/sales/NearbySalesCard', () => ({
  NearbySalesCard: () => <div data-testid="nearby-sales-card">Nearby Sales</div>,
}))

vi.mock('@/components/ads/AdSlots', () => ({
  SaleDetailBannerAd: () => <div data-testid="sale-detail-banner-ad">Banner</div>,
}))

vi.mock('@/components/placeholders/SalePlaceholder', () => ({
  default: () => <div data-testid="sale-placeholder">Placeholder</div>,
}))

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('next/image', () => ({
  default: (props: {
    src: string
    alt: string
    className?: string
    sizes?: string
    'data-testid'?: string
    fill?: boolean
    priority?: boolean
    [key: string]: unknown
  }) => {
    const { src, alt, className, sizes, 'data-testid': dataTestId } = props
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        sizes={sizes}
        data-testid={dataTestId}
      />
    )
  },
}))

const mockSale = {
  id: 'test-sale-id',
  owner_id: 'test-owner-id',
  title: 'Test Sale',
  description: 'Test description',
  address: '123 Test St',
  city: 'Test City',
  state: 'TS',
  zip_code: '12345',
  lat: 38.2527,
  lng: -85.7585,
  date_start: '2025-11-15',
  time_start: '09:00',
  date_end: null,
  time_end: null,
  tags: ['furniture'],
  status: 'published' as const,
  privacy_mode: 'exact' as const,
  is_featured: false,
  pricing_mode: 'negotiable' as const,
  created_at: '2025-11-01T00:00:00Z',
  updated_at: '2025-11-01T00:00:00Z',
  owner_profile: null,
  owner_stats: {
    total_sales: 0,
    avg_rating: 5.0,
    ratings_count: 0,
    last_sale_at: null,
  },
}

describe('SaleDetailClient cover image rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses next/image path for trusted hosts', () => {
    mockGetSaleCoverUrl.mockReturnValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg',
      alt: 'Trusted image',
    })

    render(<SaleDetailClient sale={mockSale as any} displayCategories={[]} items={[]} />)

    expect(screen.getAllByTestId('sale-detail-cover-next-image').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('sale-detail-cover-external-img')).not.toBeInTheDocument()
  })

  it('uses native img fallback for untrusted external hosts', () => {
    mockGetSaleCoverUrl.mockReturnValue({
      url: 'https://images.example.net/cover.jpg',
      alt: 'External image',
    })

    render(<SaleDetailClient sale={mockSale as any} displayCategories={[]} items={[]} />)

    expect(screen.getAllByTestId('sale-detail-cover-external-img').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('sale-detail-cover-next-image')).not.toBeInTheDocument()
  })

  it('renders placeholder when no cover image exists', () => {
    mockGetSaleCoverUrl.mockReturnValue(null)

    render(<SaleDetailClient sale={mockSale as any} displayCategories={[]} items={[]} />)

    expect(screen.getAllByTestId('sale-placeholder').length).toBeGreaterThan(0)
  })

  it('renders gallery thumbnails and switches selected image', () => {
    mockGetSaleCoverUrl.mockReturnValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg',
      alt: 'Trusted image',
    })
    const saleWithGallery = {
      ...mockSale,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/1.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1/2.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1/3.jpg',
      ],
    }

    render(<SaleDetailClient sale={saleWithGallery as any} displayCategories={[]} items={[]} />)

    const thumbnails = screen.getAllByLabelText('Show sale image 3')
    expect(thumbnails.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(thumbnails[0])

    expect(screen.getAllByAltText(/Sale thumbnail/i).length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('sale-detail-cover-next-image')[0]).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/demo/image/upload/v1/3.jpg'
    )
  })

  it('renders up to 10 gallery thumbnails for trusted hosts', () => {
    const images = Array.from({ length: 10 }, (_, i) => `https://res.cloudinary.com/demo/image/upload/v1/t${i + 1}.jpg`)
    mockGetSaleCoverUrl.mockReturnValue({
      url: images[0],
      alt: 'Trusted image',
    })
    const saleWithTen = {
      ...mockSale,
      cover_image_url: images[0],
      images,
    }

    render(<SaleDetailClient sale={saleWithTen as any} displayCategories={[]} items={[]} />)

    for (let i = 0; i < 10; i += 1) {
      expect(screen.getAllByLabelText(`Show sale image ${i + 1}`).length).toBeGreaterThan(0)
    }
  })
})
