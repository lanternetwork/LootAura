/**
 * Seller analytics data access functions
 * Server-only module for querying seller metrics
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SaleMetrics {
  saleId: string
  saleTitle: string
  views: number
  saves: number
  clicks: number
  ctr: number
}

export interface SellerWeeklyAnalytics {
  totalViews: number
  totalSaves: number
  totalClicks: number
  topSales: SaleMetrics[]
}

/**
 * Fetch seller weekly analytics for a given date range
 * Aggregates analytics events by sale_id and event_type
 * 
 * @param supabase - Supabase client (admin or RLS-scoped)
 * @param ownerId - Owner user ID
 * @param from - Start date (ISO string)
 * @param to - End date (ISO string)
 * @returns Aggregated metrics with top sales
 */
export async function getSellerWeeklyAnalytics(
  supabase: SupabaseClient,
  ownerId: string,
  from: string,
  to: string
): Promise<SellerWeeklyAnalytics> {
  try {
    // Include test events in debug mode
    const includeTestEvents = process.env.NEXT_PUBLIC_DEBUG === 'true'
    
    // Query analytics events for this owner in the date range
    let eventsQuery = supabase
      .from('analytics_events_v2')
      .select('sale_id, event_type')
      .eq('owner_id', ownerId)
      .gte('ts', from)
      .lte('ts', to)
    
    if (!includeTestEvents) {
      eventsQuery = eventsQuery.eq('is_test', false)
    }
    
    const { data: events, error: eventsError } = await eventsQuery
    
    if (eventsError) {
      // Log error but return empty metrics
      console.error('[SELLER_ANALYTICS] Error fetching analytics events:', {
        ownerId,
        from,
        to,
        error: eventsError,
      })
      return {
        totalViews: 0,
        totalSaves: 0,
        totalClicks: 0,
        topSales: [],
      }
    }
    
    if (!events || events.length === 0) {
      return {
        totalViews: 0,
        totalSaves: 0,
        totalClicks: 0,
        topSales: [],
      }
    }
    
    // Aggregate events by sale_id and event_type
    const saleMetricsMap = new Map<string, { views: number; saves: number; clicks: number }>()
    
    events.forEach((event: { sale_id: string; event_type: string }) => {
      if (!event.sale_id) return
      
      let metrics = saleMetricsMap.get(event.sale_id)
      if (!metrics) {
        metrics = { views: 0, saves: 0, clicks: 0 }
        saleMetricsMap.set(event.sale_id, metrics)
      }
      
      if (event.event_type === 'view') {
        metrics.views++
      } else if (event.event_type === 'save' || event.event_type === 'favorite') {
        metrics.saves++
      } else if (event.event_type === 'click') {
        metrics.clicks++
      }
    })
    
    // Calculate totals
    let totalViews = 0
    let totalSaves = 0
    let totalClicks = 0
    
    saleMetricsMap.forEach((metrics) => {
      totalViews += metrics.views
      totalSaves += metrics.saves
      totalClicks += metrics.clicks
    })
    
    // Get sale titles for top sales
    const saleIds = Array.from(saleMetricsMap.keys())
    
    if (saleIds.length === 0) {
      return {
        totalViews,
        totalSaves,
        totalClicks,
        topSales: [],
      }
    }
    
    // Query sale titles (limit to published sales)
    const { data: sales, error: salesError } = await supabase
      .from('sales_v2')
      .select('id, title')
      .in('id', saleIds)
      .eq('status', 'published')
      .eq('owner_id', ownerId)
    
    if (salesError) {
      console.error('[SELLER_ANALYTICS] Error fetching sales:', {
        ownerId,
        saleIds: saleIds.length,
        error: salesError,
      })
      // Return metrics without sale titles
      return {
        totalViews,
        totalSaves,
        totalClicks,
        topSales: [],
      }
    }
    
    // Build top sales list with titles
    const topSales: SaleMetrics[] = []
    
    sales?.forEach((sale) => {
      const metrics = saleMetricsMap.get(sale.id)
      if (metrics && (metrics.views > 0 || metrics.saves > 0 || metrics.clicks > 0)) {
        const ctr = metrics.views > 0 ? (metrics.clicks / metrics.views) * 100 : 0
        topSales.push({
          saleId: sale.id,
          saleTitle: sale.title || 'Untitled Sale',
          views: metrics.views,
          saves: metrics.saves,
          clicks: metrics.clicks,
          ctr,
        })
      }
    })
    
    // Sort by views descending, then by saves, then by clicks
    topSales.sort((a, b) => {
      if (a.views !== b.views) return b.views - a.views
      if (a.saves !== b.saves) return b.saves - a.saves
      return b.clicks - a.clicks
    })
    
    // Return top 5 sales
    return {
      totalViews,
      totalSaves,
      totalClicks,
      topSales: topSales.slice(0, 5),
    }
  } catch (error) {
    console.error('[SELLER_ANALYTICS] Error in getSellerWeeklyAnalytics:', {
      ownerId,
      from,
      to,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      totalViews: 0,
      totalSaves: 0,
      totalClicks: 0,
      topSales: [],
    }
  }
}

