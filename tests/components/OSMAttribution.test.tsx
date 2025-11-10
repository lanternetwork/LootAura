import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OSMAttribution from '@/components/location/OSMAttribution'

describe('OSMAttribution', () => {
  it('renders OSM attribution link', () => {
    render(<OSMAttribution />)
    
    const link = screen.getByRole('link', { name: /openstreetmap copyright information/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders copyright text', () => {
    render(<OSMAttribution />)
    
    expect(screen.getByText(/© OpenStreetMap contributors/i)).toBeInTheDocument()
  })

  it('shows geocoding attribution when showGeocoding is true', () => {
    render(<OSMAttribution showGeocoding={true} />)
    
    expect(screen.getByText(/Geocoding by Nominatim/i)).toBeInTheDocument()
  })

  it('hides geocoding attribution when showGeocoding is false', () => {
    render(<OSMAttribution showGeocoding={false} />)
    
    expect(screen.queryByText(/Geocoding by Nominatim/i)).not.toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(<OSMAttribution className="custom-class" />)
    
    const div = container.querySelector('div[role="contentinfo"]')
    expect(div).toHaveClass('custom-class')
  })

  it('has accessible role', () => {
    render(<OSMAttribution />)
    
    const contentinfo = screen.getByRole('contentinfo')
    expect(contentinfo).toBeInTheDocument()
  })

  it('renders when provider is osm (implicit via showGeocoding)', () => {
    // When showGeocoding is true, it indicates OSM/Nominatim geocoding was used
    render(<OSMAttribution showGeocoding={true} />)
    
    expect(screen.getByText(/© OpenStreetMap contributors/i)).toBeInTheDocument()
    expect(screen.getByText(/Geocoding by Nominatim/i)).toBeInTheDocument()
  })
})

