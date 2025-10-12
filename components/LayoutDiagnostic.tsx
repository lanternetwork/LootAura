'use client'

import { useEffect, useState } from 'react'

interface LayoutDiagnosticProps {
  containerRef: React.RefObject<HTMLDivElement>
  isVisible: boolean
}

export default function LayoutDiagnostic({ containerRef, isVisible }: LayoutDiagnosticProps) {
  const [layoutInfo, setLayoutInfo] = useState<any>(null)
  const [isHydrated, setIsHydrated] = useState(false)

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
      
      // Get all grid items
      const gridItems = container.querySelectorAll('.grid-item')
      const saleCards = container.querySelectorAll('.sale-row')
      
      setLayoutInfo({
        // Container info
        containerWidth: rect.width,
        containerHeight: rect.height,
        display: computedStyle.display,
        gridTemplateColumns: computedStyle.gridTemplateColumns,
        gap: computedStyle.gap,
        width: computedStyle.width,
        maxWidth: computedStyle.maxWidth,
        
        // Grid items
        gridItemCount: gridItems.length,
        saleCardCount: saleCards.length,
        
        // Classes
        className: container.className,
        hasDataAttribute: container.hasAttribute('data-grid-container'),
        
        // Responsive breakpoints
        windowWidth: window.innerWidth,
        isSmallScreen: window.innerWidth < 640,
        isMediumScreen: window.innerWidth >= 640 && window.innerWidth < 1024,
        isLargeScreen: window.innerWidth >= 1024,
        
        // Hydration state
        isHydrated,
        
        // Tailwind classes analysis
        hasGridClass: container.className.includes('grid'),
        hasGridCols1: container.className.includes('grid-cols-1'),
        hasGridCols2: container.className.includes('sm:grid-cols-2'),
        hasGridCols3: container.className.includes('lg:grid-cols-3'),
        
        // Inline styles
        hasInlineDisplay: container.style.display,
        hasInlineGridTemplate: container.style.gridTemplateColumns,
        
        // CSS conflicts
        hasFlexClass: container.className.includes('flex'),
        hasHiddenClass: container.className.includes('hidden'),
      })
    }

    updateLayoutInfo()
    
    // Update on resize
    const handleResize = () => updateLayoutInfo()
    window.addEventListener('resize', handleResize)
    
    // Update on mutation
    const observer = new MutationObserver(updateLayoutInfo)
    observer.observe(container, { 
      attributes: true, 
      childList: true, 
      subtree: true,
      attributeFilter: ['class', 'style']
    })

    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [containerRef, isVisible, isHydrated])

  if (!isVisible || !layoutInfo) return null

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'rgba(0, 0, 0, 0.9)',
      color: 'white',
      padding: '12px',
      borderRadius: '8px',
      fontSize: '11px',
      fontFamily: 'monospace',
      zIndex: 9999,
      maxWidth: '300px',
      maxHeight: '80vh',
      overflow: 'auto'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>🔍 LAYOUT DIAGNOSTIC</div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Container:</strong> {layoutInfo.containerWidth}×{layoutInfo.containerHeight}px
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Display:</strong> {layoutInfo.display}
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Grid Columns:</strong> {layoutInfo.gridTemplateColumns}
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Gap:</strong> {layoutInfo.gap}
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Items:</strong> {layoutInfo.gridItemCount} grid, {layoutInfo.saleCardCount} cards
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Screen:</strong> {layoutInfo.windowWidth}px 
        ({layoutInfo.isSmallScreen ? 'SM' : layoutInfo.isMediumScreen ? 'MD' : 'LG'})
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Hydrated:</strong> {layoutInfo.isHydrated ? '✅' : '❌'}
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Classes:</strong>
        <br />• grid: {layoutInfo.hasGridClass ? '✅' : '❌'}
        <br />• grid-cols-1: {layoutInfo.hasGridCols1 ? '✅' : '❌'}
        <br />• sm:grid-cols-2: {layoutInfo.hasGridCols2 ? '✅' : '❌'}
        <br />• lg:grid-cols-3: {layoutInfo.hasGridCols3 ? '✅' : '❌'}
        <br />• flex: {layoutInfo.hasFlexClass ? '⚠️' : '✅'}
        <br />• hidden: {layoutInfo.hasHiddenClass ? '⚠️' : '✅'}
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Inline Styles:</strong>
        <br />• display: {layoutInfo.hasInlineDisplay || 'none'}
        <br />• grid-template: {layoutInfo.hasInlineGridTemplate || 'none'}
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        <strong>Data Attr:</strong> {layoutInfo.hasDataAttribute ? '✅' : '❌'}
      </div>
      
      <div style={{ fontSize: '10px', color: '#ccc' }}>
        Auto-updates on changes
      </div>
    </div>
  )
}
