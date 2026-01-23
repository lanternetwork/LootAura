## 1. Executive Summary

**Status: PASS-WITH-GAPS**

- **Milestone 4 (promotions infrastructure)** is present and remains gated by `PAYMENTS_ENABLED` and `PROMOTIONS_ENABLED`, with webhook verification and idempotency intact.
- **Milestone 5A (Promote CTAs)** is **partially implemented**: the batch promo-status endpoint and dashboard Promote CTA are in place and wired to the existing checkout route with correct gating; the Sell Wizard CTA and Sale Detail CTA are **not yet implemented**, and there are **no integration/UI tests** covering the new CTAs or batch endpoint.
- No critical new security or privacy regressions were identified; Stripe-related paths remain gated and webhooks are verified. Performance characteristics for the new batch status flow are acceptable (no dashboard N+1), with conservative caps.

---

## 2. Implemented vs Planned (Checklist)

| Area | Item | Status | Evidence / Notes |
|------|------|--------|------------------|
| **A) Batch promo-status endpoint** | Exists at agreed route (`GET /api/promotions/status?sale_ids=…`) | ✅ | `app/api/promotions/status/route.ts` (`GET` handler) |
| | Auth required | ✅ | Uses `createSupabaseServerClient().auth.getUser()` and returns `401 AUTH_REQUIRED` when unauthenticated (`route.ts` L26–L36). |
| | Ownership enforced per `sale_id` | ✅ | Queries `lootaura_v2.promotions` via `fromBase(adminDb, 'promotions')` and restricts non-admins with `.eq('owner_profile_id', user.id)` (`route.ts` L72–L80). Admins bypass owner filter via `assertAdminOrThrow`. |
| | Input size capped | ✅ | Caps query param length (`MAX_SALE_IDS_PARAM_LENGTH = 4000`) and unique IDs to `MAX_SALE_IDS = 100` (`route.ts` L22–L55). |
| | Minimal response shape (no PII, no metrics) | ✅ | Response is `ok({ statuses })` where each element is `{ sale_id, is_active, ends_at, tier }` computed in-process; no owner IDs, emails, metrics, or recipient data (`route.ts` L96–L107). |
| | Tests exist for auth + ownership + cap | ❌ | No tests under `tests/integration/**` reference `/api/promotions/status`; `grep` finds only UI + route usage. Required: integration tests for auth (401), non-owner exclusion, admin access, and caps (length + count). |
| **B) Dashboard Promote CTA** | Promote button exists next to Edit/Share (seller-owned only) | ✅ | `components/dashboard/DashboardSaleCard.tsx`: actions row includes `View`, `Edit`, **Promote** button for each seller-owned sale (dashboard sales are already scoped to the signed-in seller via `getUserSales` in `app/(dashboard)/dashboard/page.tsx`). |
| | `PROMOTIONS_ENABLED` gating hides CTA | ✅ | `DashboardPage` passes `promotionsEnabled={process.env.PROMOTIONS_ENABLED === 'true'}` into `DashboardClient` → `SalesPanel` → `DashboardSaleCard`. Button is rendered only when `promotionsEnabled` is truthy (`DashboardSaleCard` L281–306). |
| | Active promotion shows “Promoted” + ends date | ✅ | `DashboardSaleCard` computes `isPromotionActive = promotionStatus?.is_active && !!promotionStatus.ends_at` and renders `"Promoted • Ends <formatted date>"` when active (`formatPromotionEndDate`, button label at L298–300). |
| | `PAYMENTS_ENABLED=false` does not call checkout and shows friendly message | ⚠️ | Behavior: if `paymentsEnabled` is false, the button is rendered as disabled with label `"Promotions unavailable"` and `onClick` kept but guarded early in `handlePromote` (checks `promotionsEnabled` and `paymentsEnabled`, L53–61). This **does prevent checkout** but the “friendly message” is purely label text; there is no toast/explicit feedback when clicking because the button is disabled. |
| | Uses batch status (no per-card fetch) | ✅ | `SalesPanel` computes a single `saleIds` string for live sales and calls `/api/promotions/status` **once** per `sales` change (`useEffect` L60–101). Each `DashboardSaleCard` receives `promotionStatus={promotionStatuses[sale.id]}`; no card-level fetch. |
| | Tests exist to ensure no N+1 | ❌ | No dashboard integration/UI tests assert on number of network calls or batch usage. Required: test harness that verifies a single `fetch` to `/api/promotions/status` for multiple cards. |
| **C) Sale detail Promote CTA (seller view)** | Owner-only CTA exists | ❌ | `app/sales/[id]/SaleDetailClient.tsx` currently renders seller analytics, nearby sales, and ads, but **no Promote panel/button** for the owner. No promote-related imports or markup are present. |
| | Same gating and states as dashboard | ❌ | Not implemented. No wiring to `PROMOTIONS_ENABLED` / `PAYMENTS_ENABLED` on sale detail. |
| | Uses minimal status source | ❌ | Not implemented. No usage of `/api/promotions/status` or metrics endpoint for sale detail CTA. |
| | Tests exist (at least gating + owner) | ❌ | No tests reference a sale detail promotion CTA. |
| **D) Sell wizard CTA** | “Feature your sale” toggle in review/publish step (default OFF) | ❌ | `app/sell/new/SellWizardClient.tsx` has no references to “feature”, “promote”, or promotion-related toggles. Review step exists but is purely about sale content. |
| | No DB writes for the toggle | ❌ | Toggle not implemented; behavior currently N/A. |
| | Post-publish “Promote now” button exists when opted-in | ❌ | No post-publish promote flow wired from the wizard; publish logic only creates/publishes sales. |
| | Correct behavior with payments disabled | ❌ | Not implemented; wizard has no payments/promotion awareness. |
| | Uses existing CSRF pattern (no new one) | ✅ (N/A) | Wizard uses existing patterns for publish actions; no new CSRF mechanism was added for promotions (all promo checkout calls use `getCsrfHeaders` in `DashboardSaleCard`). |
| | Tests exist (rendering + payments disabled path) | ❌ | No Sell Wizard tests reference promotion CTAs. |
| **E) Stripe safety posture (regression check)** | `PAYMENTS_ENABLED` still gates all charge/checkout paths | ✅ | `lib/stripe/client.ts` short-circuits `getStripeClient` when `PAYMENTS_ENABLED !== 'true'`; `app/api/promotions/checkout/route.ts` explicitly checks `isPaymentsEnabled()` and returns `403 PAYMENTS_DISABLED` before any Stripe calls (L51–56). |
| | Webhook verification still intact | ✅ | `app/api/webhooks/stripe/route.ts`: uses `getStripeWebhookSecret()`, `stripe.webhooks.constructEvent(body, signature, webhookSecret)` with signature presence check and logs; unchanged in behavior. |
| | No secrets logged | ✅ | Logging in `promotions/checkout` and `webhooks/stripe` includes component/operation, truncated `user_id` (prefix only) and IDs, but **no Stripe secrets** or full emails. |
| | No new public debug endpoints | ✅ | New endpoints are `/api/promotions/checkout`, `/api/promotions/status`, and `/api/sales/[id]/promotion-metrics`; all require auth, owner/admin checks, and rate limits. Existing CI debug-only endpoint `/api/admin/featured-email/dry-run` remains admin/secret-gated per `plan.md`. |

---

## 3. Security / Privacy Findings

- **Auth & Ownership**
  - **Batch status**: `GET /api/promotions/status` requires auth and restricts non-admins to promotions where `owner_profile_id === user.id`; admins use `assertAdminOrThrow` to bypass the owner filter. Non-owned sale IDs passed in are effectively ignored for non-admins.
  - **Promotion metrics**: `GET /api/sales/[id]/promotion-metrics` enforces auth, verifies sale ownership via `fromBase(admin, 'sales').select('owner_id')`, and only allows non-owners if `assertAdminOrThrow` passes.
- **Stripe Webhook Safety**
  - Webhook handler still:
    - Verifies `stripe-signature` and `STRIPE_WEBHOOK_SECRET`.
    - Uses an idempotency table (`stripe_webhook_events`) to prevent reprocessing; duplicate inserts short-circuit as idempotent success.
    - Handles `checkout.session.completed`, `payment_intent.payment_failed` / `checkout.session.expired`, and refund events by updating `promotions` status with guarded `UPDATE` queries.
  - No sensitive Stripe secrets are logged; logs include event IDs, promotion IDs, and sale IDs only.
- **Debug / Admin Surfaces**
  - Synthetic E2E + CI rely on `/api/admin/featured-email/dry-run` and `ENABLE_DEBUG_ENDPOINTS=true` in CI only, with a dedicated CI secret header. This endpoint continues to return fixture IDs only (no PII), as documented in `plan.md`.
  - No new wide-open debug endpoints were added for promotions.
- **Privacy / Data Minimization**
  - `promotions/status` response exposes only `sale_id`, `is_active`, `ends_at`, and `tier`—no owner identifiers, emails, or recipient-level information.
  - Promotion metrics endpoint exposes seller-facing aggregates and current promotion metadata only for the owner/admin, consistent with prior featured-email inclusion rollup design.

**Conclusion:** No critical new security/privacy regressions observed. The primary risk area is **lack of tests** around new promotion endpoints and CTAs rather than missing gating in the implementation.

---

## 4. Performance / Cost Findings

- **Dashboard N+1 Check**
  - `SalesPanel` performs a **single** fetch to `/api/promotions/status` per (promotionsEnabled, sales IDs) combination, by:
    - Filtering to `sales` where `status === 'published'`.
    - Joining IDs into a single `sale_ids` query param (`liveSales.map(s => s.id).join(',')`).
    - Populating a `promotionStatuses` map keyed by `sale_id`, which is then passed into each `DashboardSaleCard`.
  - There are **no per-card network calls** for promotion status; each card is purely using props.
- **Batch Endpoint Caps / Abuse Protection**
  - `MAX_SALE_IDS = 100` and `MAX_SALE_IDS_PARAM_LENGTH = 4000` both apply. The handler:
    - Deduplicates IDs and slices to 100.
    - Rejects missing or excessively long `sale_ids` with `400 INVALID_REQUEST`.
  - This prevents extremely large `IN (...)` queries and oversized query strings while remaining sufficient for dashboard usage (<< 100 sales per seller view).
- **Stripe Cost Discipline**
  - Promotion checkout still retrieves Stripe price once per checkout and stores the amount in `promotions`, with subsequent lifecycle handled by webhooks.
  - No new long-running or high-frequency jobs were introduced as part of 5A; only a one-shot checkout and status fetch.

**Conclusion:** Dashboard promotion status uses a batched, capped query; there is no N+1 regression. Batch endpoint is appropriately constrained for both string length and ID count.

---

## 5. CI / Test Findings

- **CI Workflows**
  - `ci.yml` continues to run:
    - `lint`, `typecheck`, `test-unit`, `test-integration`, `build`, `test-e2e-smoke`, and `css-scan`.
  - `synthetic-e2e.yml` remains a separate workflow for periodic curl-based health/smoke checks (including featured-email dry-run).
  - Recent build failures were due to Supabase ESM packaging and have been resolved by a focused `next.config.js` webpack rule; no test skipping or weakening observed.
- **Promotion / 5A-Specific Tests**
  - Existing **starter harness** tests:
    - `tests/integration/featured-email/selection.test.ts`
    - `tests/integration/featured-email/inclusion-tracking.test.ts`
    - `tests/integration/featured-email/payments-guard.test.ts` (contract test for payments gating, but uses a local stub handler, not the real `/api/promotions/checkout` route).
  - **Missing** 5A coverage:
    - No tests exercising `app/api/promotions/status/route.ts`.
    - No tests for dashboard promotion CTA behavior (gating, active state label, payments disabled UX).
    - No tests for a sale detail promotion CTA or Sell Wizard promotion CTA (both not yet implemented).
    - No tests validating rate limiting behavior on the real `promotions/checkout` route.
- **Synthetic E2E**
  - Still validates featured-email dry-run behavior, health, share endpoints, and favorites RLS. It does **not** yet include a promotion CTA or checkout smoke path.
- **Flaky Patterns**
  - No new use of `waitForTimeout` or similar brittle timing primitives identified in new commits related to 5A; Playwright smoke tests continue to be tagged and run via a dedicated `smoke` project.

**Conclusion:** CI is green and robust overall, but Milestone 5A functionality lacks direct integration/e2e test coverage. The existing payments-guard harness is still a stub rather than a test of the real promotions checkout endpoint.

---

## 6. Docs Findings

- `plan.md` is **up to date through Milestone 3** and the CI starter harness for featured email + promotions, but:
  - There is **no dedicated Milestone 5A section** describing:
    - The new promotions table as the canonical source (replacing `is_featured`).
    - Batch status endpoint contract and caps.
    - Dashboard / Sell Wizard / Sale Detail CTAs and gating rules.
    - Rollout steps for enabling `PROMOTIONS_ENABLED` and `PAYMENTS_ENABLED` in production.
- `STRIPE_PAYMENTS_AUDIT.md` (touched in this branch) should be reviewed to ensure it reflects that:
  - All new promotion payment flows are still gated by `PAYMENTS_ENABLED` and Stripe configuration.
  - Webhooks and idempotency tables cover the new promotions lifecycle.

**Conclusion:** Docs accurately describe Milestones 2–3 and the CI starter harness, but Milestone 5A specifics (CTAs, batch status, gating, rollout) are missing and should be added.

---

## 7. Actionable TODOs (P0 / P1 / P2)

### P0 (Must-do before calling Milestone 5A complete)

1. **Implement missing CTAs**
   - **Sell Wizard CTA**: Add a “Feature your sale” toggle on the review step (default OFF) with **no DB writes** on toggle, and a post-publish “Promote now” button wired to `/api/promotions/checkout` with `getCsrfHeaders` and the same gating/error UX as the dashboard.
   - **Sale Detail CTA**: Add an owner-only promote panel/button on `SaleDetailClient` near existing seller controls, using the batch/minimal status source and matching dashboard gating and states.
2. **Add promotion endpoint + CTA tests**
   - Integration tests for `GET /api/promotions/status` (auth required, owner-only vs admin, caps, and minimal response).
   - Integration/UI tests for dashboard Promote CTA:
     - Hidden when `PROMOTIONS_ENABLED !== 'true'`.
     - Disabled/“Promotions unavailable” when `PAYMENTS_ENABLED=false` and does **not** call checkout.
     - Shows “Promoted • Ends <date>” when status is active.
     - Confirms a **single** batched call for multiple cards (no per-card fetch).
   - Update or add tests so that `payments-guard` logic validates the **real** `/api/promotions/checkout` route (or a thin wrapper) rather than only a stub function.

### P1 (Strongly recommended before broad rollout)

1. **Docs update**
   - Add a **Milestone 5A** section to `plan.md` covering:
     - CTA locations (Dashboard, Sell Wizard, Sale Detail) and exact gating behavior.
     - Batch status endpoint contract and caps.
     - Stripe gating/rollout steps (`PROMOTIONS_ENABLED`, `PAYMENTS_ENABLED`, Stripe secrets).
2. **Enhanced e2e/smoke coverage**
   - Extend Playwright smoke suite or synthetic-e2e curl tests to cover:
     - Promotion CTA visibility toggling based on env flags.
     - A “happy path” promotion checkout in non-production with Stripe test keys (if feasible), or at least a mocked-path confirmation.

### P2 (Nice-to-have / follow-up hardening)

1. **Additional performance safeguards**
   - Consider per-user rate limiting on `/api/promotions/status` to guard against repeated large requests, even though current caps are reasonable.
2. **Metrics & observability**
   - Add structured logs or metrics for promotion CTA usage (clicks, disabled states due to gating) without introducing PII, to monitor adoption and issues.
3. **Test refactor for payments-guard**
   - Refactor `tests/integration/featured-email/payments-guard.test.ts` to use the actual promotions checkout handler and new promotions table, aligning the CI starter harness with the real implementation.


