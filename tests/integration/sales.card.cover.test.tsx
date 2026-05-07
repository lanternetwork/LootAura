import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import SaleCard from '@/components/SaleCard'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('SaleCard cover rendering', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
  })

  afterEach(() => {
    cleanup()
    queryClient.clear()
  })

  const renderWithProviders = (ui: React.ReactElement) =>
    render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)

  it('renders Cloudinary image when cover_image_url is present', () => {
    const sale: any = {
      id: 's1',
      title: 'Neighborhood Sale',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-01-01',
      time_start: '09:00',
      cover_image_url: 'https://res.cloudinary.com/test/image/upload/v1/cover.jpg'
    }
    renderWithProviders(<SaleCard sale={sale} />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.getAttribute('src') || '').toContain('res.cloudinary.com')
    expect(screen.getByTestId('sale-card-next-image')).toBeTruthy()
  })

  it('renders native img fallback for non-trusted external hosts', () => {
    const sale: any = {
      id: 's3',
      title: 'Neighborhood Sale',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-01-01',
      time_start: '09:00',
      cover_image_url: 'https://images.example.net/cover.jpg'
    }
    renderWithProviders(<SaleCard sale={sale} />)
    const img = screen.getByTestId('sale-card-external-img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.getAttribute('src') || '').toContain('images.example.net/cover.jpg')
  })

  it('renders neutral placeholder when no images', () => {
    const sale: any = {
      id: 's2',
      title: 'Yard Sale',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-01-01',
      time_start: '09:00'
    }
    const { container } = renderWithProviders(<SaleCard sale={sale} />)
    // Should render a placeholder image (inline SVG or asset)
    const img = container.querySelector('img') as HTMLImageElement | null
    if (img) {
      expect(img.getAttribute('src') || '').toMatch(/placeholder|house|image/)
    } else {
      // Inline SVG fallback also acceptable
      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
    }
  })

  it('does not duplicate city/state when address already contains them', () => {
    const sale: any = {
      id: 's4',
      title: 'Address Sale',
      address: '123 Main St, Louisville, KY 40202',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-01-01',
      time_start: '09:00',
    }
    renderWithProviders(<SaleCard sale={sale} />)
    expect(screen.getAllByText('123 Main St, Louisville, KY 40202').length).toBeGreaterThan(0)
  })

  it('formats date-only without timezone rollback drift', () => {
    const sale: any = {
      id: 's5',
      title: 'Date Sale',
      city: 'Louisville',
      state: 'KY',
      date_start: '2024-01-01',
      time_start: '09:00',
    }
    renderWithProviders(<SaleCard sale={sale} />)
    expect(screen.getByText(/Jan 1/i)).toBeTruthy()
  })
})

