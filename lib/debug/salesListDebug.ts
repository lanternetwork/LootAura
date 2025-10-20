/**
 * Sales List debugging utilities
 * Controlled by NEXT_PUBLIC_DEBUG environment variable
 */

const isDebugEnabled = () => process.env.NEXT_PUBLIC_DEBUG === 'true'

export const salesListDebug = {
  log: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.log(`[SALES LIST DEBUG] ${message}`, ...args)
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.warn(`[SALES LIST DEBUG] ${message}`, ...args)
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (isDebugEnabled()) {
      console.error(`[SALES LIST DEBUG] ${message}`, ...args)
    }
  },
  
  group: (label: string) => {
    if (isDebugEnabled()) {
      console.group(`[SALES LIST DEBUG] ${label}`)
    }
  },
  
  groupEnd: () => {
    if (isDebugEnabled()) {
      console.groupEnd()
    }
  },
  
  // Sales list specific debugging
  logSalesData: (operation: string, data: {
    salesCount: number
    hasMore?: boolean
    sampleSales?: Array<{ id: string; title: string }>
    authority?: string
    append?: boolean
  }) => {
    if (isDebugEnabled()) {
      console.log(`📊 [SALES DATA] ${operation}:`, {
        count: data.salesCount,
        hasMore: data.hasMore,
        sample: data.sampleSales,
        authority: data.authority,
        append: data.append
      })
    }
  },
  
  logVisibleRendered: (authority: 'MAP' | 'FILTERS', data: {
    visibleCount: number
    renderedCount: number
    sampleVisible?: Array<{ id: string; title: string }>
  }) => {
    if (isDebugEnabled()) {
      console.log(`👁️ [VISIBLE/RENDERED] ${authority}:`, {
        visible: data.visibleCount,
        rendered: data.renderedCount,
        sample: data.sampleVisible
      })
    }
  },
  
  logRendering: (authority: string, data: {
    isUpdating: boolean
    staleSalesCount: number
    renderedSalesCount: number
    visibleSalesCount?: number
    salesCount?: number
    itemsToRenderCount: number
    finalItemsToRenderCount?: number
    loading?: boolean
    fetchedOnce?: boolean
  }) => {
    if (isDebugEnabled()) {
      console.log(`🎨 [RENDERING] ${authority}:`, {
        updating: data.isUpdating,
        stale: data.staleSalesCount,
        rendered: data.renderedSalesCount,
        visible: data.visibleSalesCount,
        sales: data.salesCount,
        itemsToRender: data.itemsToRenderCount,
        finalItems: data.finalItemsToRenderCount,
        loading: data.loading,
        fetched: data.fetchedOnce
      })
    }
  },
  
  logSaleRender: (sale: { id: string; title: string }) => {
    if (isDebugEnabled()) {
      console.log(`🏷️ [SALE RENDER] ${sale.id}: ${sale.title}`)
    }
  },
  
  logEmptyState: (reason: string, details?: any) => {
    if (isDebugEnabled()) {
      console.log(`🚫 [EMPTY STATE] ${reason}`, details || '')
    }
  },
  
  logPerformance: (operation: string, startTime: number) => {
    if (isDebugEnabled()) {
      const duration = Date.now() - startTime
      const status = duration > 1000 ? '🐌 Slow' : duration > 500 ? '⚠️ Medium' : '⚡ Fast'
      console.log(`${status} [SALES LIST PERF] ${operation}: ${duration}ms`)
    }
  }
}

export default salesListDebug
