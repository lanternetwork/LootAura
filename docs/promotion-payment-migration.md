# Promotion Payment Flow Migration: Stripe Checkout → Stripe Elements + PaymentIntents

## Current Flow Inventory

### Files/Routes Involved

#### **Server-Side Routes**

1. **`app/api/drafts/publish/route.ts`** (Create-Sale Flow)
   - **Purpose**: Publishes draft, creates Stripe Checkout Session if `wantsPromotion === true`
   - **Key Logic**:
     - Lines 213-231: Creates `checkout.sessions.create()` with metadata
     - Metadata: `draft_key`, `owner_profile_id`, `tier`, `wants_promotion`
     - Returns `{ checkoutUrl, requiresPayment: true }` instead of creating sale
   - **Current Issues**: Uses `customer_email`, redirects to hosted Stripe Checkout

2. **`app/api/promotions/checkout/route.ts`** (Dashboard Promote Flow)
   - **Purpose**: Creates Stripe Checkout Session for existing sale promotion
   - **Key Logic**:
     - Lines 208-226: Creates `checkout.sessions.create()` with metadata
     - Metadata: `promotion_id`, `sale_id`, `owner_profile_id`, `tier`
     - Creates promotion record in `pending` status before checkout
   - **Current Issues**: Uses `customer_email`, redirects to hosted Stripe Checkout

3. **`app/api/webhooks/stripe/route.ts`** (Webhook Handler)
   - **Purpose**: Finalizes promotion after payment succeeds
   - **Key Logic**:
     - Lines 142-341: Handles `checkout.session.completed` event
     - **Draft Flow** (lines 150-305): Reads draft, creates sale + promotion, deletes draft
     - **Existing Sale Flow** (lines 309-331): Updates promotion to `active`
     - Metadata extraction: `promotion_id`, `sale_id`, `draft_key`, `wants_promotion`
   - **Current Issues**: Relies on `checkout.session.completed`, expects `session.payment_intent` and `session.customer`

#### **Client-Side Components**

4. **`app/sell/new/SellWizardClient.tsx`** (Create-Sale Wizard)
   - **Purpose**: Client-side wizard for creating sales
   - **Key Logic**:
     - Lines 1794: Redirects to `checkoutUrl` via `window.location.href`
     - Lines 1709-1796: Handles publish response, redirects if `requiresPayment === true`
   - **Current Issues**: Redirects to hosted Stripe Checkout page

5. **`components/dashboard/DashboardSaleCard.tsx`** (Dashboard Promote Button)
   - **Purpose**: Promotes existing sales from dashboard
   - **Key Logic**:
     - Lines 70-137: Calls `/api/promotions/checkout`, redirects to `checkoutUrl`
     - Line 126: `window.location.href = data.checkoutUrl`
   - **Current Issues**: Redirects to hosted Stripe Checkout page

#### **Supporting Files**

6. **`lib/stripe/client.ts`**
   - **Purpose**: Stripe client initialization and helpers
   - **Key Functions**: `getStripeClient()`, `isPaymentsEnabled()`, `isPromotionsEnabled()`, `getFeaturedWeekPriceId()`

7. **`lib/draft/draftClient.ts`**
   - **Purpose**: Client-side draft API helpers
   - **Key Function**: `publishDraftServer()` - calls `/api/drafts/publish`

---

## Current Flow Diagrams

### **Create-Sale Flow (Draft Publish with Promotion)**

```
┌─────────────────┐
│ SellWizardClient│
│  (Review Step)  │
└────────┬────────┘
         │ handleSubmit()
         │ POST /api/drafts/publish
         ▼
┌─────────────────────────┐
│ /api/drafts/publish      │
│ - Validates draft        │
│ - Checks wantsPromotion  │
│ - Creates CheckoutSession│
│   metadata:              │
│   - draft_key            │
│   - owner_profile_id     │
│   - tier                 │
│   - wants_promotion      │
│ - Returns checkoutUrl    │
└────────┬────────────────┘
         │ { checkoutUrl, requiresPayment: true }
         ▼
┌─────────────────┐
│ Client Redirect │
│ window.location │
│   .href = url   │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ Stripe Hosted        │
│ Checkout Page        │
│ - Collects card      │
│ - Collects email      │
│ - Processes payment   │
└────────┬─────────────┘
         │ Payment succeeds
         │ Redirects to success_url
         │ Webhook: checkout.session.completed
         ▼
┌─────────────────────────┐
│ /api/webhooks/stripe     │
│ checkout.session.completed│
│ - Reads draft by draft_key│
│ - Creates sale            │
│ - Creates promotion       │
│ - Deletes draft           │
└──────────────────────────┘
```

### **Dashboard Promote Flow (Existing Sale)**

```
┌──────────────────────┐
│ DashboardSaleCard    │
│  (Promote Button)    │
└──────────┬───────────┘
           │ handlePromote()
           │ POST /api/promotions/checkout
           ▼
┌──────────────────────────┐
│ /api/promotions/checkout  │
│ - Validates sale          │
│ - Creates promotion       │
│   (status: 'pending')     │
│ - Creates CheckoutSession │
│   metadata:               │
│   - promotion_id          │
│   - sale_id               │
│   - owner_profile_id      │
│   - tier                  │
│ - Returns checkoutUrl     │
└──────────┬───────────────┘
           │ { checkoutUrl }
           ▼
┌─────────────────┐
│ Client Redirect │
│ window.location │
│   .href = url   │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ Stripe Hosted        │
│ Checkout Page        │
│ - Collects card      │
│ - Collects email     │
│ - Processes payment  │
└────────┬─────────────┘
         │ Payment succeeds
         │ Redirects to success_url
         │ Webhook: checkout.session.completed
         ▼
┌─────────────────────────┐
│ /api/webhooks/stripe     │
│ checkout.session.completed│
│ - Updates promotion      │
│   (status: 'active')     │
│ - Stores payment_intent  │
└──────────────────────────┘
```

---

## Proposed New Flow: Stripe Elements + PaymentIntents

### **Design Principles**

1. **No Stripe Customers**: Use one-time PaymentIntents only
2. **No Email Collection**: Remove `customer_email` and `receipt_email`
3. **No Billing Address**: Card-only, no address fields
4. **Server-Side Finalization**: Webhook still required, client never trusts payment success
5. **Keep Feature Flags**: Maintain `PAYMENTS_ENABLED` and `PROMOTIONS_ENABLED` gating

### **Metadata Keys (Carry Through)**

All metadata keys must be preserved in PaymentIntent metadata:

- **`draft_key`** (string, optional): For draft-based sale creation
- **`sale_id`** (string, optional): For existing sale promotion
- **`promotion_id`** (string, optional): For existing sale promotion
- **`owner_profile_id`** (string, required): User ID who owns the sale/draft
- **`tier`** (string, required): Promotion tier (currently only `'featured_week'`)
- **`wants_promotion`** (string, optional): `'true'` for draft-based flow

**Note**: `draft_key` + `wants_promotion` OR `promotion_id` + `sale_id` are mutually exclusive patterns.

---

## Proposed New Flow Diagrams

### **Create-Sale Flow (Draft Publish with Promotion)**

```
┌─────────────────┐
│ SellWizardClient│
│  (Review Step)  │
└────────┬────────┘
         │ handleSubmit()
         │ POST /api/drafts/publish
         ▼
┌─────────────────────────┐
│ /api/drafts/publish      │
│ - Validates draft        │
│ - Checks wantsPromotion  │
│ - Creates PaymentIntent  │
│   metadata:              │
│   - draft_key            │
│   - owner_profile_id     │
│   - tier                 │
│   - wants_promotion      │
│ - Returns clientSecret   │
└────────┬────────────────┘
         │ { clientSecret, requiresPayment: true }
         ▼
┌──────────────────────┐
│ Stripe Elements      │
│ (Embedded in page)   │
│ - CardElement        │
│ - Submit button      │
└────────┬─────────────┘
         │ User submits
         │ confirmPayment(clientSecret)
         ▼
┌─────────────────────────┐
│ Stripe.js confirmPayment│
│ - Processes payment     │
│ - Returns PaymentIntent │
└────────┬────────────────┘
         │ Payment succeeds
         │ Webhook: payment_intent.succeeded
         ▼
┌─────────────────────────┐
│ /api/webhooks/stripe     │
│ payment_intent.succeeded │
│ - Reads draft by         │
│   draft_key (metadata)   │
│ - Creates sale           │
│ - Creates promotion      │
│ - Deletes draft          │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────┐
│ Client Polls Status  │
│ or Redirects to      │
│ Success Page         │
└──────────────────────┘
```

### **Dashboard Promote Flow (Existing Sale)**

```
┌──────────────────────┐
│ DashboardSaleCard    │
│  (Promote Button)    │
└──────────┬───────────┘
           │ handlePromote()
           │ POST /api/promotions/checkout
           ▼
┌──────────────────────────┐
│ /api/promotions/checkout  │
│ - Validates sale          │
│ - Creates promotion       │
│   (status: 'pending')     │
│ - Creates PaymentIntent   │
│   metadata:               │
│   - promotion_id          │
│   - sale_id               │
│   - owner_profile_id      │
│   - tier                  │
│ - Returns clientSecret    │
└──────────┬───────────────┘
           │ { clientSecret }
           ▼
┌──────────────────────┐
│ Stripe Elements      │
│ (Modal or Inline)    │
│ - CardElement        │
│ - Submit button      │
└────────┬─────────────┘
         │ User submits
         │ confirmPayment(clientSecret)
         ▼
┌─────────────────────────┐
│ Stripe.js confirmPayment│
│ - Processes payment     │
│ - Returns PaymentIntent │
└────────┬────────────────┘
         │ Payment succeeds
         │ Webhook: payment_intent.succeeded
         ▼
┌─────────────────────────┐
│ /api/webhooks/stripe     │
│ payment_intent.succeeded │
│ - Updates promotion      │
│   (status: 'active')     │
│ - Stores payment_intent  │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────┐
│ Client Polls Status  │
│ or Redirects to      │
│ Success Page         │
└──────────────────────┘
```

---

## Routes/Components to Change/Add

### **New Routes to Add**

1. **`app/api/promotions/payment-intent/route.ts`** (NEW)
   - **Purpose**: Create PaymentIntent for promotion (replaces checkout session creation)
   - **Endpoints**:
     - `POST /api/promotions/payment-intent`
     - Body: `{ sale_id, tier }` OR `{ draft_key }` (for draft flow)
   - **Returns**: `{ clientSecret: string, paymentIntentId: string }`
   - **Logic**:
     - Validates sale/draft exists and belongs to user
     - Creates promotion record (if not exists) with `status: 'pending'`
     - Creates PaymentIntent with metadata
     - Returns clientSecret for client-side confirmation

### **Routes to Modify**

2. **`app/api/drafts/publish/route.ts`** (MODIFY)
   - **Changes**:
     - Replace `stripe.checkout.sessions.create()` with `stripe.paymentIntents.create()`
     - Remove `customer_email`, `success_url`, `cancel_url`
     - Add metadata: `draft_key`, `owner_profile_id`, `tier`, `wants_promotion`
     - Return `{ clientSecret, requiresPayment: true }` instead of `{ checkoutUrl }`
   - **Lines to Change**: 213-231

3. **`app/api/promotions/checkout/route.ts`** (MODIFY → RENAME?)
   - **Option A**: Rename to `/api/promotions/payment-intent`
   - **Option B**: Keep name, change implementation
   - **Changes**:
     - Replace `stripe.checkout.sessions.create()` with `stripe.paymentIntents.create()`
     - Remove `customer_email`, `success_url`, `cancel_url`
     - Add metadata: `promotion_id`, `sale_id`, `owner_profile_id`, `tier`
     - Return `{ clientSecret }` instead of `{ checkoutUrl }`
   - **Lines to Change**: 208-226

4. **`app/api/webhooks/stripe/route.ts`** (MODIFY)
   - **Changes**:
     - Replace `checkout.session.completed` handler with `payment_intent.succeeded`
     - Extract metadata from `PaymentIntent` instead of `CheckoutSession`
     - Remove references to `session.payment_intent` and `session.customer`
     - Keep same business logic (create sale, activate promotion)
   - **Lines to Change**: 141-341

### **Client Components to Modify**

5. **`app/sell/new/SellWizardClient.tsx`** (MODIFY)
   - **Changes**:
     - Replace redirect logic with Stripe Elements integration
     - Add Stripe Elements CardElement component
     - Handle `clientSecret` from publish response
     - Call `stripe.confirmPayment()` instead of redirecting
     - Show payment status (processing, success, error)
     - Poll or redirect after successful payment
   - **Lines to Change**: 1794 (redirect), add new payment UI

6. **`components/dashboard/DashboardSaleCard.tsx`** (MODIFY)
   - **Changes**:
     - Replace redirect logic with Stripe Elements integration
     - Add payment modal or inline form
     - Handle `clientSecret` from checkout response
     - Call `stripe.confirmPayment()` instead of redirecting
     - Show payment status and update UI after success
   - **Lines to Change**: 126 (redirect), add new payment UI

### **New Client Components to Add**

7. **`components/payment/PaymentForm.tsx`** (NEW)
   - **Purpose**: Reusable Stripe Elements payment form
   - **Props**:
     - `clientSecret: string`
     - `onSuccess: () => void`
     - `onError: (error: Error) => void`
     - `onCancel?: () => void`
   - **Features**:
     - CardElement only (no name/email/address)
     - Submit button with loading state
     - Error handling and display
     - Success confirmation

8. **`components/payment/PaymentModal.tsx`** (NEW, optional)
   - **Purpose**: Modal wrapper for PaymentForm
   - **Use Case**: Dashboard promotion flow
   - **Props**: Same as PaymentForm + `isOpen`, `onClose`

### **Supporting Files to Modify**

9. **`lib/stripe/client.ts`** (MODIFY)
   - **Changes**: None required (client initialization stays the same)
   - **Note**: May need to add `getStripePublishableKey()` helper for client-side

10. **`lib/draft/draftClient.ts`** (MODIFY)
    - **Changes**: Update `publishDraftServer()` return type
    - **Before**: `{ checkoutUrl: string, requiresPayment: true }`
    - **After**: `{ clientSecret: string, requiresPayment: true }`

---

## Implementation Checklist

### **Phase 1: Server-Side Changes**

- [ ] Create `app/api/promotions/payment-intent/route.ts` (or modify existing checkout route)
- [ ] Modify `app/api/drafts/publish/route.ts` to create PaymentIntent
- [ ] Modify `app/api/webhooks/stripe/route.ts` to handle `payment_intent.succeeded`
- [ ] Remove `customer_email` from all PaymentIntent creation
- [ ] Ensure metadata keys are preserved: `draft_key`, `sale_id`, `promotion_id`, `owner_profile_id`, `tier`, `wants_promotion`
- [ ] Test webhook finalization logic

### **Phase 2: Client-Side Components**

- [ ] Create `components/payment/PaymentForm.tsx`
- [ ] Create `components/payment/PaymentModal.tsx` (optional)
- [ ] Modify `app/sell/new/SellWizardClient.tsx` to use PaymentForm
- [ ] Modify `components/dashboard/DashboardSaleCard.tsx` to use PaymentForm/Modal
- [ ] Add Stripe.js initialization (load from CDN or npm)
- [ ] Handle payment status polling or redirect after success

### **Phase 3: Testing & Cleanup**

- [ ] Test create-sale flow end-to-end
- [ ] Test dashboard promote flow end-to-end
- [ ] Verify webhook finalization works correctly
- [ ] Remove old checkout session creation code
- [ ] Update error handling for payment failures
- [ ] Add loading states and user feedback

---

## Metadata Schema Reference

### **PaymentIntent Metadata (All Flows)**

```typescript
{
  // Draft-based flow (mutually exclusive with promotion_id + sale_id)
  draft_key?: string
  wants_promotion?: 'true'
  
  // Existing sale flow (mutually exclusive with draft_key)
  promotion_id?: string
  sale_id?: string
  
  // Common fields (always present)
  owner_profile_id: string  // Required
  tier: string              // Required, currently only 'featured_week'
}
```

### **Webhook Event Handling**

- **Event**: `payment_intent.succeeded`
- **Extract from**: `event.data.object.metadata` (PaymentIntent object)
- **Logic**: Same as current `checkout.session.completed` handler, but read from PaymentIntent

---

## Migration Notes

1. **Backward Compatibility**: Old checkout sessions may still complete via webhook. Keep `checkout.session.completed` handler temporarily or migrate existing sessions.

2. **Error Handling**: PaymentIntent can fail before confirmation. Handle `payment_intent.payment_failed` webhook event.

3. **Client Secret Security**: ClientSecret is safe to expose to client (it's designed for client-side use).

4. **Success Detection**: Client should poll payment status or wait for webhook, then redirect. Don't trust client-side success alone.

5. **Feature Flags**: Keep `PAYMENTS_ENABLED` and `PROMOTIONS_ENABLED` checks in all routes.
