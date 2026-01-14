# Promotion Payments Guide

## Overview

LootAura uses **Stripe Elements + PaymentIntents** for promotion payments. This provides a seamless, embedded payment experience without redirecting users to Stripe's hosted checkout page.

## Architecture

### Payment Flow

1. **User initiates promotion** (from dashboard or sell wizard)
   - Navigates to `/promotions/checkout?mode=<draft|sale>&<params>&tier=featured_week`
   
2. **Checkout page loads** (`app/(payments)/promotions/checkout/page.tsx`)
   - Calls `POST /api/promotions/intent` to get PaymentIntent `clientSecret`
   - Renders Stripe Elements `CardElement` for card input
   
3. **User submits payment**
   - Client calls `stripe.confirmPayment()` with Elements
   - Payment processes via Stripe
   
4. **Webhook finalizes promotion** (`app/api/webhooks/stripe/route.ts`)
   - Listens for `payment_intent.succeeded` event
   - Creates/activates promotion record
   - For draft mode: creates sale from draft
   - For sale mode: activates existing promotion

### Key Components

- **`/api/promotions/intent`**: Creates PaymentIntent, validates ownership/eligibility
- **`/promotions/checkout`**: Client-side checkout page with Stripe Elements
- **`/api/webhooks/stripe`**: Finalizes promotions after successful payment
- **`/api/promotions/amount`**: Returns current promotion price for display

## Required Environment Variables

### Server-Side (Required)

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_...                    # Stripe secret key
STRIPE_WEBHOOK_SECRET=whsec_...              # Webhook signing secret
STRIPE_PRICE_ID_FEATURED_WEEK=price_...      # Optional: Stripe Price ID (falls back to $2.99)

# Feature Flags
PAYMENTS_ENABLED=true                        # Must be 'true' to enable payments
PROMOTIONS_ENABLED=true                      # Must be 'true' to enable promotions
```

### Client-Side (Required)

```bash
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...   # Stripe publishable key for Elements
```

### Optional

```bash
NEXT_PUBLIC_SITE_URL=https://lootaura.com   # Used for webhook redirects (falls back to VERCEL_URL)
NEXT_PUBLIC_DEBUG=true                      # Enables debug logging (gated)
```

## Common Failure Modes

### 1. Missing Webhook Secret

**Symptom**: Webhook events fail with `401 Unauthorized` or signature verification errors

**Solution**: 
- Ensure `STRIPE_WEBHOOK_SECRET` is set in environment variables
- Verify webhook endpoint URL in Stripe Dashboard matches your deployment
- Check webhook signing secret matches the one in Stripe Dashboard

**Debug**:
```bash
# Check if webhook secret is configured
echo $STRIPE_WEBHOOK_SECRET
```

### 2. Missing Publishable Key

**Symptom**: Checkout page fails to load Stripe Elements, shows "Stripe is not loaded"

**Solution**:
- Ensure `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set
- Verify key starts with `pk_` (test) or `pk_live_` (production)
- Check key matches the Stripe account used for `STRIPE_SECRET_KEY`

**Debug**:
```javascript
// In browser console
console.log(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
```

### 3. Missing Secret Key

**Symptom**: PaymentIntent creation fails with "Stripe is not properly configured"

**Solution**:
- Ensure `STRIPE_SECRET_KEY` is set in server environment
- Verify key starts with `sk_` (test) or `sk_live_` (production)
- Check `PAYMENTS_ENABLED=true` is set

**Debug**:
```bash
# Server-side only (never log in client)
# Check logs for "STRIPE_NOT_CONFIGURED" errors
```

### 4. Webhook Not Receiving Events

**Symptom**: Payment succeeds but promotion is not activated

**Solution**:
- Verify webhook endpoint is accessible (not blocked by firewall)
- Check Stripe Dashboard → Webhooks → Recent events
- Ensure webhook is listening for `payment_intent.succeeded`
- Verify webhook secret matches environment variable

**Debug**:
- Check Stripe Dashboard → Webhooks → Recent events for delivery status
- Review server logs for webhook processing errors
- Enable `NEXT_PUBLIC_DEBUG=true` for detailed logging

### 5. Payment Succeeds But Sale Not Created (Draft Mode)

**Symptom**: Payment completes but draft is not converted to sale

**Solution**:
- Verify draft exists and is publishable (`publishability.isPublishable === true`)
- Check webhook processed `payment_intent.succeeded` event
- Verify PaymentIntent metadata includes `draft_key`
- Check server logs for finalization errors

**Debug**:
- Review webhook logs for `finalizeDraftPromotion` errors
- Check draft publishability before payment
- Verify draft ownership matches PaymentIntent metadata

### 6. Promotion Not Activating (Sale Mode)

**Symptom**: Payment succeeds but promotion status remains `pending`

**Solution**:
- Verify promotion record exists and is in `pending` status
- Check webhook processed `payment_intent.succeeded` event
- Verify PaymentIntent metadata includes `promotion_id` and `sale_id`
- Ensure sale is eligible (published, not archived, not hidden)

**Debug**:
- Review webhook logs for `finalizeExistingSalePromotion` errors
- Check promotion record status in database
- Verify sale eligibility before payment

## Migration from Checkout Sessions

The old `/api/promotions/checkout` route (Stripe Checkout Sessions) is **deprecated** and returns `410 Gone`.

**Migration Path**:
- **Old**: `POST /api/promotions/checkout` → redirect to Stripe hosted checkout
- **New**: Navigate to `/promotions/checkout?mode=sale&sale_id=<id>&tier=featured_week`

The webhook still processes `checkout.session.completed` events for any existing Checkout Sessions created before migration.

## Security Notes

- **No PII in logs**: All logging is gated behind `NEXT_PUBLIC_DEBUG` and never logs sensitive data
- **CSRF protection**: All payment routes require CSRF tokens
- **Authentication required**: All payment routes require authenticated users
- **Webhook verification**: All webhook events are verified using Stripe signature
- **Idempotency**: Webhook handlers check for existing promotions to prevent duplicate processing

## Testing

### Test Mode

Use Stripe test keys and test card numbers:
- Test card: `4242 4242 4242 4242`
- Any future expiry date
- Any 3-digit CVC
- Any ZIP code

### Production

Ensure all environment variables are set correctly and webhook endpoint is configured in Stripe Dashboard.

## Support

For issues:
1. Check environment variables are set correctly
2. Review server logs for error messages
3. Check Stripe Dashboard → Webhooks for event delivery status
4. Enable `NEXT_PUBLIC_DEBUG=true` for detailed logging (development only)
