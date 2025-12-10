# Moderation System Audit

## Database & RLS
- `lootaura_v2.sale_reports` (107_create_sale_reports.sql): `id uuid pk`, `sale_id uuid` FK cascade, `reporter_profile_id uuid` FK set null, `reason text` (fraud/prohibited_items/spam/harassment/other), `details text`, `status text` (open/in_review/resolved/dismissed, default open), `action_taken text`, `admin_notes text`, `created_at timestamptz default timezone('utc', now()), updated_at timestamptz default timezone('utc', now())`. Indexes: `idx_sale_reports_sale_created` (sale_id, created_at desc), `idx_sale_reports_status_created` (status, created_at desc), `idx_sale_reports_reporter` (reporter_profile_id, created_at desc where reporter_profile_id is not null), `idx_sale_reports_sale_created_recent` (sale_id, created_at desc). RLS: insert allowed to authenticated when reporter_profile_id = auth.uid(); select denied to authenticated (using false); service_role policy FOR ALL using true; table granted to service_role.
- `lootaura_v2.profiles` lock fields (108_add_account_lock_fields.sql): `is_locked boolean default false`, `locked_at timestamptz`, `locked_by text`, `lock_reason text`; partial index `idx_profiles_is_locked` where is_locked = true. Comments note locked users can read but not write.
- `lootaura_v2.sales` moderation fields (109_add_sale_moderation_fields.sql): `moderation_status text` default `visible` with enum visible/hidden_by_admin/under_review, `moderation_notes text`; partial index `idx_sales_moderation_status` where moderation_status != 'visible'; comment notes public queries should exclude hidden_by_admin.
- Views updated: `public.sales_v2` includes `moderation_status` and `moderation_notes` (110_add_moderation_status_to_sales_v2_view.sql). `public.profiles_v2` includes lock fields `is_locked, locked_at, locked_by, lock_reason` (111_add_lock_fields_to_profiles_v2_view.sql).
- No additional moderation tables (no user_bans/moderation_actions) found.

## Sale Visibility & Moderation Status
- Public sales fetching (`app/api/sales/route.ts`, `app/api/sales/markers/route.ts`, `app/api/sales/search/route.ts`, `lib/data/sales.ts`, `lib/data/salesAccess.ts`): attempt to filter out `moderation_status = hidden_by_admin`; if column missing (migration not applied) they retry without the filter.
- `sales_v2` view exposes `moderation_status`; APIs query `sales_v2` primarily and add `.neq('moderation_status','hidden_by_admin')` when available. Markers and search also filter statuses to published/active and non-archived.
- Sale detail: `getSaleWithItems` includes `moderation_status`; `app/sales/[id]/page.tsx` now blocks `hidden_by_admin` sales for non-admins (returns 404/NotFound) while allowing admins to view.

## API Endpoints
- Public report: `POST /api/sales/[id]/report` — auth required, CSRF checked, rate limited (`Policies.REPORT_SALE`), validates reason/details, prevents self-report, dedupes same reporter/reason within 24h, inserts into `sale_reports`, auto-hide sale if >=5 unique reporters in last 24h (sets `moderation_status = hidden_by_admin` with notes). Uses admin client (service role) for writes; logs events.
- Admin reports: `GET /api/admin/reports` — admin-only (`assertAdminOrThrow`), rate limited (`ADMIN_TOOLS`, `ADMIN_HOURLY`), filters by status/reason, returns paginated reports with sale info.
- Admin report update: `PATCH /api/admin/reports/[id]` — admin-only, rate limited, validates status/action/notes plus flags `hide_sale` and `lock_account`; updates report; optional actions hide sale (`moderation_status = hidden_by_admin`) and/or lock owner account (sets lock fields).
- Admin users: `GET /api/admin/users` — admin-only, rate limited, searches profiles table, returns lock fields.
- Admin lock: `POST /api/admin/users/[id]/lock` — admin-only, rate limited, toggles `is_locked`, sets/clears `locked_at`, `locked_by`, `lock_reason`.
- Cron: `GET|POST /api/cron/daily` — protected by `assertCronAuthorized` (CRON_SECRET), runs archive job, favorite emails, and moderation digest email task.
- Other moderation-related: none found for bans; no public endpoint to check lock state beyond implicit enforcement.

## Account Lock Semantics
- Helper `lib/auth/accountLock.ts`: `assertAccountNotLocked(userId)` queries `profiles.is_locked`; on locked throws 403 JSON; logs errors but allows if check fails. `isAccountLocked` utility returns boolean.
- Enforcement now applied broadly to authenticated mutating endpoints: sale create/archive/delete/favorite, drafts save/delete/publish, item CRUD (`items` and `items_v2`), favorites add/remove (both versions), profile avatar/social-links/preferences/profile PUT/POST, notification prefs, seller rating. Report-sale remains allowed for locked users (intentional).
- Locked users per UI: Dashboard shows `AccountLockedBanner` when `profile.is_locked`; banner message allows browsing but not writing. No other surfaces enforce client-side lock beyond this banner.

## Moderation Digest & Cron
- Email sender `lib/email/moderationDigest.ts` calls template `lib/email/templates/ModerationDailyDigestEmail.tsx`; subject built from report count; recipients `MODERATION_DIGEST_EMAIL` env or `lanternetwork@gmail.com`. Records send via `recordEmailSend`.
- Digest data: last 24h reports with sale metadata and admin links; base URL from `NEXT_PUBLIC_SITE_URL` or default `https://lootaura.com`.
- Cron endpoint `app/api/cron/daily/route.ts` task `sendModerationDailyDigest` collects reports and sends email; overall daily cron also archives ended sales and favorite reminders.
- `vercel.json` cron schedule: `/api/cron/daily` at `0 2 * * *` (UTC); moderation digest runs inside this job (no separate cron entry).

## Frontend / Admin UI
- Report sale UI: `components/moderation/ReportSaleModal.tsx` with reason/details, CSRF headers, posts to `/api/sales/[id]/report`; wired into sale detail page `app/sales/[id]/SaleDetailClient.tsx` for logged-in non-owners (modal trigger present in action buttons).
- Admin tools page (`/admin/tools`, `app/admin/tools/AdminToolsPageClient.tsx`): includes “Moderation Tools” section with `AdminUsersPanel` (search, lock/unlock, profile links) and `AdminReportsPanel` (list/filter reports, update status, hide sale, lock account).
- Account lock UX: `AccountLockedBanner` shown on dashboard when `profile.is_locked`; no lock warning on other flows (e.g., sale form) besides server rejection.
- User report UI: “Report User” stub removed from `IdentityCard`; user-reporting is hidden pending a real backend.
- Missing: dedicated UI to view moderation notes/status on a sale; UI to view/undo hidden sales outside admin report action; user-facing indication when a sale is hidden is not present.

## Anti-Abuse & Logging
- Rate limiting: report endpoint uses `Policies.REPORT_SALE`; public sales/list/marker/search endpoints use view/hourly policies; admin endpoints use `ADMIN_TOOLS` + `ADMIN_HOURLY`; cron not rate-limited but token-protected.
- CSRF: applied on sale report POST, item CRUD, sale creation, profile update (per helper usage).
- Logging: endpoints log moderation actions (report submission, dedupe, auto-hide, admin updates) with limited PII (reporter IDs truncated). Auto-hide threshold logged. Digest send/cron logs. No free-text `details` are logged except possible inclusion in admin responses; details stored in DB.

## Gaps & Recommendations
- No RLS select for users on `sale_reports` (by design fire-and-forget); admin relies on service_role. Acceptable but consider a user-facing “report submitted” history if desired.
- Hidden sales still not surfaced with owner-facing messaging; consider owner notification or admin-only badge in UI.
- No admin UI to unhide a sale except via report update checkbox; no bulk view of hidden sales.
- Moderation status not surfaced in public UI; hidden sales simply disappear.
- Ensure migrations 109–111 remain applied; code defensively retries without `moderation_status`, which can mask missing schema if not monitored.

