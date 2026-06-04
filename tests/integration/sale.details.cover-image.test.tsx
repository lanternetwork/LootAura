/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import SaleDetailClient from '@/app/sales/[id]/SaleDetailClient'

const { mockGetSaleCoverUrl, simpleMapRenderProps } = vi.hoisted(() => ({
  mockGetSaleCoverUrl: vi.fn(),
  simpleMapRenderProps: [] as Array<{ interactive?: boolean }>,
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
  default: (props: { interactive?: boolean }) => {
    simpleMapRenderProps.push(props)
    return <div data-testid="simple-map">Map</div>
  },
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
    onLoad?: () => void
    onError?: () => void
    [key: string]: unknown
  }) => {
    const { src, alt, className, sizes, onLoad, onError, 'data-testid': dataTestId } = props
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        sizes={sizes}
        data-testid={dataTestId}
        onLoad={onLoad}
        onError={onError}
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
    simpleMapRenderProps.length = 0
  })

  it('renders Location preview map as non-interactive on mobile and desktop', () => {
    render(<SaleDetailClient sale={mockSale as any} displayCategories={[]} items={[]} />)

    expect(screen.getAllByTestId('simple-map').length).toBeGreaterThan(0)
    expect(simpleMapRenderProps.length).toBeGreaterThan(0)
    expect(simpleMapRenderProps.every((props) => props.interactive === false)).toBe(true)
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

  it('shows placeholder when cover image fails to load', () => {
    mockGetSaleCoverUrl.mockReturnValue({
      url: 'https://images.example.net/broken-cover.jpg',
      alt: 'Broken image',
    })

    render(<SaleDetailClient sale={mockSale as any} displayCategories={[]} items={[]} />)

    const imgs = screen.getAllByTestId('sale-detail-cover-external-img')
    fireEvent.error(imgs[0])

    expect(screen.queryByText('Loading image...')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('sale-placeholder').length).toBeGreaterThan(0)
  })

  it('opens fullscreen gallery when hero is clicked', () => {
    mockGetSaleCoverUrl.mockReturnValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg',
      alt: 'Trusted image',
    })

    render(<SaleDetailClient sale={mockSale as any} displayCategories={[]} items={[]} />)

    fireEvent.click(screen.getAllByLabelText('View sale image fullscreen')[0])

    expect(screen.getByRole('dialog', { name: 'Sale image gallery' })).toBeInTheDocument()
    expect(screen.getByTestId('sale-detail-fullscreen-image')).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg'
    )
  })

  it('syncs selected index between fullscreen and inline gallery', () => {
    mockGetSaleCoverUrl.mockReturnValue({
      url: 'https://res.cloudinary.com/demo/image/upload/v1/1.jpg',
      alt: 'Trusted image',
    })
    const saleWithGallery = {
      ...mockSale,
      images: [
        'https://res.cloudinary.com/demo/image/upload/v1/1.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1/2.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1/3.jpg',
        'https://res.cloudinary.com/demo/image/upload/v1/4.jpg',
      ],
    }

    render(<SaleDetailClient sale={saleWithGallery as any} displayCategories={[]} items={[]} />)

    fireEvent.click(screen.getAllByLabelText('Show sale image 2')[0])
    fireEvent.click(screen.getAllByLabelText('View sale image fullscreen')[0])

    const dialog = screen.getByRole('dialog', { name: 'Sale image gallery' })
    fireEvent.click(within(dialog).getByLabelText('Next sale image'))
    fireEvent.click(within(dialog).getByLabelText('Next sale image'))
    fireEvent.click(within(dialog).getByLabelText('Close image gallery'))

    expect(screen.queryByRole('dialog', { name: 'Sale image gallery' })).not.toBeInTheDocument()
    expect(screen.getAllByTestId('sale-detail-cover-next-image')[0]).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/demo/image/upload/v1/4.jpg'
    )
  })

  it('does not open fullscreen when cover image failed to load', () => {
    mockGetSaleCoverUrl.mockReturnValue({
      url: 'https://images.example.net/broken-cover.jpg',
      alt: 'Broken image',
    })

    render(<SaleDetailClient sale={mockSale as any} displayCategories={[]} items={[]} />)

    const imgs = screen.getAllByTestId('sale-detail-cover-external-img')
    fireEvent.error(imgs[0])

    expect(screen.queryByLabelText('View sale image fullscreen')).not.toBeInTheDocument()
  })
})
