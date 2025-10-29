import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SaleCard from '@/components/SaleCard'
import { Sale } from '@/lib/types'

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => (
    <img src={src} alt={alt} {...props} />
  )
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  )
}))

// Mock FavoriteButton
vi.mock('@/components/FavoriteButton', () => ({
  default: ({ saleId }: { saleId: string }) => (
    <button data-testid="favorite-button">Favorite {saleId}</button>
  )
}))

describe('SaleCard', () => {
  const mockSale: Sale = {
    id: 'test-sale-123',
    owner_id: 'owner-123',
    title: 'Test Yard Sale',
    description: 'A great yard sale with lots of items',
    address: '123 Test Street',
    city: 'Test City',
    state: 'TS',
    zip_code: '12345',
    lat: 38.2527,
    lng: -85.7585,
    date_start: '2024-01-01',
    time_start: '09:00',
    date_end: '2024-01-01',
    time_end: '17:00',
    status: 'published',
    privacy_mode: 'exact',
    is_featured: false,
    cover_image_url: null,
    images: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }

  it('should render sale card with basic information', () => {
    render(<SaleCard sale={mockSale} />)
    
    expect(screen.getByText('Test Yard Sale')).toBeInTheDocument()
    expect(screen.getByText('A great yard sale with lots of items')).toBeInTheDocument()
    expect(screen.getByText('123 Test Street')).toBeInTheDocument()
    expect(screen.getByText('Test City, TS')).toBeInTheDocument()
    expect(screen.getByText('View Details →')).toBeInTheDocument()
  })

  it('should render placeholder when no images available', () => {
    render(<SaleCard sale={mockSale} />)
    
    // Should show the house icon placeholder
    const placeholder = screen.getByRole('img', { hidden: true })
    expect(placeholder).toBeInTheDocument()
    expect(placeholder).toHaveAttribute('width', '44')
    expect(placeholder).toHaveAttribute('height', '44')
  })

  it('should render cover image when cover_image_url is provided', () => {
    const saleWithCover = {
      ...mockSale,
      cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg'
    }
    
    render(<SaleCard sale={saleWithCover} />)
    
    const image = screen.getByRole('img')
    expect(image).toHaveAttribute('src', 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg')
    expect(image).toHaveAttribute('alt', 'Test Yard Sale cover')
  })

  it('should render first image when cover_image_url is null but images exist', () => {
    const saleWithImages = {
      ...mockSale,
      cover_image_url: null,
      images: [
        'https://res.cloudinary.com/test/image/upload/v123/img1.jpg',
        'https://res.cloudinary.com/test/image/upload/v123/img2.jpg'
      ]
    }
    
    render(<SaleCard sale={saleWithImages} />)
    
    const image = screen.getByRole('img')
    expect(image).toHaveAttribute('src', 'https://res.cloudinary.com/test/image/upload/v123/img1.jpg')
    expect(image).toHaveAttribute('alt', 'Test Yard Sale photo')
  })

  it('should prioritize cover_image_url over first image', () => {
    const saleWithBoth = {
      ...mockSale,
      cover_image_url: 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg',
      images: [
        'https://res.cloudinary.com/test/image/upload/v123/img1.jpg',
        'https://res.cloudinary.com/test/image/upload/v123/img2.jpg'
      ]
    }
    
    render(<SaleCard sale={saleWithBoth} />)
    
    const image = screen.getByRole('img')
    expect(image).toHaveAttribute('src', 'https://res.cloudinary.com/test/image/upload/v123/cover.jpg')
    expect(image).toHaveAttribute('alt', 'Test Yard Sale cover')
  })

  it('should render favorite button', () => {
    render(<SaleCard sale={mockSale} />)
    
    expect(screen.getByTestId('favorite-button')).toBeInTheDocument()
    expect(screen.getByText('Favorite test-sale-123')).toBeInTheDocument()
  })

  it('should render date and time information', () => {
    render(<SaleCard sale={mockSale} />)
    
    // The date/time should be formatted and displayed
    expect(screen.getByText(/1\/1\/2024/)).toBeInTheDocument()
  })

  it('should handle sale without title gracefully', () => {
    const saleWithoutTitle = {
      ...mockSale,
      title: undefined
    }
    
    render(<SaleCard sale={saleWithoutTitle} />)
    
    expect(screen.getByText('Sale test-sale-123')).toBeInTheDocument()
  })

  it('should apply custom className when provided', () => {
    const { container } = render(<SaleCard sale={mockSale} className="custom-class" />)
    
    const article = container.querySelector('article')
    expect(article).toHaveClass('custom-class')
  })

  it('should render with proper grid layout classes', () => {
    const { container } = render(<SaleCard sale={mockSale} />)
    
    const article = container.querySelector('article')
    expect(article).toHaveClass('grid', 'grid-rows-[2fr_3fr]')
  })

  it('should render link to sale detail page', () => {
    render(<SaleCard sale={mockSale} />)
    
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/sales/test-sale-123')
  })
})
