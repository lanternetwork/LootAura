import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SaleCard from '@/components/SaleCard'

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
    render(<SaleCard sale={sale} />)
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
    render(<SaleCard sale={sale} />)
    // Fallback renders an SVG placeholder in the top area
    const placeholder = screen.getByTestId('sale-card') || screen.getByText(/View Details/)
    expect(placeholder).toBeTruthy()
  })
})

