import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import HowItWorksPage from '@/app/how-it-works/page'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('How It Works Page', () => {
  it('renders the main heading', () => {
    render(<HowItWorksPage />)
    expect(screen.getByText('How Loot Aura works')).toBeInTheDocument()
  })

  it('renders all three sections', () => {
    render(<HowItWorksPage />)
    expect(screen.getByText('For shoppers')).toBeInTheDocument()
    expect(screen.getByText('For hosts')).toBeInTheDocument()
    expect(screen.getByText('Under the hood')).toBeInTheDocument()
  })

  it('renders CTAs with correct hrefs', () => {
    render(<HowItWorksPage />)
    
    // Check hero CTAs
    const browseLink = screen.getByText('Browse nearby sales').closest('a')
    expect(browseLink).toHaveAttribute('href', '/sales')
    
    const hostLink = screen.getByText('Host a sale').closest('a')
    expect(hostLink).toHaveAttribute('href', '/sell/new')
    
    // Check bottom CTAs
    const viewSalesLink = screen.getByText('View sales').closest('a')
    expect(viewSalesLink).toHaveAttribute('href', '/sales')
    
    const postSaleLink = screen.getByText('Post a sale').closest('a')
    expect(postSaleLink).toHaveAttribute('href', '/sell/new')
  })

  it('renders all step cards for each section', () => {
    render(<HowItWorksPage />)
    
    // Shoppers steps
    expect(screen.getByText('1. Set your location')).toBeInTheDocument()
    expect(screen.getByText('2. Filter the map')).toBeInTheDocument()
    expect(screen.getByText('3. Go shop')).toBeInTheDocument()
    
    // Hosts steps
    expect(screen.getByText('1. Create a sale')).toBeInTheDocument()
    expect(screen.getByText('2. Add photos')).toBeInTheDocument()
    expect(screen.getByText('3. Publish')).toBeInTheDocument()
    
    // Admin steps
    expect(screen.getByText('1. Map-centric')).toBeInTheDocument()
    expect(screen.getByText('2. Protected data')).toBeInTheDocument()
    expect(screen.getByText('3. Tools for cleanup')).toBeInTheDocument()
  })
})

