import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseDateBounds, checkDateOverlap, validateDateRange } from '@/lib/shared/dateBounds'

// Markers API with server-side date, distance, and category filtering
// Response shape expected by SalesMap: plain array
// [{ id: string, title: string, lat: number, lng: number }]
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  
  try {
    const url = new URL(request.url)
    const q = url.searchParams
    const latParam = q.get('lat')
    const lngParam = q.get('lng')
    const distanceParam = q.get('distanceKm')
    const startDate = q.get('from') || q.get('dateFrom') || q.get('startDate') || undefined
    const endDate = q.get('to') || q.get('dateTo') || q.get('endDate') || undefined
    
    const limitParam = q.get('limit')
    const catsParam = q.get('categories') || q.get('tags') || ''

    // Validate lat/lng
    const originLat = latParam !== null ? parseFloat(latParam) : NaN
    const originLng = lngParam !== null ? parseFloat(lngParam) : NaN
    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      return NextResponse.json({ error: 'Missing or invalid lat/lng' }, { status: 400 })
    }
    // Normalize distance (km)
    const distanceKm = Number.isFinite(parseFloat(String(distanceParam))) ? Math.max(0, parseFloat(String(distanceParam))) : 40
    const limit = Number.isFinite(parseFloat(String(limitParam))) ? Math.min(parseInt(String(limitParam), 10), 1000) : 1000
    const categories = catsParam ? catsParam.split(',').map(s => s.trim()).filter(Boolean) : []

    const sb = createSupabaseServerClient()

    // Fetch a slice with precisely the used columns from the public view
    const { data, error } = await sb
      .from('sales_v2')
      .select('id, title, description, lat, lng, starts_at, ends_at, date_start, date_end, time_start, time_end')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('id', { ascending: true })
      .limit(Math.min(limit, 1000))

    if (error) {
      console.error('Markers query error:', error)
      return NextResponse.json({
        error: 'Database query failed',
        code: (error as any)?.code,
        details: (error as any)?.message || (error as any)?.details,
        hint: (error as any)?.hint,
        relation: 'public.sales_v2'
      }, { status: 500 })
    }

    // Validate date range parameters
    const dateValidation = validateDateRange(startDate, endDate)
    if (!dateValidation.valid) {
      return NextResponse.json({ error: dateValidation.error }, { status: 400 })
    }

    // Parse date bounds using shared helper
    const dateBounds = parseDateBounds(startDate, endDate)
    
    // Debug logging for date filtering
    console.log('[MARKERS API] Date filtering debug:', {
      startDate,
      endDate,
      dateBounds,
      totalRecords: data?.length || 0,
      url: request.url,
      sampleSales: data?.slice(0, 3).map((s: any) => ({
        id: s.id,
        title: s.title,
        date_start: s.date_start,
        date_end: s.date_end,
        time_start: s.time_start,
        time_end: s.time_end,
        starts_at: s.starts_at
      }))
    })

    const filtered = (data || [])
      .map((sale: any) => {
        const lat = Number(sale.lat)
        const lng = Number(sale.lng)
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null
        
        // Compute sale start date - use starts_at if available, otherwise compute from date_start + time_start
        let saleStart = null
        if (sale.starts_at) {
          saleStart = new Date(sale.starts_at)
        } else if (sale.date_start) {
          if (sale.time_start) {
            saleStart = new Date(`${sale.date_start}T${sale.time_start}`)
          } else {
            saleStart = new Date(`${sale.date_start}T00:00:00`)
          }
        }
        
        // Compute sale end date - use date_end + time_end, or date_end as end of day
        let saleEnd = null
        if (sale.date_end) {
          if (sale.time_end) {
            saleEnd = new Date(`${sale.date_end}T${sale.time_end}`)
          } else {
            saleEnd = new Date(`${sale.date_end}T23:59:59.999`)
          }
        } else if (saleStart) {
          // If no end date, treat as single-day sale
          saleEnd = new Date(saleStart)
          saleEnd.setHours(23, 59, 59, 999)
        }
        
        return { ...sale, lat, lng, saleStart, saleEnd }
      })
      .filter(Boolean)
      .filter((sale: any) => {
        // Skip date filtering if no date bounds provided
        if (!dateBounds) return true
        
        // Skip sales with no date information
        if (!sale.saleStart && !sale.saleEnd) {
          console.log('[MARKERS API] Sale has no date info, excluding:', {
            saleId: sale.id,
            title: sale.title
          })
          return false
        }
        
        const overlaps = checkDateOverlap(sale.saleStart, sale.saleEnd, dateBounds)
        if (!overlaps) {
          console.log('[MARKERS API] Sale filtered out by date:', {
            saleId: sale.id,
            title: sale.title,
            saleStart: sale.saleStart,
            saleEnd: sale.saleEnd,
            dateBounds,
            originalDateStart: sale.date_start,
            originalDateEnd: sale.date_end,
            originalTimeStart: sale.time_start,
            originalTimeEnd: sale.time_end
          })
        }
        return overlaps
      })
      .map((sale: any) => {
        const R = 6371
        const dLat = (sale.lat - originLat) * Math.PI / 180
        const dLng = (sale.lng - originLng) * Math.PI / 180
        const a = Math.sin(dLat/2) ** 2 + Math.cos(originLat * Math.PI/180) * Math.cos(sale.lat * Math.PI/180) * Math.sin(dLng/2) ** 2
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        const distanceKm = R * c
        return { ...sale, distanceKm }
      })
      .filter((sale: any) => sale.distanceKm <= distanceKm)

    const markers = filtered
      .slice(0, Math.min(limit, 1000))
      .map((sale: any) => ({ id: sale.id, title: sale.title, lat: sale.lat, lng: sale.lng }))

    // Debug logging for final results
    console.log('[MARKERS API] Final results:', {
      totalRecords: data?.length || 0,
      afterDateFilter: filtered.length,
      finalMarkers: markers.length,
      dateBounds,
      dateFilterApplied: !!dateBounds,
      sampleFilteredSales: filtered.slice(0, 3).map((s: any) => ({
        id: s.id,
        title: s.title,
        saleStart: s.saleStart?.toISOString(),
        saleEnd: s.saleEnd?.toISOString()
      }))
    })

    // Return structured response matching /api/sales format
    return NextResponse.json({
      ok: true,
      data: markers,
      center: { lat: originLat, lng: originLng },
      distanceKm,
      count: markers.length,
      durationMs: Date.now() - startedAt
    })
  } catch (error: any) {
    console.error('Markers API error:', error)
    return NextResponse.json({
      ok: false,
      error: 'Database query failed',
      code: (error as any)?.code,
      details: (error as any)?.message || (error as any)?.details,
      hint: (error as any)?.hint,
      relation: 'public.sales_v2'
    }, { status: 500 })
  }
}


