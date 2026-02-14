# Stripe Payments Current State Audit

**Date:** 2025-01-31  
**Branch:** `feat/moderation-system`  
**Audit Type:** Read-Only (No Code Changes)

---

## Executive Summary

**Status:** ✅ **Clean Slate - No Existing Implementation**

LootAura currently has **zero Stripe/payments implementation**. There is no existing code, database schema, environment configuration, or documentation related to payment processing. This audit confirms that any payments integration would be a **greenfield implementation** with no risk of conflicting designs or double-dipping.

**Recommendation:** **Start fresh with a new implementation plan** - there is nothing to continue or revert.

---

## 1. File Inventory

### API Routes
**Result:** ❌ **None Found**

- No payment-related API routes in `app/api/`
- No checkout session creation endpoints
- No webhook handlers for Stripe events
- No subscription management endpoints

**Searched paths:**
- `app/api/**/*stripe*`
- `app/api/**/*payment*`
- `app/api/**/*checkout*`
- `app/api/**/*webhook*`

### Library Helpers / Clients
**Result:** ❌ **None Found**

- No `lib/stripe*` files
- No `lib/payments*` files
- No Stripe client initialization code
- No payment utility functions

**Searched paths:**
- `lib/stripe*`
- `lib/payments*`
- `lib/**/*stripe*`
- `lib/**/*payment*`

### Database Migrations
**Result:** ❌ **None Found**

- No payment-related tables (payments, orders, subscriptions, checkout_sessions, stripe_customers, stripe_accounts)
- No payment-related columns on existing tables (profiles, sales)
- No payment-related functions or triggers

**Note:** Migration `060_create_seller_settings.sql` contains a comment stating the table is "payments-agnostic", confirming intentional exclusion of payment fields.

**Searched patterns:**
- `stripe_customer_id`, `stripe_account_id`, `payment_status`, `payout_status`
- Tables: `payments`, `orders`, `subscriptions`, `checkout_sessions`, `stripe_*`

### UI Components
**Result:** ❌ **None Found**

- No pricing pages (`app/**/pricing*`, `app/**/upgrade*`)
- No checkout components (`components/**/checkout*`, `components/**/payment*`)
- No subscription management UI
- No payment form components

**False Positives:**
- "pricing" references are about sale pricing modes (`negotiable`, `firm`, `best_offer`, `ask`) - not payment processing
- "subscribe" references are about push notification subscriptions - not payment subscriptions

**Searched paths:**
- `app/**/*pricing*`
- `app/**/*upgrade*`
- `app/**/*pay*`
- `components/**/*pricing*`
- `components/**/*checkout*`

### Tests
**Result:** ❌ **None Found**

- No payment-related unit tests
- No payment-related integration tests
- No Stripe API mocking (MSW handlers)
- No webhook simulation tests

**Searched patterns:**
- `tests/**/*stripe*`
- `tests/**/*payment*`
- `tests/**/*checkout*`

### Documentation
**Result:** ❌ **None Found**

- No payment integration documentation
- No Stripe setup guides
- No monetization strategy documents
- `plan.md` contains no payment-related roadmap items
- `README.md` contains no payment feature mentions

---

## 2. Database Footprint Summary

### Existing Tables (Payment-Relevant)

**`lootaura_v2.profiles`**
- No payment-related columns
- No `stripe_customer_id`
- No `stripe_account_id`
- No payment preferences

**`lootaura_v2.sales`**
- No payment-related columns
- No `payment_required`
- No `promoted_status`
- No `listing_fee_paid`

**`lootaura_v2.seller_settings`**
- Comment: "payments-agnostic"
- Contains only: `email_opt_in`, `default_radius_km`
- Intentionally excludes payment fields

### Missing Tables (Would Be Required)

If implementing payments, the following tables would need to be created:

1. **`lootaura_v2.stripe_customers`** (or column on profiles)
   - Links users to Stripe Customer IDs
   - Required for: subscriptions, one-time payments

2. **`lootaura_v2.stripe_accounts`** (if using Connect)
   - Links sellers to Stripe Connect accounts
   - Required for: seller payouts, marketplace model

3. **`lootaura_v2.payments`** (or `checkout_sessions`)
   - Tracks payment attempts, status, amounts
   - Required for: payment history, refunds, disputes

4. **`lootaura_v2.subscriptions`** (if implementing subscriptions)
   - Tracks user subscription status, plan, billing cycle
   - Required for: premium features, recurring revenue

5. **`lootaura_v2.payouts`** (if using Connect)
   - Tracks seller payouts, transfer status
   - Required for: marketplace payouts, seller earnings

### RLS Policies

**Current State:** No payment-related RLS policies exist.

**Would Need:**
- Policies for `stripe_customers` (users read own, admins read all)
- Policies for `stripe_accounts` (sellers read own, admins read all)
- Policies for `payments` (users read own, admins read all)
- Policies for `subscriptions` (users read own, admins read all)
- Policies for `payouts` (sellers read own, admins read all)

---

## 3. Environment Variables Summary

### Current State
**Result:** ❌ **No Stripe Environment Variables**

The `env.example` file contains **zero Stripe-related environment variables**.

**Existing env vars (for reference):**
- Supabase configuration (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`)
- Cloudinary (`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`)
- Mapbox (`NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`)
- VAPID keys (push notifications)
- Resend (email)
- Sentry (monitoring)
- Upstash Redis (rate limiting)

### Would Need (For Stripe Implementation)

**Required:**
- `STRIPE_SECRET_KEY` - Server-side Stripe API key (never expose to client)
- `STRIPE_PUBLISHABLE_KEY` - Client-side Stripe publishable key (safe to expose)
- `STRIPE_WEBHOOK_SECRET` - Webhook signature verification secret

**Optional (Connect):**
- `STRIPE_CONNECT_CLIENT_ID` - OAuth client ID for Connect onboarding
- `STRIPE_CONNECT_WEBHOOK_SECRET` - Separate webhook secret for Connect events

**Optional (Testing):**
- `STRIPE_TEST_MODE` - Boolean flag to enable test mode
- `STRIPE_TEST_SECRET_KEY` - Test API key
- `STRIPE_TEST_PUBLISHABLE_KEY` - Test publishable key

### Security Considerations

**Current State:** ✅ **No Secrets Exposure Risk**
- No Stripe keys exist in codebase
- No accidental logging of payment secrets
- No client-side exposure of server keys

**Would Need:**
- Ensure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are server-only
- Never log full Stripe keys (mask in logs)
- Use environment variable validation (e.g., `lib/env.ts`)

---

## 4. Implied Architecture

### Current State
**Result:** ❓ **No Architecture to Infer**

Since no payment code exists, there is no implied architecture. However, based on the application structure, we can infer potential integration points:

### Potential Integration Points

**1. Sale Creation Flow (`app/sell/new/SellWizardClient.tsx`)**
- Could add payment step before publishing
- Could require payment for "featured" listings
- Could require payment for premium features (multiple images, extended duration)

**2. User Profile (`app/(account)/profile/`)**
- Could add subscription management UI
- Could add payment method management
- Could add billing history

**3. Admin Tools (`app/admin/tools/`)**
- Could add payment analytics
- Could add refund/dispute management
- Could add payout management (if Connect)

### Potential Monetization Models

**Based on application structure, potential models:**

1. **Listing Fees (One-Time Payments)**
   - Charge sellers to list sales
   - Charge for "featured" listings (promoted on map)
   - Charge for extended listing duration

2. **Subscription Model**
   - Premium tier for sellers (unlimited listings, analytics)
   - Premium tier for buyers (advanced filters, saved searches)

3. **Marketplace Model (Stripe Connect)**
   - Take commission on transactions between buyers/sellers
   - Handle payouts to sellers
   - Platform fee on each sale

4. **Hybrid Model**
   - Free basic listings
   - Paid premium features (featured, analytics, extended duration)
   - Optional transaction fees (Connect)

### Architecture Decisions Needed

**Before implementing, decide:**

1. **Stripe Connect vs. Non-Connect**
   - Connect: Required for marketplace model (seller payouts)
   - Non-Connect: Simpler, but no seller payouts (platform-only revenue)

2. **One-Time vs. Recurring**
   - One-time: Listing fees, featured listings
   - Recurring: Subscriptions for premium features

3. **Payment Timing**
   - Pre-payment: Require payment before listing goes live
   - Post-payment: Charge after listing ends (if transaction-based)

4. **Platform Fee Model**
   - Fixed fee per listing
   - Percentage of transaction value
   - Tiered pricing (free, basic, premium)

---

## 5. Webhook & Security Posture Audit

### Current State
**Result:** ❌ **No Webhook Routes Exist**

- No webhook endpoints in `app/api/`
- No webhook signature verification code
- No event idempotency handling
- No webhook event processing logic

### Would Need (For Production)

**1. Webhook Endpoint (`app/api/webhooks/stripe/route.ts`)**
- Accept POST requests from Stripe
- Verify webhook signature using `STRIPE_WEBHOOK_SECRET`
- Parse raw request body (Next.js `request.body` must be raw, not parsed)
- Handle idempotency (store processed event IDs)

**2. Security Requirements**
- ✅ **Signature Verification:** Use `stripe.webhooks.constructEvent()` with raw body
- ✅ **Idempotency:** Store `event.id` in database, skip if already processed
- ✅ **Raw Body:** Configure Next.js to provide raw body for webhook routes
- ✅ **Rate Limiting:** Apply rate limiting to webhook endpoint (prevent abuse)
- ✅ **CSRF Exemption:** Add webhook route to CSRF exemption list (`lib/api/csrfRoutes.ts`)

**3. Event Handling**

**Critical Events to Handle:**
- `checkout.session.completed` - Payment succeeded, activate feature
- `payment_intent.succeeded` - Payment confirmed
- `payment_intent.payment_failed` - Payment failed, notify user
- `customer.subscription.created` - Subscription activated
- `customer.subscription.updated` - Subscription changed
- `customer.subscription.deleted` - Subscription cancelled
- `account.updated` (Connect) - Seller account status changed
- `transfer.created` (Connect) - Payout initiated

**4. Idempotency Pattern**

Would need to create a table or use existing table to track processed events:

```sql
CREATE TABLE lootaura_v2.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,  -- Stripe event.id
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
```

**5. Error Handling**

- Log all webhook events (for debugging)
- Retry failed webhook processing (Stripe retries automatically)
- Alert on repeated failures (Sentry integration)
- Never expose Stripe secrets in error responses

---

## 6. Authorization & RLS Requirements Mapping

### Current State
**Result:** ✅ **No Payment Authorization Needed (Nothing Exists)**

### Would Need (For Implementation)

**1. Creating Checkout Session**
- **Route:** `POST /api/checkout/create`
- **Authorization:** `authenticated` (users only)
- **RLS:** N/A (no database write, just Stripe API call)
- **Validation:** Verify user owns the resource (sale, subscription plan)

**2. Creating/Updating Stripe Customer**
- **Route:** `POST /api/stripe/customer` (or automatic on first payment)
- **Authorization:** `authenticated` (users only)
- **RLS:** Users can read/update own `stripe_customers` row
- **Policy:** `USING (user_id = auth.uid())`

**3. Creating/Connecting Stripe Account (Connect)**
- **Route:** `POST /api/stripe/connect/onboard`
- **Authorization:** `authenticated` (sellers only)
- **RLS:** Users can read/update own `stripe_accounts` row
- **Policy:** `USING (user_id = auth.uid())`

**4. Handling Webhook Events**
- **Route:** `POST /api/webhooks/stripe`
- **Authorization:** `service_role` (Stripe webhook signature only)
- **RLS:** Webhook handler uses `service_role` client (bypasses RLS)
- **Validation:** Webhook signature verification (not RLS)

**5. Seller Payout Eligibility Checks**
- **Route:** `GET /api/seller/payouts`
- **Authorization:** `authenticated` (sellers only)
- **RLS:** Users can read own `payouts` rows
- **Policy:** `USING (seller_id = auth.uid())`

**6. Admin Payment Management**
- **Route:** `GET /api/admin/payments`
- **Authorization:** `admin` (admin role only)
- **RLS:** Admins can read all payment tables
- **Policy:** `USING (is_admin())` (would need admin check function)

### RLS Policy Examples (Would Need)

```sql
-- stripe_customers table
CREATE POLICY "users_read_own_customer"
  ON lootaura_v2.stripe_customers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_customer"
  ON lootaura_v2.stripe_customers FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- payments table
CREATE POLICY "users_read_own_payments"
  ON lootaura_v2.payments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- subscriptions table
CREATE POLICY "users_read_own_subscriptions"
  ON lootaura_v2.subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
```

---

## 7. Tests & CI Audit for Payments

### Current State
**Result:** ❌ **No Payment Tests Exist**

- No unit tests for payment logic
- No integration tests for checkout flows
- No webhook simulation tests
- No MSW mocks for Stripe API

### Would Need (For Production)

**1. Unit Tests**
- Stripe client initialization
- Payment amount calculations
- Fee calculations (if platform fees)
- Subscription plan validation

**2. Integration Tests**
- Checkout session creation
- Payment success flow
- Payment failure flow
- Subscription creation/update/cancellation
- Webhook event processing

**3. MSW Mocks**
- Mock Stripe API responses
- Mock webhook events
- Mock checkout session creation
- Mock payment intent creation

**4. CI Considerations**
- ✅ **No Real Stripe Calls:** All tests must use mocks
- ✅ **Test Mode Keys:** Use `STRIPE_TEST_*` keys in CI
- ✅ **Webhook Simulation:** Use MSW to simulate webhook events
- ✅ **Idempotency Tests:** Verify event deduplication works

**5. Test Coverage Requirements**

**Critical Paths:**
- ✅ Checkout session creation (happy path + error cases)
- ✅ Webhook signature verification (valid + invalid signatures)
- ✅ Webhook idempotency (duplicate events)
- ✅ Payment status updates (success, failure, refund)
- ✅ Subscription lifecycle (create, update, cancel)

---

## 8. Gaps to Production Readiness

### P0 (Critical - Must Have)

1. **Stripe SDK Integration**
   - Install `stripe` npm package
   - Initialize Stripe client with environment variables
   - Create server-side Stripe client wrapper (`lib/stripe/client.ts`)

2. **Database Schema**
   - Create payment-related tables (customers, payments, subscriptions)
   - Add RLS policies for all payment tables
   - Create indexes for payment queries

3. **Webhook Endpoint**
   - Create webhook route with signature verification
   - Implement idempotency handling
   - Handle critical events (payment success, failure, subscription changes)

4. **Checkout Flow**
   - Create checkout session creation endpoint
   - Create success/cancel redirect pages
   - Handle payment confirmation

5. **Environment Configuration**
   - Add Stripe environment variables to `env.example`
   - Document required keys in `docs/PRODUCTION_ENV.md`
   - Validate environment variables at startup

### P1 (Important - Should Have)

6. **Payment UI Components**
   - Checkout button component
   - Payment method management UI
   - Billing history page
   - Subscription management UI

7. **Authorization & Security**
   - RLS policies for all payment tables
   - Admin-only payment management endpoints
   - Rate limiting on payment endpoints
   - CSRF protection (exempt webhooks)

8. **Error Handling & Logging**
   - Structured logging for payment events
   - Sentry integration for payment errors
   - User-friendly error messages
   - Retry logic for failed webhook processing

9. **Testing**
   - Unit tests for payment logic
   - Integration tests for checkout flows
   - Webhook simulation tests
   - MSW mocks for Stripe API

### P2 (Nice to Have - Future Enhancements)

10. **Analytics & Reporting**
    - Payment analytics dashboard (admin)
    - Revenue reporting
    - Subscription metrics

11. **Advanced Features**
    - Stripe Connect (if marketplace model)
    - Subscription upgrades/downgrades
    - Prorated billing
    - Coupon/promotion codes

12. **Documentation**
    - Payment integration guide
    - Webhook setup instructions
    - Testing guide for payments
    - Troubleshooting guide

---

## 9. Recommendation

### Decision: **Start Fresh with New Implementation Plan**

**Rationale:**
1. ✅ **Zero Existing Code:** No risk of conflicting designs or double-dipping
2. ✅ **Clean Slate:** Can design optimal architecture without legacy constraints
3. ✅ **No Technical Debt:** No existing payment code to maintain or refactor
4. ✅ **Clear Requirements:** Can define requirements based on business needs, not existing code

### Next Steps

1. **Define Monetization Strategy**
   - Decide on payment model (listing fees, subscriptions, marketplace, hybrid)
   - Determine pricing tiers and fee structures
   - Identify which features require payment

2. **Design Architecture**
   - Choose Stripe Connect vs. non-Connect
   - Design database schema for payment tables
   - Design API routes for payment flows
   - Design webhook event handling

3. **Create Implementation Plan**
   - Break down into phases (MVP → Full Feature Set)
   - Define success criteria for each phase
   - Estimate effort for each component

4. **Set Up Development Environment**
   - Create Stripe test account
   - Add Stripe environment variables
   - Install Stripe SDK
   - Set up webhook testing (Stripe CLI)

5. **Implement MVP**
   - Start with simplest payment flow (e.g., one-time listing fee)
   - Add webhook handling
   - Add basic UI
   - Add tests

### Implementation Phases (Suggested)

**Phase 1: Foundation (P0)**
- Stripe SDK integration
- Database schema
- Webhook endpoint
- Basic checkout flow

**Phase 2: Core Features (P0)**
- Payment success/failure handling
- User payment history
- Admin payment management

**Phase 3: Enhanced Features (P1)**
- Payment UI components
- Error handling improvements
- Comprehensive testing

**Phase 4: Advanced Features (P2)**
- Subscriptions (if needed)
- Stripe Connect (if marketplace model)
- Analytics and reporting

---

## Appendix: Search Methodology

### Files Searched
- `app/api/**` - All API routes
- `lib/**` - All library files
- `components/**` - All UI components
- `supabase/migrations/**` - All database migrations
- `tests/**` - All test files
- `docs/**` - All documentation files

### Patterns Searched
- `stripe`, `Stripe`, `STRIPE`
- `payment`, `checkout`, `payout`, `subscription`
- `STRIPE_*`, `NEXT_PUBLIC_STRIPE_*`, `WEBHOOK_*`
- `stripe_customer`, `stripe_account`, `payment_status`

### Tools Used
- `grep` - Pattern matching across codebase
- `glob_file_search` - File name pattern matching
- `codebase_search` - Semantic code search
- `read_file` - Direct file inspection

---

**Audit Completed:** 2025-01-31  
**Branch:** `feat/moderation-system`  
**Status:** ✅ Complete - No Existing Implementation Found

