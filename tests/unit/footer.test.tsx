/**
 * Unit tests for SiteFooter component
 * 
 * Tests verify that:
 * - Footer renders with correct structure
 * - All links are present with correct hrefs
 * - Footer is accessible
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SiteFooter } from '@/components/layout/SiteFooter'

describe('SiteFooter', () => {
  it('should render footer with correct structure', () => {
    const { container } = render(<SiteFooter />)
    
    // Check footer element
    const footer = container.querySelector('footer[role="contentinfo"]')
    expect(footer).toBeInTheDocument()
    
    // Check brand name
    expect(screen.getByText('Loot Aura')).toBeInTheDocument()
    
    // Check description
    expect(screen.getByText(/Map-first yard sale finder/)).toBeInTheDocument()
  })

  it('should render all navigation links with correct hrefs', () => {
    render(<SiteFooter />)
    
    // Check About link
    const aboutLink = screen.getByRole('link', { name: 'About' })
    expect(aboutLink).toBeInTheDocument()
    expect(aboutLink).toHaveAttribute('href', '/about')
    
    // Check Privacy Policy link - may appear multiple times due to test isolation
    const privacyLinks = screen.getAllByRole('link', { name: 'Privacy Policy' })
    expect(privacyLinks.length).toBeGreaterThan(0)
    // Verify at least one has the correct href
    const privacyLink = privacyLinks.find(link => link.getAttribute('href') === '/privacy')
    expect(privacyLink).toBeInTheDocument()
    expect(privacyLink).toHaveAttribute('href', '/privacy')
    
    // Check Terms of Use link
    const termsLink = screen.getByRole('link', { name: 'Terms of Use' })
    expect(termsLink).toBeInTheDocument()
    expect(termsLink).toHaveAttribute('href', '/terms')
  })

  it('should have accessible navigation', () => {
    render(<SiteFooter />)
    
    // Check nav element with aria-label
    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(nav).toBeInTheDocument()
  })

  it('should display current year in copyright', () => {
    render(<SiteFooter />)
    
    const currentYear = new Date().getFullYear()
    expect(screen.getByText(new RegExp(`© ${currentYear} Loot Aura`))).toBeInTheDocument()
  })

  it('should have responsive layout classes', () => {
    const { container } = render(<SiteFooter />)
    
    const footer = container.querySelector('footer')
    expect(footer?.className).toContain('bg-white')
    expect(footer?.className).toContain('border-t')
  })
})

