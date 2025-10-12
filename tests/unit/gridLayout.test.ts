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

  it('should validate grid container width constraints', () => {
    const isContainerWidthAdequate = (width: number, breakpoint: 'mobile' | 'tablet' | 'desktop') => {
      switch (breakpoint) {
        case 'mobile':
          return width >= 320
        case 'tablet':
          return width >= 640
        case 'desktop':
          return width >= 1024
        default:
          return false
      }
    }

    expect(isContainerWidthAdequate(320, 'mobile')).toBe(true)
    expect(isContainerWidthAdequate(640, 'tablet')).toBe(true)
    expect(isContainerWidthAdequate(1024, 'desktop')).toBe(true)
    expect(isContainerWidthAdequate(300, 'mobile')).toBe(false)
    expect(isContainerWidthAdequate(600, 'tablet')).toBe(false)
    expect(isContainerWidthAdequate(1000, 'desktop')).toBe(false)
  })

  it('should detect grid layout issues', () => {
    const detectGridIssues = (computedStyle: {
      display: string
      gridTemplateColumns: string
      width: string
      clientWidth: number
    }) => {
      const issues: string[] = []
      
      if (computedStyle.display !== 'grid') {
        issues.push('Not using CSS Grid')
      }
      
      if (computedStyle.gridTemplateColumns === 'none') {
        issues.push('No grid template columns defined')
      }
      
      if (computedStyle.clientWidth < 400 && window.innerWidth >= 1024) {
        issues.push('Container too narrow for desktop')
      }
      
      return issues
    }

    const goodStyle = {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      width: '100%',
      clientWidth: 1200
    }

    const badStyle = {
      display: 'block',
      gridTemplateColumns: 'none',
      width: '100%',
      clientWidth: 200
    }

    expect(detectGridIssues(goodStyle)).toHaveLength(0)
    expect(detectGridIssues(badStyle)).toContain('Not using CSS Grid')
    expect(detectGridIssues(badStyle)).toContain('No grid template columns defined')
  })
})
