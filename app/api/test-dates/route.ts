import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Test endpoint to verify date filtering logic
export async function GET(request: NextRequest) {
  try {
    const sb = createSupabaseServerClient()
    
    // Get a few sample sales to test date filtering
    const { data: sales, error } = await sb
      .from('sales_v2')
      .select('id, title, date_start, time_start, date_end, time_end, starts_at')
      .limit(5)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Test date computation logic
    const processedSales = sales?.map((sale: any) => {
      // Compute sale start date
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
      
      // Compute sale end date
      let saleEnd = null
      if (sale.date_end) {
        if (sale.time_end) {
          saleEnd = new Date(`${sale.date_end}T${sale.time_end}`)
        } else {
          saleEnd = new Date(`${sale.date_end}T23:59:59.999`)
        }
      } else if (saleStart) {
        saleEnd = new Date(saleStart)
        saleEnd.setHours(23, 59, 59, 999)
      }
      
      return {
        id: sale.id,
        title: sale.title,
        original: {
          date_start: sale.date_start,
          time_start: sale.time_start,
          date_end: sale.date_end,
          time_end: sale.time_end,
          starts_at: sale.starts_at
        },
        computed: {
          saleStart: saleStart?.toISOString(),
          saleEnd: saleEnd?.toISOString()
        }
      }
    })
    
    return NextResponse.json({
      success: true,
      sales: processedSales,
      count: sales?.length || 0
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
