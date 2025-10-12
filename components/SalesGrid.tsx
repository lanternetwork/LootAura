'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import SaleCard from './SaleCard'
import SaleCardSkeleton from './SaleCardSkeleton'
import { Sale } from '@/lib/types'

interface SalesGridProps {
  sales: Sale[]
  loading: boolean
  authority: 'MAP' | 'FILTERS'
  emptyStateMessage: React.ReactNode
  skeletonCount?: number
  className?: string
}

const SalesGrid: React.FC<SalesGridProps> = ({
  sales,
  loading,
  authority,
  emptyStateMessage,
  skeletonCount = 6,
  className = ''
}) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)
  const [isHydrated, setIsHydrated] = useState(false)

  // Calculate responsive columns based on container width
  const updateColumns = useCallback(() => {
    if (gridRef.current) {
      const width = gridRef.current.offsetWidth
      setContainerWidth(width)
      
      if (width < 640) {
        setColumns(1)
      } else if (width < 1024) {
        setColumns(2)
      } else {
        setColumns(3)
      }
    }
  }, [])

  // Set up ResizeObserver for responsive behavior
  useEffect(() => {
    setIsHydrated(true)
    updateColumns() // Initial calculation

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === gridRef.current) {
          updateColumns()
        }
      }
    })

    if (gridRef.current) {
      resizeObserver.observe(gridRef.current)
    }

    return () => {
      if (gridRef.current) {
        resizeObserver.unobserve(gridRef.current)
      }
      resizeObserver.disconnect()
    }
  }, [updateColumns])

  // Render sales items
  const renderSales = (items: Sale[]) => {
    if (items.length === 0) {
      return <div className="col-span-full text-center py-16">{emptyStateMessage}</div>
    }
    
    return items.map(sale => (
      <div key={sale.id} className="sales-grid-item">
        <SaleCard sale={sale} authority={authority} />
      </div>
    ))
  }

  // Render skeleton loading states
  const renderSkeletons = (count: number) => {
    return Array.from({ length: count }).map((_, idx) => (
      <div key={`skeleton-${idx}`} className="sales-grid-item">
        <SaleCardSkeleton />
      </div>
    ))
  }

  // Determine what to render
  const shouldShowSkeletons = loading && authority !== 'MAP'
  const hasSales = sales.length > 0

  return (
    <div
      ref={gridRef}
      className={`sales-grid ${className}`}
      style={{ 
        '--grid-columns': columns, 
        '--grid-gap': '1.5rem' 
      } as React.CSSProperties}
      data-columns={columns}
      data-container-width={containerWidth}
      data-authority={authority}
      data-hydrated={isHydrated}
      data-testid="sales-grid"
    >
      {shouldShowSkeletons ? (
        renderSkeletons(skeletonCount)
      ) : hasSales ? (
        renderSales(sales)
      ) : (
        <div className="col-span-full text-center py-16">{emptyStateMessage}</div>
      )}
    </div>
  )
}

export default SalesGrid