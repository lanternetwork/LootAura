/**
 * Unit tests for SiteFooter component
 * 
 * Tests verify that:
 * - Footer renders with correct structure
 * - All links are present with correct hrefs
 * - Footer is accessible
 */

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SiteFooter } from '@/components/layout/SiteFooter'

describe('SiteFooter', () => {
  it('should render footer with correct structure', () => {
    render(<SiteFooter />)
    
    // Check footer element (may be multiple instances, take first)
    const footers = screen.getAllByRole('contentinfo')
    expect(footers.length).toBeGreaterThan(0)
    const footer = footers[0]
    
    // Check brand name (may appear multiple times)
    const brandNames = screen.getAllByText('Loot Aura')
    expect(brandNames.length).toBeGreaterThan(0)
    
    // Check description
    expect(screen.getByText(/Map-first yard sale finder/)).toBeInTheDocument()
  })

  it('should render all navigation links with correct hrefs', () => {
    render(<SiteFooter />)
    
    // Check About link (may be multiple instances)
    const aboutLinks = screen.getAllByRole('link', { name: 'About' })
    expect(aboutLinks.length).toBeGreaterThan(0)
    expect(aboutLinks[0]).toHaveAttribute('href', '/about')
    
    // Check Privacy Policy link
    const privacyLink = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(privacyLink).toBeInTheDocument()
    expect(privacyLink).toHaveAttribute('href', '/privacy')
    
    // Check Terms of Use link
    const termsLink = screen.getByRole('link', { name: 'Terms of Use' })
    expect(termsLink).toBeInTheDocument()
    expect(termsLink).toHaveAttribute('href', '/terms')
  })

  it('should have accessible navigation', () => {
    render(<SiteFooter />)
    
    // Check nav element with aria-label, scoped to the footer (may be multiple footers)
    const footers = screen.getAllByRole('contentinfo')
    expect(footers.length).toBeGreaterThan(0)
    const footer = footers[0]
    const nav = within(footer).getByRole('navigation', { name: 'Footer' })
    expect(nav).toBeInTheDocument()
  })

  it('should display current year in copyright', () => {
    render(<SiteFooter />)
    
    const currentYear = new Date().getFullYear()
    const matches = screen.getAllByText(new RegExp(`© ${currentYear} Loot Aura`))
    expect(matches.length).toBeGreaterThan(0)
  })

  it('should have responsive layout classes', () => {
    const { container } = render(<SiteFooter />)
    
    const footer = container.querySelector('footer')
    expect(footer?.className).toContain('bg-white')
    expect(footer?.className).toContain('border-t')
  })
})

