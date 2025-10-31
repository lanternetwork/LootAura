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
    
    // Should still have padding for spacing
    expect(innerContainer?.className).toContain('px-4')
    expect(innerContainer?.className).toContain('py-3')
  })

  it('should match full-width layout pattern', () => {
    const { container } = render(<Header />)
    
    const nav = container.querySelector('nav')
    const innerContainer = nav?.querySelector('div')
    
    // Full-width layout should use:
    // - w-full (full width)
    // - px-4 (horizontal padding)
    // - py-3 (vertical padding)
    // - NOT max-w-* (max width constraints)
    // - NOT mx-auto (centering)
    
    const hasFullWidth = innerContainer?.className.includes('w-full')
    const hasPadding = innerContainer?.className.includes('px-4')
    const hasNoMaxWidth = !innerContainer?.className.includes('max-w-')
    const hasNoCentering = !innerContainer?.className.includes('mx-auto')
    
    expect(hasFullWidth).toBe(true)
    expect(hasPadding).toBe(true)
    expect(hasNoMaxWidth).toBe(true)
    expect(hasNoCentering).toBe(true)
  })

  it('should render header content correctly', () => {
    const { getByText } = render(<Header />)
    
    // Verify header content is present
    expect(getByText('LootAura')).toBeInTheDocument()
    expect(getByText('Browse Sales')).toBeInTheDocument()
    expect(getByText('Favorites')).toBeInTheDocument()
    expect(getByText('Post Your Sale')).toBeInTheDocument()
  })
})

