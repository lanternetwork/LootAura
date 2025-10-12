import { describe, it, expect } from 'vitest'

// Test grid column class resolution
describe('Grid Layout', () => {
  it('should return literal breakpoint classes', () => {
    const getGridClasses = (breakpoint: 'mobile' | 'tablet' | 'desktop') => {
      switch (breakpoint) {
        case 'mobile':
          return 'grid-cols-1'
        case 'tablet':
          return 'grid-cols-2'
        case 'desktop':
          return 'grid-cols-3'
        default:
          return 'grid-cols-1'
      }
    }

    expect(getGridClasses('mobile')).toBe('grid-cols-1')
    expect(getGridClasses('tablet')).toBe('grid-cols-2')
    expect(getGridClasses('desktop')).toBe('grid-cols-3')
  })

  it('should parse grid-template-columns correctly', () => {
    const parseGridColumns = (gridTemplate: string) => {
      if (gridTemplate.includes('repeat')) {
        const match = gridTemplate.match(/repeat\((\d+)/)
        return match ? parseInt(match[1]) : 0
      }
      return gridTemplate.split(' ').length
    }

    expect(parseGridColumns('repeat(1, 1fr)')).toBe(1)
    expect(parseGridColumns('repeat(2, 1fr)')).toBe(2)
    expect(parseGridColumns('repeat(3, 1fr)')).toBe(3)
    expect(parseGridColumns('1fr 1fr 1fr')).toBe(3)
    expect(parseGridColumns('1fr 1fr')).toBe(2)
  })

  it('should detect desktop breakpoint with ≥2 tracks', () => {
    const isDesktopGrid = (gridTemplate: string, containerWidth: number) => {
      const tracks = parseGridColumns(gridTemplate)
      return containerWidth >= 1024 && tracks >= 2
    }

    const parseGridColumns = (gridTemplate: string) => {
      if (gridTemplate.includes('repeat')) {
        const match = gridTemplate.match(/repeat\((\d+)/)
        return match ? parseInt(match[1]) : 0
      }
      return gridTemplate.split(' ').length
    }

    expect(isDesktopGrid('repeat(3, 1fr)', 1280)).toBe(true)
    expect(isDesktopGrid('repeat(2, 1fr)', 1024)).toBe(true)
    expect(isDesktopGrid('repeat(1, 1fr)', 1280)).toBe(false)
    expect(isDesktopGrid('repeat(2, 1fr)', 800)).toBe(false)
  })

  it('should not have multiple column-defining classes', () => {
    const hasMultipleColumnClasses = (className: string) => {
      const columnClasses = className.match(/(?:^|\s)(?:grid-cols-\d+|auto-cols-)/g)
      return columnClasses && columnClasses.length > 1
    }

    expect(hasMultipleColumnClasses('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')).toBe(false)
    expect(hasMultipleColumnClasses('grid grid-cols-1 grid-cols-2')).toBe(true)
    expect(hasMultipleColumnClasses('grid sm:grid-cols-2 lg:grid-cols-3')).toBe(false)
  })
})
