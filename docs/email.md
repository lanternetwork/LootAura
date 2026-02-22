# Email Infrastructure Documentation

## Overview

LootAura uses **Resend** as the transactional email provider for sending automated emails to users. The email system is designed to be extensible, type-safe, and production-ready.

## Architecture

### Core Components

- **`lib/email/client.ts`**: Resend client singleton factory
- **`lib/email/types.ts`**: TypeScript types for email types and options
- **`lib/email/sendEmail.ts`**: Generic email sending helper with error handling
- **`lib/email/templates/`**: React Email template components
- **`lib/email/sales.ts`**: Sale-related email sending functions (e.g., `sendSaleCreatedEmail`)
- **`lib/email/trigger/`**: Legacy trigger functions (deprecated in favor of `lib/email/sales.ts`)

### Email Templates

Templates are built using `@react-email/components` for email-safe HTML rendering:

- **`BaseLayout.tsx`**: Base layout wrapper with header, footer, and branding
- **`SaleCreatedConfirmationEmail.tsx`**: Confirmation email sent when a sale is published

### Email Types

Currently supported email types (defined in `lib/email/types.ts`):

- `sale_created_confirmation`: Sent when a user publishes a sale
- `favorite_sale_starting_soon`: Reminder for favorited sales starting soon
- `weekly_sales_digest`: (Planned) Weekly digest of nearby sales
- `seller_weekly_analytics`: Weekly analytics report for sellers
- `admin_alert`: (Planned) Admin notifications

## Configuration

### Environment Variables

Required environment variables (see `env.example`):

- **`RESEND_API_KEY`** (SERVER-ONLY): Resend API key from your Resend dashboard
- **`RESEND_FROM_EMAIL`**: Verified sender email address (e.g., `no-reply@lootaura.com`)
- **`LOOTAURA_ENABLE_EMAILS`**: Enable/disable email sending
  - `true`: Enable email sending (production/preview)
  - `false` or unset: Disable email sending (development, safe for local testing)
- **`CRON_SECRET`** (SERVER-ONLY): Shared secret for authenticating cron endpoint requests
  - Must be set in production for cron jobs to work
  - Should be a strong, random secret (e.g., generate with `openssl rand -hex 32`)
  - Used in `x-cron-secret` header for cron endpoint authentication

Optional email feature flags (see `lib/config/email.ts`):

- **`EMAIL_FAVORITE_SALE_STARTING_SOON_ENABLED`**: Enable/disable favorite sale starting soon emails (default: `true`)
- **`EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START`**: Hours before sale start to send reminder (default: `24`)
- **`EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED`**: Enable/disable seller weekly analytics emails (default: `true`)

### Domain Verification

The `RESEND_FROM_EMAIL` domain must be verified in your Resend account before emails can be sent. See [Resend documentation](https://resend.com/docs) for domain verification steps.

## Usage

### Sending an Email

Use the `sendEmail` helper from `lib/email/sendEmail.ts`:

```typescript
import { sendEmail } from '@/lib/email/sendEmail'
import { MyEmailTemplate } from '@/lib/email/templates/MyEmailTemplate'

await sendEmail({
  to: 'user@example.com',
  subject: 'Email Subject',
  type: 'sale_created_confirmation',
  react: <MyEmailTemplate {...props} />,
  metadata: { /* optional metadata for logging */ },
})
```

### Triggering Sale Created Email

Use the `sendSaleCreatedEmail` function from `lib/email/sales.ts`:

```typescript
import { sendSaleCreatedEmail } from '@/lib/email/sales'
import type { Sale } from '@/lib/types'

// Fire-and-forget (non-blocking)
const sale: Sale = {
  // ... sale data with status: 'published'
}

void sendSaleCreatedEmail({
  sale,
  owner: {
    email: 'user@example.com',
    displayName: 'John Doe', // optional
  },
  timezone: 'America/New_York', // optional, defaults to 'America/New_York'
}).catch((error) => {
  // Additional error handling (function already logs internally)
  console.error('Email send failed:', error)
})
```

**Note:** The function returns a `Promise<SendSaleCreatedEmailResult>` with `{ ok: boolean, error?: string }`. It never throws errors - all errors are logged internally and returned in the result object.

## Current Email Flows

### Sale Created Confirmation

**Triggered when:** A user successfully publishes a sale via `/api/drafts/publish`

**Location:** `app/api/drafts/publish/route.ts` (after sale creation, before response)

**Implementation:** `lib/email/sales.ts` → `sendSaleCreatedEmail()`

**Template:** `lib/email/templates/SaleCreatedConfirmationEmail.tsx`

**Email Content:**
- **Subject:** "Your yard sale is live on LootAura 🚀"
- **Preview Text:** Includes sale title, date range, and address
- **Body Sections:**
  1. Header with LootAura branding
  2. Personalized greeting (uses display name if available)
  3. Sale details block:
     - Sale title
     - Address (formatted as "Address, City, State")
     - Date range (formatted as "Sat, Dec 6, 2025 · 8:00 AM – 2:00 PM" or "Sat, Dec 6 – Sun, Dec 7, 2025" for multi-day)
     - Time window (if available, e.g., "9:00 AM – 2:00 PM" or "All day")
  4. Primary CTA button: "View Your Sale on LootAura" → links to public sale page
  5. Secondary links: "Edit your sale" and "View seller dashboard" → both link to `/dashboard`
  6. Footer with transactional notice

**Data sources:**
- User email: From authenticated user session (`user.email`)
- Display name: From user profile via `getUserProfile()` (optional)
- Sale data: Full sale object fetched from database after creation
- Sale URL: Built from `NEXT_PUBLIC_SITE_URL` + `/sales/{saleId}`
- Manage URL: Built from `NEXT_PUBLIC_SITE_URL` + `/dashboard`
- Timezone: Detected from `Intl.DateTimeFormat().resolvedOptions().timeZone` or defaults to `America/New_York`

**Date Formatting:**
- Single day with time: "Sat, Dec 6, 2025 · 8:00 AM – 2:00 PM"
- Multi-day: "Sat, Dec 6 – Sun, Dec 7, 2025"
- Time window shown separately if available: "9:00 AM – 2:00 PM" or "All day"

**Guards:**
- Only sends for sales with `status === 'published'`
- Validates owner email is present and non-empty
- Skips sending if email validation fails (returns `{ ok: false, error: '...' }`)

**Error handling:** Non-blocking; failures are logged but do not affect sale creation. The function returns `{ ok: boolean, error?: string }` and never throws.

### Favorite Sale Starting Soon

**Triggered when:** A scheduled job runs (typically daily via cron) and finds favorited sales starting within the configured time window

**Location:** `lib/jobs/processor.ts` → `processFavoriteSalesStartingSoonJob()`

**Implementation:** `lib/email/favorites.ts` → `sendFavoriteSalesStartingSoonDigestEmail()`

**Template:** `lib/email/templates/FavoriteSalesStartingSoonDigestEmail.tsx`

**Email Behavior:**
- **Digest format:** Sends **one digest email per user** containing all their favorited sales that are starting soon, consolidating multiple sales into a single email to reduce inbox spam
- **Subject line:**
  - Single sale: "A sale you saved is starting soon: [Sale Title]"
  - Multiple sales: "Several saved sales are starting soon near you"
- **Preview Text:** Includes sale count or single sale title and date range

**Email Content:**
- **Body Sections:**
  1. Header with LootAura branding
  2. Personalized greeting (uses display name if available)
  3. Brief intro explaining the time window (e.g., "You have 3 favorite yard sales starting within the next 24 hours")
  4. **List of sales** (one card per sale):
     - Sale title (emphasized)
     - Address (formatted as "Address, City, State")
     - Date range (formatted consistently with Sale Created email)
     - Time window (if available)
     - CTA button: "View Sale" → links to public sale page
  5. Footer with transactional notice and link to manage favorites

**Configuration:**
- `EMAIL_FAVORITE_SALE_STARTING_SOON_ENABLED`: Enable/disable feature (default: `true`)
- `EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START`: Hours before sale start to send reminder (default: `24`)

**Data sources:**
- User email: From `auth.users` via Admin API
- Display name: From user profile via `getUserProfile()` (optional)
- Sale data: From `lootaura_v2.sales` joined with `lootaura_v2.favorites`
- Sale URLs: Built from `NEXT_PUBLIC_SITE_URL` + `/sales/{saleId}`

**Job Processing:**
1. Queries all favorites where `start_soon_notified_at IS NULL` (idempotency)
2. Filters to sales starting within the configured time window
3. **Groups favorites by `user_id`**
4. For each user, sends **one digest email** containing all their qualifying sales
5. On successful send, marks **all** included favorites for that user as notified

**Guards:**
- Only sends for sales with `status === 'published'`
- Only sends for favorites where `start_soon_notified_at IS NULL` (idempotency)
- Only sends for sales starting within the configured time window
- Validates recipient email is present and non-empty
- Respects `EMAIL_FAVORITE_SALE_STARTING_SOON_ENABLED` flag
- Filters out unpublished sales from digest (continues with published ones)

**Idempotency:** Uses `start_soon_notified_at` timestamp in `lootaura_v2.favorites` table. When a digest email is successfully sent, **all** favorites included in that digest are marked as notified, ensuring users don't receive duplicate emails for the same sales on subsequent job runs.

**Error handling:** Non-blocking; failures are logged but do not affect job execution. If a user's digest email fails to send, only that user's favorites remain un-notified; other users' digests continue to be processed. The function returns `{ ok: boolean, error?: string }` and never throws.

**Schedule:** Configured to run daily at 09:00 UTC via Vercel Cron (see `vercel.json`). Can be triggered manually via scripts or cron endpoints.

### Seller Weekly Analytics

**Triggered when:** A scheduled job runs (typically weekly on Mondays via cron) to send analytics reports to sellers

**Location:** `lib/jobs/processor.ts` → `processSellerWeeklyAnalyticsJob()`

**Implementation:** `lib/email/sellerAnalytics.ts` → `sendSellerWeeklyAnalyticsEmail()`

**Template:** `lib/email/templates/SellerWeeklyAnalyticsEmail.tsx`

**Email Content:**
- **Subject:** "Your LootAura weekly summary - [Week Start Date]"
- **Preview Text:** Includes total views and saves
- **Body Sections:**
  1. Header with LootAura branding
  2. Personalized greeting (uses display name if available)
  3. Date range: "Here's how your sales performed from [start] to [end]:"
  4. Main metrics row:
     - Total Views (formatted with commas)
     - Total Saves (formatted with commas)
     - Total Clicks (formatted with commas)
     - CTR (Click-Through Rate) as percentage
  5. Top Performing Sales section:
     - Up to 5 top sales with:
       - Sale title
       - Views, saves, clicks, and CTR
  6. Primary CTA button: "View Detailed Stats" → links to seller dashboard
  7. Footer with encouragement message

**Configuration:**
- `EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED`: Enable/disable feature (default: `true`)

**Data sources:**
- User email: From `auth.users` via Admin API
- Display name: From user profile via `getUserProfile()` (optional)
- Metrics: Aggregated from `analytics_events_v2` via `getSellerWeeklyAnalytics()`
- Sale titles: From `sales_v2` for top performing sales
- Dashboard URL: Built from `NEXT_PUBLIC_SITE_URL` + `/dashboard`

**Metrics calculation:**
- Aggregates analytics events by `sale_id` and `event_type` for the last full week
- Filters out test events (unless `NEXT_PUBLIC_DEBUG=true`)
- Sorts top sales by views (descending), then saves, then clicks
- Calculates CTR as `(clicks / views) * 100`

**Guards:**
- Only sends to owners with published sales OR analytics events in the week
- Only sends if metrics are non-zero (at least one view, save, or click)
- Validates recipient email is present and non-empty
- Respects `EMAIL_SELLER_WEEKLY_ANALYTICS_ENABLED` flag

**Week calculation:**
- Computes last full 7-day window (Monday 00:00 UTC to next Monday 00:00 UTC)
- If run on Monday at 09:00, reports on the previous week

**Error handling:** Non-blocking; failures are logged but do not affect job execution. The function returns `{ ok: boolean, error?: string }` and never throws.

**Schedule:** Configured to run weekly on Mondays at 09:30 UTC via Vercel Cron (see `vercel.json`). Can be triggered manually via scripts or cron endpoints.

## Testing

### Admin Test Endpoint

A test endpoint is available for safely testing email sending:

**Endpoint:** `POST /api/admin/test-email`

**Access:** 
- Admin users only (via `ADMIN_EMAILS` env var, with optional debug-mode bypass in non-production)

**Request body:**
```json
{
  "to": "test@example.com"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Test email sent successfully",
  "to": "test@example.com"
}
```

**Usage example:**
```bash
curl -X POST https://your-domain.com/api/admin/test-email \
  -H "Content-Type: application/json" \
  -d '{"to": "your-email@example.com"}'
```

### Local Development

In local development, set `LOOTAURA_ENABLE_EMAILS=false` (or leave unset) to prevent accidental email sends. The system will log debug messages instead of sending emails.

## Error Handling

Email sending is designed to be **non-critical** and **non-blocking**:

- Errors are logged but do not throw exceptions
- Failed emails do not affect business logic (e.g., sale creation still succeeds)
- Errors are optionally logged to Sentry if available
- Debug mode logs email attempts for troubleshooting

## Security

- **Server-only**: All email code is server-side only (no client imports)
- **API key protection**: `RESEND_API_KEY` is never exposed to the client
- **Admin-only testing**: Test endpoint always requires admin access (debug-mode bypass is disabled in production)
- **Email validation**: Recipient emails are validated before sending

## Background Jobs

Email jobs are defined in `lib/jobs/processor.ts` and can be triggered via:

1. **Cron API endpoints** (production): HTTP endpoints protected by `CRON_SECRET` header authentication
2. **Manual scripts**: Run scripts directly for local development/testing
3. **Job processor API**: Admin-only endpoint for manual job execution

### Available Email Jobs

#### Favorite Sale Starting Soon

- **Cron endpoint**: `GET /api/cron/favorites-starting-soon` (also accepts POST)
- **Recommended schedule**: Daily at 09:00 UTC
- **Purpose**: Send reminder emails for favorited sales starting within the next N hours
  - Window configured via `EMAIL_FAVORITE_SALE_STARTING_SOON_HOURS_BEFORE_START` (default: 24 hours)
- **Idempotency**: Uses `start_soon_notified_at` timestamp in `lootaura_v2.favorites` table to prevent duplicate notifications
- **Entrypoint**: `processFavoriteSalesStartingSoonJob()`
- **Manual script**: `scripts/run-favorite-sales-starting-soon.ts`

#### Seller Weekly Analytics

- **Cron endpoint**: `GET /api/cron/seller-weekly-analytics` (also accepts POST)
- **Recommended schedule**: Weekly on Mondays at 09:00 UTC
- **Purpose**: Send weekly performance emails to sellers for the last full week (Monday 00:00 UTC to next Monday 00:00 UTC)
- **Optional query parameter**: `?date=2025-01-06` - Compute week for a specific date (useful for backfilling or testing)
- **Idempotency**: Relies on time window calculation (last full week) to prevent duplicates
- **Entrypoint**: `processSellerWeeklyAnalyticsJob()`
- **Manual script**: `scripts/run-seller-weekly-analytics.ts [date]`

### Production Scheduling

#### Authentication

All cron endpoints require Bearer token authentication:

- **Environment variable**: `CRON_SECRET` (server-only, must be set in production)
- **Authorization header**: `Authorization: Bearer ${CRON_SECRET}`
- **Security**: Requests without valid token return `401 Unauthorized`
- **Method**: Both `GET` and `POST` requests are accepted (for flexibility with different schedulers)

#### Email Global Toggle

The cron endpoints respect the global email toggle:

- **Environment variable**: `LOOTAURA_ENABLE_EMAILS`
- **Behavior**: If set to `false`, cron endpoints will:
  - Still authenticate and log correctly
  - Skip sending emails
  - Return success response with `emailsEnabled: false` and `message: "Emails disabled by configuration"`
- **Use case**: Allows disabling emails globally without breaking cron schedules

#### Setting Up Cron Jobs

**Vercel Cron:**

1. Cron jobs are configured in `vercel.json`:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/favorites-starting-soon",
         "schedule": "0 9 * * *"
       },
       {
         "path": "/api/cron/seller-weekly-analytics",
         "schedule": "0 9 * * 1"
       }
     ]
   }
   ```

2. Configure `CRON_SECRET` in Vercel environment variables:
   - Go to your Vercel project settings
   - Add `CRON_SECRET` as an environment variable
   - Use a strong, random secret (e.g., generate with `openssl rand -hex 32`)

3. Vercel Cron will automatically call the endpoints on the configured schedule
   - **Note**: Vercel Cron does not automatically add authentication headers
   - You may need to configure Vercel Cron to include the `x-cron-secret` header, or use a Vercel Cron secret configuration
   - Alternatively, use an external scheduler (see below) that supports custom headers

**Other Schedulers (Supabase Cron, external cron services, GitHub Actions, etc.):**

1. Set `CRON_SECRET` environment variable in your deployment environment

2. Configure your scheduler to:
   - Make **GET** or **POST** requests to the cron endpoints
   - Include header: `Authorization: Bearer ${CRON_SECRET}`

3. Recommended schedules:
   - Favorite Sale Starting Soon: Daily at 09:00 UTC (`0 9 * * *`)
   - Seller Weekly Analytics: Weekly on Mondays at 09:00 UTC (`0 9 * * MON`)

**Example curl command for manual testing:**

```bash
# Test favorite sales starting soon endpoint
curl -X GET https://your-domain.com/api/cron/favorites-starting-soon \
  -H "Authorization: Bearer $CRON_SECRET"

# Test seller weekly analytics endpoint
curl -X GET https://your-domain.com/api/cron/seller-weekly-analytics \
  -H "Authorization: Bearer $CRON_SECRET"

# Test with date parameter
curl -X GET "https://your-domain.com/api/cron/seller-weekly-analytics?date=2025-01-06" \
  -H "Authorization: Bearer $CRON_SECRET"
```

#### Local Development

For local development and testing, use the manual scripts (cron endpoints are production-only):

```bash
# Run favorite sales starting soon job
tsx scripts/run-favorite-sales-starting-soon.ts

# Run seller weekly analytics job
tsx scripts/run-seller-weekly-analytics.ts

# Run seller weekly analytics for a specific date
tsx scripts/run-seller-weekly-analytics.ts 2025-01-06
```

**Note:** 
- Cron jobs run only when configured in your scheduler (Vercel Cron, external service, etc.)
- Locally, you should use the scripts under `scripts/` to debug jobs
- The cron endpoints are production-ready and can be wired to any scheduler that supports HTTP GET/POST requests with Bearer token authentication
- Vercel automatically picks up cron jobs from `vercel.json` after deployment

## Future Enhancements

Planned email templates (not yet implemented):

1. **Weekly Sales Digest**: Weekly summary of nearby sales
2. **Admin Alerts**: System alerts for admins (errors, abuse reports, etc.)

**TODO:** Add proper `email_log` table for hard guarantees on email deduplication and delivery tracking.

## Troubleshooting

### Emails not sending

1. Check `LOOTAURA_ENABLE_EMAILS` is set to `true`
2. Verify `RESEND_API_KEY` is set and valid
3. Verify `RESEND_FROM_EMAIL` domain is verified in Resend
4. Check server logs for error messages
5. Use the admin test endpoint to verify configuration

### Email delivery issues

1. Check Resend dashboard for delivery status
2. Verify recipient email address is valid
3. Check spam/junk folders
4. Review Resend logs for bounce/spam reports

### Template rendering issues

1. Ensure React Email components are used (not regular React components)
2. Use inline styles (email clients don't support external CSS)
3. Test templates in multiple email clients
4. Use the unit tests in `tests/unit/email/` to verify rendering

## Unsubscribe System

LootAura supports one-click unsubscribe for all non-administrative emails (favorites digest and seller weekly analytics). Users can unsubscribe without logging in using a secure, token-based system.

### How It Works

1. **Token Generation**: When sending a non-admin email, a unique, single-use token is generated for each recipient and stored in `lootaura_v2.email_unsubscribe_tokens`.
   - Tokens are 256-bit cryptographically secure random values
   - Each token expires after 30 days
   - Tokens are single-use (marked as `used_at` after successful unsubscribe)

2. **Unsubscribe Link**: Each non-admin email includes a footer with an unsubscribe link:
   ```
   https://lootaura.com/email/unsubscribe?token=<token>
   ```

3. **Unsubscribe Endpoint**: The `/email/unsubscribe` endpoint (GET):
   - Requires no authentication
   - Validates the token (must be valid, not expired, not used, scope = 'all_non_admin')
   - Updates the user's profile to set:
     - `email_favorites_digest_enabled = false`
     - `email_seller_weekly_enabled = false`
   - Marks the token as used
   - Returns an HTML confirmation page

### Security

- **Token Security**:
  - Tokens are 256-bit random values (32 bytes, hex-encoded)
  - Tokens are never logged in server logs
  - Tokens are single-use and expire after 30 days

- **Database Security**:
  - `email_unsubscribe_tokens` table has RLS enabled
  - RLS policy denies all direct access (no anon/auth access)
  - Only service role can access tokens (via `getAdminDb()`)
  - Tokens are deleted when profiles are deleted (CASCADE)

- **Rate Limiting**:
  - Endpoint is rate limited: **5 requests per IP per 15 minutes**
  - Rate limit errors return HTML (not JSON) for better UX
  - Rate limiting can be bypassed in development/preview environments

### Email Types

**Non-Admin Emails** (include unsubscribe link):
- `favorite_sale_starting_soon`: Favorites digest email
- `seller_weekly_analytics`: Seller weekly analytics email

**Admin/Transactional Emails** (do NOT include unsubscribe link):
- `sale_created_confirmation`: Sale creation confirmation
- Any future transactional/account emails

### Implementation Details

**Token Generation** (`lib/email/unsubscribeTokens.ts`):
- `createUnsubscribeToken(profileId)`: Creates a new token and stores it in the database
- `buildUnsubscribeUrl(token, baseUrl)`: Constructs the unsubscribe URL

**Email Integration**:
- `lib/email/favorites.ts`: Generates unsubscribe token and URL for favorites digest
- `lib/email/sellerAnalytics.ts`: Generates unsubscribe token and URL for seller weekly
- Both pass `unsubscribeUrl` to email templates

**Email Templates**:
- `lib/email/templates/BaseLayout.tsx`: Conditionally renders unsubscribe footer
- Footer only appears when `unsubscribeUrl` is provided
- Footer text: "You're receiving this email because you're subscribed to LootAura notifications. To unsubscribe, click here."

**Unsubscribe Endpoint** (`app/email/unsubscribe/route.ts`):
- GET handler with rate limiting
- Validates token and updates user preferences
- Returns HTML confirmation or error pages
- Handles edge cases: expired tokens, already-used tokens, already-unsubscribed users

### User Experience

1. **Unsubscribing**:
   - User clicks unsubscribe link in email
   - Sees confirmation page: "You've been successfully unsubscribed"
   - No login required

2. **Re-subscribing**:
   - Users can re-enable notifications in account settings (`/account/edit`)
   - UI toggles update the same database fields

3. **Already Unsubscribed**:
   - If user clicks unsubscribe link when already unsubscribed, they see a note indicating they were already unsubscribed
   - Preferences remain unchanged (idempotent)

### Database Schema

**`lootaura_v2.email_unsubscribe_tokens`**:
- `id`: UUID primary key
- `profile_id`: References `lootaura_v2.profiles(id)` with CASCADE delete
- `token`: Unique text token (256-bit hex string)
- `scope`: Text (default: 'all_non_admin')
- `created_at`: Timestamp
- `expires_at`: Timestamp (30 days from creation)
- `used_at`: Timestamp (NULL until used)

**Indexes**:
- `idx_email_unsubscribe_tokens_token`: For efficient token lookups (filtered: unused, not expired)
- `idx_email_unsubscribe_tokens_profile_id`: For profile-based lookups

### Environment Variables

Required for unsubscribe system:
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access (server-only)
- `NEXT_PUBLIC_SITE_URL`: Base URL for constructing unsubscribe links

See [Production Environment Variables](./PRODUCTION_ENV.md) for full configuration details.

## Related Documentation

- [Resend Documentation](https://resend.com/docs)
- [React Email Documentation](https://react.email/docs)

