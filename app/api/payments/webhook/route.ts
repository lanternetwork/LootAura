import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/payments/stripe'
import Stripe from 'stripe'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { withRateLimit } from '@/lib/rateLimit/withRateLimit'
import { Policies } from '@/lib/rateLimit/policies'

export const runtime = 'nodejs'

// Webhooks must receive raw body; Next.js route handlers provide that by default in app router

async function handler(req: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ ok: false, error: 'stripe_not_configured' }, { status: 200 })
    }

    const sig = req.headers.get('stripe-signature') || ''
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.warn('[STRIPE] Missing STRIPE_WEBHOOK_SECRET')
      return NextResponse.json({ ok: false }, { status: 200 })
    }

    const rawBody = await req.text()
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } catch (err: any) {
      console.error('[STRIPE] Webhook signature verification failed', err?.message)
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
    }

    const supabase = createSupabaseServerClient()

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent
      const userId = (intent.metadata?.user_id as string) || null
      const saleId = (intent.metadata?.sale_id as string) || null
      const purpose = (intent.metadata?.purpose as string) || null

      if (purpose === 'promote_sale' && userId && saleId) {
        await supabase
          .from('payments')
          .update({
            status: 'succeeded',
            stripe_payment_method_id: intent.payment_method as string | null,
            raw_event: event as any
          })
          .eq('stripe_payment_intent_id', intent.id)

        // Promote sale for configured duration
        const hours = Number(process.env.PROMOTE_SALE_DURATION_HOURS ?? 72)
        await supabase
          .from('sales')
          .update({
            is_promoted: true,
            promoted_until: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
            promotion_source: 'stripe'
          })
          .eq('id', saleId)
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent
      await createSupabaseServerClient()
        .from('payments')
        .update({ status: 'failed', raw_event: event as any })
        .eq('stripe_payment_intent_id', intent.id)
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (e: any) {
    console.error('[STRIPE] Webhook error', e?.message)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

// Bypass rate limiting for webhook
export const POST = withRateLimit(handler as any, [Policies.MUTATE_MINUTE], { bypass: true })


