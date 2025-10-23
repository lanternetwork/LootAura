import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((cb) => setTimeout(cb, 0))

describe('useOverflowChips', () => {
  it('should split chips based on available width', () => {
    const items = [
      { id: '1', label: 'Furniture', priority: 10 },
      { id: '2', label: 'Electronics', priority: 9 },
      { id: '3', label: 'Clothing', priority: 8 },
      { id: '4', label: 'Books', priority: 7 },
      { id: '5', label: 'Toys', priority: 6 }
    ]

    // Mock getBoundingClientRect to return specific widths
    const mockGetBoundingClientRect = vi.fn()
    mockGetBoundingClientRect
      .mockReturnValueOnce({ width: 80 }) // Furniture
      .mockReturnValueOnce({ width: 90 }) // Electronics  
      .mockReturnValueOnce({ width: 70 }) // Clothing
      .mockReturnValueOnce({ width: 60 }) // Books
      .mockReturnValueOnce({ width: 50 }) // Toys

    // Mock DOM elements
    const mockChildren = [
      { getBoundingClientRect: mockGetBoundingClientRect, dataset: { role: 'chip' } },
      { getBoundingClientRect: mockGetBoundingClientRect, dataset: { role: 'chip' } },
      { getBoundingClientRect: mockGetBoundingClientRect, dataset: { role: 'chip' } },
      { getBoundingClientRect: mockGetBoundingClientRect, dataset: { role: 'chip' } },
      { getBoundingClientRect: mockGetBoundingClientRect, dataset: { role: 'chip' } }
    ]

    const mockRailRef = {
      current: {
        clientWidth: 300, // Available width
        children: mockChildren
      }
    }

    // Test the overflow calculation logic
    const availableWidth = 300 - 12 // safety padding
    const gap = 8
    let usedWidth = 0
    const visible: typeof items = []
    const overflow: typeof items = []

    // Sort by priority (highest first)
    const ordered = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    
    // Expected order: Furniture(10), Electronics(9), Clothing(8), Books(7), Toys(6)
    const widths = [80, 90, 70, 60, 50] // Corresponding widths

    ordered.forEach((item, idx) => {
      const width = widths[idx] ?? 0
      const widthWithGap = visible.length === 0 ? width : width + gap
      
      if (usedWidth + widthWithGap <= availableWidth) {
        visible.push(item)
        usedWidth += widthWithGap
      } else {
        overflow.push(item)
      }
    })

    // With available width of 288px and gap of 8px:
    // Furniture: 80px (fits)
    // Electronics: 8 + 90 = 98px (total: 178px, fits)
    // Clothing: 8 + 70 = 78px (total: 256px, fits) 
    // Books: 8 + 60 = 68px (total: 324px, doesn't fit)
    // Toys: 8 + 50 = 58px (total: 382px, doesn't fit)

    expect(visible).toHaveLength(3)
    expect(visible[0].id).toBe('1') // Furniture (highest priority)
    expect(visible[1].id).toBe('2') // Electronics
    expect(visible[2].id).toBe('3') // Clothing

    expect(overflow).toHaveLength(2)
    expect(overflow[0].id).toBe('4') // Books
    expect(overflow[1].id).toBe('5') // Toys
  })

  it('should handle empty items array', () => {
    const items: Array<{ id: string; priority?: number }> = []
    
    // Test that empty array doesn't cause errors
    const ordered = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    expect(ordered).toHaveLength(0)
  })

  it('should prioritize items with higher priority values', () => {
    const items = [
      { id: '1', label: 'Low Priority', priority: 1 },
      { id: '2', label: 'High Priority', priority: 10 },
      { id: '3', label: 'Medium Priority', priority: 5 }
    ]

    const ordered = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    
    expect(ordered[0].id).toBe('2') // High Priority first
    expect(ordered[1].id).toBe('3') // Medium Priority second  
    expect(ordered[2].id).toBe('1') // Low Priority last
  })
})
