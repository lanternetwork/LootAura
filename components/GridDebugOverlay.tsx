'use client'

import React, { useEffect, useState } from 'react'

interface GridDebugOverlayProps {
  containerRef: React.RefObject<HTMLElement>
  isVisible: boolean
  salesCount: number
}

const GridDebugOverlay: React.FC<GridDebugOverlayProps> = ({ 
  containerRef, 
  isVisible, 
  salesCount 
}) => {
  const [debugInfo, setDebugInfo] = useState({
    width: 0,
    colsDetected: 0,
    breakpoint: 'unknown',
    items: 0,
    display: 'unknown',
    gridTemplate: 'unknown'
  })
  const [showOutlines, setShowOutlines] = useState(false)

  useEffect(() => {
    if (!isVisible || process.env.NEXT_PUBLIC_DEBUG !== 'true') return

    const updateDebugInfo = () => {
      if (containerRef.current) {
        const container = containerRef.current
        const computedStyle = window.getComputedStyle(container)
        const width = container.offsetWidth
        const gridTemplate = computedStyle.gridTemplateColumns
        
        // Parse column count from grid template
        let colsDetected = 0
        if (gridTemplate.includes('repeat')) {
          const match = gridTemplate.match(/repeat\((\d+)/)
          colsDetected = match ? parseInt(match[1]) : 0
        } else {
          colsDetected = gridTemplate.split(' ').length
        }
        
        const breakpoint = width < 640 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop'
        
        setDebugInfo({
          width,
          colsDetected,
          breakpoint,
          items: salesCount,
          display: computedStyle.display,
          gridTemplate
        })
      }
    }

    updateDebugInfo()
    
    // Update on resize
    const handleResize = () => updateDebugInfo()
    window.addEventListener('resize', handleResize)
    
    return () => window.removeEventListener('resize', handleResize)
  }, [containerRef, isVisible, salesCount])

  // Apply outline styles to cards when debug mode is enabled
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEBUG !== 'true' || !containerRef.current) return

    const cards = containerRef.current.querySelectorAll('.sale-row')
    cards.forEach(card => {
      if (showOutlines) {
        (card as HTMLElement).style.outline = '1px dashed #ff6b6b'
      } else {
        (card as HTMLElement).style.outline = ''
      }
    })
  }, [showOutlines, salesCount])

  if (process.env.NEXT_PUBLIC_DEBUG !== 'true' || !isVisible) {
    return null
  }

  return (
    <div 
      style={{
        position: 'absolute',
        top: '8px',
        left: '8px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 1000,
        minWidth: '200px'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
        🔧 Grid Debug
      </div>
      <div>Width: {debugInfo.width}px</div>
      <div>Cols: {debugInfo.colsDetected}</div>
      <div>Breakpoint: {debugInfo.breakpoint}</div>
      <div>Items: {debugInfo.items}</div>
      <div>Display: {debugInfo.display}</div>
      <div style={{ marginTop: '4px' }}>
        <button
          onClick={() => setShowOutlines(!showOutlines)}
          style={{
            background: showOutlines ? '#ff6b6b' : '#4ecdc4',
            color: 'white',
            border: 'none',
            padding: '2px 6px',
            borderRadius: '2px',
            fontSize: '10px',
            cursor: 'pointer'
          }}
        >
          {showOutlines ? 'Hide' : 'Show'} Outlines
        </button>
      </div>
    </div>
  )
}

export default GridDebugOverlay
