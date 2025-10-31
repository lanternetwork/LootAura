import Stripe from 'stripe'

const stripeSecret = process.env.STRIPE_SECRET_KEY

if (!stripeSecret && process.env.NODE_ENV === 'production') {
  throw new Error('STRIPE_SECRET_KEY is required in production')
}

export const stripe = stripeSecret
  ? new Stripe(stripeSecret, {
      apiVersion: '2024-06-20'
    })
  : null

export async function createPromoteSaleIntent(params: {
  userId: string
  saleId: string
  amountCents: number
  currency?: string
}) {
  if (!stripe) {
    throw new Error('Stripe not configured')
  }

  const intent = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: params.currency ?? 'usd',
    metadata: {
      user_id: params.userId,
      sale_id: params.saleId,
      purpose: 'promote_sale'
    },
    automatic_payment_methods: {
      enabled: true
    }
  })

  return intent
}


