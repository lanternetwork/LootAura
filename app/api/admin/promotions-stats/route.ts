import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()

    // Totals
    const { data: paymentsAll } = await supabase
      .from('payments')
      .select('amount, status, purpose, sale_id, user_id, created_at')

    const totalPromotions = paymentsAll?.filter(p => p.purpose === 'promote_sale').length || 0
    const totalRevenue = paymentsAll
      ?.filter(p => p.purpose === 'promote_sale' && p.status === 'succeeded')
      .reduce((acc, p) => acc + (p.amount || 0), 0) || 0

    const nowIso = new Date().toISOString()
    const { data: activeSales } = await supabase
      .from('sales_v2')
      .select('id')
      .eq('is_promoted', true)

    const activePromotions = (activeSales || []).filter((s: any) => !s.promoted_until || s.promoted_until > nowIso).length

    const { data: last20 } = await supabase
      .from('payments')
      .select('id, user_id, sale_id, status, amount, currency, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({
      ok: true,
      total_promotions: totalPromotions,
      active_promotions: activePromotions,
      total_revenue_cents: totalRevenue,
      last_20_payments: last20 || []
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}


