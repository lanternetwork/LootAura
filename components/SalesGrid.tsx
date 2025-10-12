'use client'

import React, { useRef, useEffect, useState } from 'react'
import SaleCard from '@/components/SaleCard'
import { Sale } from '@/lib/types'

interface SalesGridProps {
  sales: Sale[]
  authority: 'MAP' | 'FILTERS'
  isLoading?: boolean
  className?: string
}

export default function SalesGrid({ 
  sales, 
  authority, 
  isLoading = false,
  className = ''
}: SalesGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridState, setGridState] = useState<{
    columns: number
    containerWidth: number
    isResponsive: boolean
  }>({ columns: 1, containerWidth: 0, isResponsive: true })

  // Calculate responsive columns based on container width
  useEffect(() => {
    const updateGridState = () => {
      if (!containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      let columns = 1

      // Responsive breakpoints
      if (containerWidth >= 1024) {
        columns = 3
      } else if (containerWidth >= 640) {
        columns = 2
      } else {
        columns = 1
      }

      setGridState({
        columns,
        containerWidth,
        isResponsive: true
      })
    }

    updateGridState()
    
    const resizeObserver = new ResizeObserver(updateGridState)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Generate CSS custom properties for grid
  const gridStyle = {
    '--grid-columns': gridState.columns,
    '--grid-gap': '1.5rem',
    '--grid-min-item-width': '280px'
  } as React.CSSProperties

  return (
    <div 
      ref={containerRef}
      className={`sales-grid ${className}`}
      style={gridStyle}
      data-testid="sales-grid"
      data-authority={authority}
      data-columns={gridState.columns}
      data-width={gridState.containerWidth}
    >
      {sales.map((sale) => (
        <div key={sale.id} className="sales-grid-item">
          <SaleCard sale={sale} authority={authority} />
        </div>
      ))}
      
      {/* Loading skeletons */}
      {isLoading && Array.from({ length: 6 }).map((_, idx) => (
        <div key={`skeleton-${idx}`} className="sales-grid-item">
          <div className="sale-skeleton">
            <div className="skeleton-header"></div>
            <div className="skeleton-content"></div>
            <div className="skeleton-footer"></div>
          </div>
        </div>
      ))}
    </div>
  )
}
