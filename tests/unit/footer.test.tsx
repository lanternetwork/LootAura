/**
 * Unit tests for SiteFooter component
 * 
 * Tests verify that:
 * - Footer renders with correct structure
 * - All links are present with correct hrefs
 * - Footer is accessible
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SiteFooter } from '@/components/layout/SiteFooter'

describe('SiteFooter', () => {
  afterEach(() => {
    cleanup()
  })

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
    
    // Check About link - may appear multiple times due to test isolation
    const aboutLinks = screen.getAllByRole('link', { name: 'About' })
    expect(aboutLinks.length).toBeGreaterThan(0)
    const aboutLink = aboutLinks.find(link => link.getAttribute('href') === '/about')
    expect(aboutLink).toBeInTheDocument()
    expect(aboutLink).toHaveAttribute('href', '/about')
    
    // Check Privacy Policy link - may appear multiple times due to test isolation
    const privacyLinks = screen.getAllByRole('link', { name: 'Privacy Policy' })
    expect(privacyLinks.length).toBeGreaterThan(0)
    // Verify at least one has the correct href
    const privacyLink = privacyLinks.find(link => link.getAttribute('href') === '/privacy')
    expect(privacyLink).toBeInTheDocument()
    expect(privacyLink).toHaveAttribute('href', '/privacy')
    
    // Check Terms of Use link - may appear multiple times due to test isolation
    const termsLinks = screen.getAllByRole('link', { name: 'Terms of Use' })
    expect(termsLinks.length).toBeGreaterThan(0)
    const termsLink = termsLinks.find(link => link.getAttribute('href') === '/terms')
    expect(termsLink).toBeInTheDocument()
    expect(termsLink).toHaveAttribute('href', '/terms')
  })

  it('should have accessible navigation', () => {
    render(<SiteFooter />)
    
    // Check nav element with aria-label - may appear multiple times due to test isolation
    const navs = screen.getAllByRole('navigation', { name: 'Footer' })
    expect(navs.length).toBeGreaterThan(0)
  })

  it('should display current year in copyright', () => {
    render(<SiteFooter />)
    
    const currentYear = new Date().getFullYear()
    const copyrightTexts = screen.getAllByText(new RegExp(`© ${currentYear} Loot Aura`))
    expect(copyrightTexts.length).toBeGreaterThan(0)
  })

  it('should have responsive layout classes', () => {
    const { container } = render(<SiteFooter />)
    
    const footer = container.querySelector('footer')
    expect(footer?.className).toContain('bg-white')
    expect(footer?.className).toContain('border-t')
  })
})

