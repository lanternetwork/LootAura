import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'
import { createPromoteSaleIntent } from '@/lib/payments/stripe'

export const runtime = 'nodejs'

async function handler(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient()
    const auth = await supabase.auth.getUser()
    const user = auth.data?.user
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const saleId = body?.saleId as string | undefined
    if (!saleId) {
      return NextResponse.json({ error: 'saleId required' }, { status: 400 })
    }

    const { data: sale, error: saleErr } = await supabase
      .from('sales_v2')
      .select('*')
      .eq('id', saleId)
      .single()

    if (saleErr || !sale || sale.owner_id !== user.id) {
      return NextResponse.json({ error: 'not found or not owner' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    if (sale.is_promoted === true && sale.promoted_until && sale.promoted_until > nowIso) {
      return NextResponse.json({ error: 'already promoted' }, { status: 409 })
    }

    const amountCents = Number(process.env.PROMOTE_SALE_PRICE_CENTS ?? 500)
    const intent = await createPromoteSaleIntent({ userId: user.id, saleId, amountCents })

    await supabase
      .from('payments')
      .insert({
        user_id: user.id,
        sale_id: saleId,
        amount: amountCents,
        currency: 'usd',
        status: 'requires_payment_method',
        purpose: 'promote_sale',
        stripe_payment_intent_id: intent.id
      })

    return NextResponse.json({ clientSecret: intent.client_secret }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: 'internal_error', message: e?.message || 'error' }, { status: 500 })
  }
}

export const POST = withRateLimit(handler as any, [Policies.MUTATE_MINUTE, Policies.MUTATE_DAILY])


