'use client'

import React, { useEffect, useState } from 'react'

interface GridLayoutDiagnosticProps {
  containerRef: React.RefObject<HTMLElement>
  isVisible: boolean
}

interface LayoutInfo {
  // Container measurements
  containerWidth: number
  containerHeight: number
  windowWidth: number
  windowHeight: number
  
  // Computed styles
  display: string
  gridTemplateColumns: string
  gap: string
  width: string
  maxWidth: string
  minWidth: string
  
  // Grid items
  gridItemCount: number
  saleCardCount: number
  
  // Classes analysis
  className: string
  hasDataAttribute: boolean
  hasGridClass: boolean
  hasGridCols1: boolean
  hasGridCols2: boolean
  hasGridCols3: boolean
  
  // Inline styles
  hasInlineDisplay: string
  hasInlineGridTemplateColumns: string
  hasInlineGap: string
  
  // Responsive breakpoints
  isSmallScreen: boolean
  isMediumScreen: boolean
  isLargeScreen: boolean
  
  // Hydration state
  isHydrated: boolean
  
  // CSS conflicts
  conflictingStyles: string[]
  tailwindConflicts: string[]
}

const GridLayoutDiagnostic: React.FC<GridLayoutDiagnosticProps> = ({ 
  containerRef, 
  isVisible 
}) => {
  const [layoutInfo, setLayoutInfo] = useState<LayoutInfo | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [mutationCount, setMutationCount] = useState(0)
  const [renderCount, setRenderCount] = useState(0)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (!containerRef.current || !isVisible) return

    const updateLayoutInfo = () => {
      const container = containerRef.current
      if (!container) return

      const computedStyle = window.getComputedStyle(container)
      const rect = container.getBoundingClientRect()
      
      // Get all grid items and sale cards
      const gridItems = container.querySelectorAll('.grid-item')
      const saleCards = container.querySelectorAll('.sale-row')
      
      // Analyze classes for conflicts
      const className = container.className
      const hasGridClass = className.includes('grid')
      const hasGridCols1 = className.includes('grid-cols-1')
      const hasGridCols2 = className.includes('sm:grid-cols-2')
      const hasGridCols3 = className.includes('lg:grid-cols-3')
      
      // Check for inline style conflicts
      const hasInlineDisplay = container.style.display
      const hasInlineGridTemplateColumns = container.style.gridTemplateColumns
      const hasInlineGap = container.style.gap
      
      // Detect conflicts
      const conflictingStyles: string[] = []
      const tailwindConflicts: string[] = []
      
      if (hasInlineDisplay && hasInlineDisplay !== 'grid') {
        conflictingStyles.push(`Inline display: ${hasInlineDisplay}`)
      }
      
      if (hasInlineGridTemplateColumns && !hasInlineGridTemplateColumns.includes('1fr')) {
        conflictingStyles.push(`Inline grid-template-columns: ${hasInlineGridTemplateColumns}`)
      }
      
      if (hasGridClass && hasInlineDisplay) {
        tailwindConflicts.push('Tailwind grid class + inline display conflict')
      }
      
      if (hasGridCols1 && hasGridCols2 && hasGridCols3) {
        tailwindConflicts.push('Multiple responsive grid classes may conflict')
      }
      
      // Check for flex conflicts
      const parentElement = container.parentElement
      if (parentElement) {
        const parentComputedStyle = window.getComputedStyle(parentElement)
        if (parentComputedStyle.display === 'flex') {
          conflictingStyles.push('Parent container uses flex layout')
        }
      }
      
      const currentLayoutInfo: LayoutInfo = {
        // Container measurements
        containerWidth: rect.width,
        containerHeight: rect.height,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        
        // Computed styles
        display: computedStyle.display,
        gridTemplateColumns: computedStyle.gridTemplateColumns,
        gap: computedStyle.gap,
        width: computedStyle.width,
        maxWidth: computedStyle.maxWidth,
        minWidth: computedStyle.minWidth,
        
        // Grid items
        gridItemCount: gridItems.length,
        saleCardCount: saleCards.length,
        
        // Classes analysis
        className,
        hasDataAttribute: container.hasAttribute('data-grid-container'),
        hasGridClass,
        hasGridCols1,
        hasGridCols2,
        hasGridCols3,
        
        // Inline styles
        hasInlineDisplay,
        hasInlineGridTemplateColumns,
        hasInlineGap,
        
        // Responsive breakpoints
        isSmallScreen: window.innerWidth < 640,
        isMediumScreen: window.innerWidth >= 640 && window.innerWidth < 1024,
        isLargeScreen: window.innerWidth >= 1024,
        
        // Hydration state
        isHydrated,
        
        // CSS conflicts
        conflictingStyles,
        tailwindConflicts
      }

      setLayoutInfo(currentLayoutInfo)
      setRenderCount(prev => prev + 1)
    }

    // Initial update
    updateLayoutInfo()

    // Set up ResizeObserver for continuous updates
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          updateLayoutInfo()
        }
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    // Set up MutationObserver to detect class/style changes
    const mutationObserver = new MutationObserver((mutations) => {
      let hasRelevantChanges = false
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement
          if (target === containerRef.current) {
            if (mutation.attributeName === 'class' || 
                mutation.attributeName === 'style' ||
                mutation.attributeName === 'data-grid-container') {
              hasRelevantChanges = true
            }
          }
        }
      })
      
      if (hasRelevantChanges) {
        setMutationCount(prev => prev + 1)
        updateLayoutInfo()
      }
    })

    if (containerRef.current) {
      mutationObserver.observe(containerRef.current, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-grid-container'],
        subtree: true,
      })
    }

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [containerRef, isVisible, isHydrated])

  // Only render in debug mode
  if (process.env.NEXT_PUBLIC_DEBUG !== 'true' || !isVisible) {
    return null
  }

  if (!layoutInfo) {
    return null
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'grid': return '#10b981' // green
      case 'flex': return '#f59e0b' // amber
      case 'block': return '#ef4444' // red
      default: return '#6b7280' // gray
    }
  }

  const getColumnCount = () => {
    if (layoutInfo.gridTemplateColumns.includes('repeat(3')) return '3'
    if (layoutInfo.gridTemplateColumns.includes('repeat(2')) return '2'
    if (layoutInfo.gridTemplateColumns.includes('repeat(1')) return '1'
    return 'Unknown'
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        right: 10,
        background: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '11px',
        zIndex: 9999,
        maxWidth: '400px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        border: '1px solid #374151'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fbbf24' }}>
        🔧 GRID LAYOUT DIAGNOSTIC
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Display:</strong> 
        <span style={{ 
          color: getStatusColor(layoutInfo.display),
          marginLeft: '4px'
        }}>
          {layoutInfo.display}
        </span>
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Columns:</strong> 
        <span style={{ color: '#10b981' }}>
          {getColumnCount()}
        </span>
        <span style={{ color: '#6b7280', marginLeft: '4px' }}>
          ({layoutInfo.gridTemplateColumns})
        </span>
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Container:</strong> 
        <span style={{ color: '#3b82f6' }}>
          {Math.round(layoutInfo.containerWidth)}×{Math.round(layoutInfo.containerHeight)}px
        </span>
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Window:</strong> 
        <span style={{ color: '#8b5cf6' }}>
          {layoutInfo.windowWidth}px
        </span>
        <span style={{ color: '#6b7280', marginLeft: '4px' }}>
          ({layoutInfo.isSmallScreen ? 'Mobile' : layoutInfo.isMediumScreen ? 'Tablet' : 'Desktop'})
        </span>
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Items:</strong> 
        <span style={{ color: '#10b981' }}>
          {layoutInfo.gridItemCount} grid items
        </span>
        <span style={{ color: '#6b7280', marginLeft: '4px' }}>
          ({layoutInfo.saleCardCount} sale cards)
        </span>
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Gap:</strong> 
        <span style={{ color: '#3b82f6' }}>
          {layoutInfo.gap}
        </span>
      </div>
      
      {layoutInfo.conflictingStyles.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <strong style={{ color: '#ef4444' }}>⚠️ Conflicts:</strong>
          <div style={{ marginLeft: '8px', fontSize: '10px' }}>
            {layoutInfo.conflictingStyles.map((conflict, idx) => (
              <div key={idx} style={{ color: '#fca5a5' }}>• {conflict}</div>
            ))}
          </div>
        </div>
      )}
      
      {layoutInfo.tailwindConflicts.length > 0 && (
        <div style={{ marginBottom: '6px' }}>
          <strong style={{ color: '#f59e0b' }}>⚠️ Tailwind:</strong>
          <div style={{ marginLeft: '8px', fontSize: '10px' }}>
            {layoutInfo.tailwindConflicts.map((conflict, idx) => (
              <div key={idx} style={{ color: '#fbbf24' }}>• {conflict}</div>
            ))}
          </div>
        </div>
      )}
      
      <div style={{ marginBottom: '6px', fontSize: '10px', color: '#9ca3af' }}>
        <div>Hydrated: {layoutInfo.isHydrated ? '✅' : '❌'}</div>
        <div>Mutations: {mutationCount}</div>
        <div>Renders: {renderCount}</div>
      </div>
      
      <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '4px' }}>
        Classes: {layoutInfo.className.length > 50 ? 
          layoutInfo.className.substring(0, 50) + '...' : 
          layoutInfo.className
        }
      </div>
    </div>
  )
}

export default GridLayoutDiagnostic
