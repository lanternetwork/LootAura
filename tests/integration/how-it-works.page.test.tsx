import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import HowItWorksPage from '@/app/how-it-works/page'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('How It Works Page', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the main heading', () => {
    const { container } = render(<HowItWorksPage />)
    const heading = container.querySelector('h1')
    expect(heading).toHaveTextContent('How Loot Aura works')
  })

  it('renders all three sections', () => {
    const { container } = render(<HowItWorksPage />)
    const headings = container.querySelectorAll('h2')
    const sectionTexts = Array.from(headings).map(h => h.textContent)
    expect(sectionTexts).toContain('For shoppers')
    expect(sectionTexts).toContain('For hosts')
    expect(sectionTexts).toContain('Under the hood')
  })

  it('renders CTAs with correct hrefs', () => {
    const { container } = render(<HowItWorksPage />)
    
    // Check hero CTAs - use getAllByText and filter by href
    const browseLinks = Array.from(container.querySelectorAll('a[href="/sales"]'))
    expect(browseLinks.length).toBeGreaterThan(0)
    expect(browseLinks[0]).toHaveTextContent('Browse nearby sales')
    
    const hostLinks = Array.from(container.querySelectorAll('a[href="/sell/new"]'))
    expect(hostLinks.length).toBeGreaterThan(0)
    const hostLink = hostLinks.find(link => link.textContent?.includes('Host a sale'))
    expect(hostLink).toBeDefined()
    
    // Check bottom CTAs
    const viewSalesLinks = Array.from(container.querySelectorAll('a[href="/sales"]'))
    const viewSalesLink = viewSalesLinks.find(link => link.textContent?.trim() === 'View sales')
    expect(viewSalesLink).toBeDefined()
    
    const postSaleLinks = Array.from(container.querySelectorAll('a[href="/sell/new"]'))
    const postSaleLink = postSaleLinks.find(link => link.textContent?.trim() === 'Post a sale')
    expect(postSaleLink).toBeDefined()
  })

  it('renders all step cards for each section', () => {
    const { container } = render(<HowItWorksPage />)
    
    // Shoppers steps - query by h3 elements
    const headings = Array.from(container.querySelectorAll('h3')).map(h => h.textContent)
    expect(headings).toContain('1. Set your location')
    expect(headings).toContain('2. Filter the map')
    expect(headings).toContain('3. Go shop')
    
    // Hosts steps
    expect(headings).toContain('1. Create a sale')
    expect(headings).toContain('2. Add photos')
    expect(headings).toContain('3. Publish')
    
    // Admin steps
    expect(headings).toContain('1. Map-centric')
    expect(headings).toContain('2. Protected data')
    expect(headings).toContain('3. Tools for cleanup')
  })
})

