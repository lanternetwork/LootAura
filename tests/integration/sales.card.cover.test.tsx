import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SaleCard from '@/components/SaleCard'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const qc = new QueryClient()
const renderWithProviders = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)

describe('SaleCard cover rendering', () => {
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
})

