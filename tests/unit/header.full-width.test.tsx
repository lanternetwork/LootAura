/**
 * Unit tests for Header full-width styling
 * 
 * Tests verify that:
 * - Header container uses full width (w-full) instead of max-width constraint
 * - Header matches the full-width layout of other components
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Header } from '@/app/Header'

// Mock UserProfile to avoid auth dependencies
vi.mock('@/components/UserProfile', () => ({
  default: () => <div data-testid="user-profile">User Profile</div>,
}))

describe('Header Full-Width Styling', () => {
  it('should render header with full width container', () => {
    const { container } = render(<Header />)
    
    // Find the header nav element
    const nav = container.querySelector('nav')
    expect(nav).toBeInTheDocument()
    
    // Find the inner container div
    const innerContainer = nav?.querySelector('div')
    expect(innerContainer).toBeInTheDocument()
    
    // Check that it uses w-full (full width) class
    expect(innerContainer?.className).toContain('w-full')
    
    // Check that it does NOT use max-w-7xl (width constraint)
    expect(innerContainer?.className).not.toContain('max-w-7xl')
    
    // Check that it does NOT use mx-auto (centering)
    expect(innerContainer?.className).not.toContain('mx-auto')
  })

  it('should maintain padding classes for spacing', () => {
    const { container } = render(<Header />)
    
    const nav = container.querySelector('nav')
    const innerContainer = nav?.querySelector('div')
    
    // Should have responsive horizontal padding (mobile-first: px-3, then sm:px-6, lg:px-8)
    expect(innerContainer?.className).toContain('px-3')
    expect(innerContainer?.className).toContain('sm:px-6')
    expect(innerContainer?.className).toContain('h-full')
  })

  it('should match full-width layout pattern', () => {
    const { container } = render(<Header />)
    
    const nav = container.querySelector('nav')
    const innerContainer = nav?.querySelector('div')
    
    // Full-width layout should use:
    // - w-full (full width)
    // - px-3 sm:px-6 lg:px-8 (responsive horizontal padding, mobile-first)
    // - h-full (fills parent height)
    // - NOT max-w-* (max width constraints)
    // - NOT mx-auto (centering)
    
    const hasFullWidth = innerContainer?.className.includes('w-full')
    const hasPadding = innerContainer?.className.includes('px-3') && innerContainer?.className.includes('sm:px-6')
    const hasHeight = innerContainer?.className.includes('h-full')
    const hasNoMaxWidth = !innerContainer?.className.includes('max-w-')
    const hasNoCentering = !innerContainer?.className.includes('mx-auto')
    
    expect(hasFullWidth).toBe(true)
    expect(hasPadding).toBe(true)
    expect(hasHeight).toBe(true)
    expect(hasNoMaxWidth).toBe(true)
    expect(hasNoCentering).toBe(true)
  })

  it('should render header content correctly', () => {
    const { getAllByText } = render(<Header />)
    
    // Verify header content is present (use getAllByText since React StrictMode may render twice)
    expect(getAllByText('Loot Aura')[0]).toBeInTheDocument()
    expect(getAllByText('Browse Sales')[0]).toBeInTheDocument()
    expect(getAllByText('Favorites')[0]).toBeInTheDocument()
    expect(getAllByText('Post Your Sale')[0]).toBeInTheDocument()
  })
})

