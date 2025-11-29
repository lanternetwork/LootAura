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
- `favorite_sale_starting_soon`: (Planned) Reminder for favorited sales
- `weekly_sales_digest`: (Planned) Weekly digest of nearby sales
- `seller_weekly_analytics`: (Planned) Weekly analytics report for sellers
- `admin_alert`: (Planned) Admin notifications

## Configuration

### Environment Variables

Required environment variables (see `env.example`):

- **`RESEND_API_KEY`** (SERVER-ONLY): Resend API key from your Resend dashboard
- **`RESEND_FROM_EMAIL`**: Verified sender email address (e.g., `no-reply@lootaura.com`)
- **`LOOTAURA_ENABLE_EMAILS`**: Enable/disable email sending
  - `true`: Enable email sending (production/preview)
  - `false` or unset: Disable email sending (development, safe for local testing)

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

## Testing

### Admin Test Endpoint

A test endpoint is available for safely testing email sending in non-production environments:

**Endpoint:** `POST /api/admin/test-email`

**Access:** 
- Admin users (via `ADMIN_EMAILS` env var)
- Non-production environments (`NODE_ENV !== 'production'`)

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
- **Admin-only testing**: Test endpoint requires admin access in production
- **Email validation**: Recipient emails are validated before sending

## Future Enhancements

Planned email templates (not yet implemented):

1. **Favorite Sale Starting Soon**: Reminder email for favorited sales starting within 24 hours
2. **Weekly Sales Digest**: Weekly summary of nearby sales
3. **Seller Weekly Analytics**: Weekly analytics report for active sellers
4. **Admin Alerts**: System alerts for admins (errors, abuse reports, etc.)

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

## Related Documentation

- [Resend Documentation](https://resend.com/docs)
- [React Email Documentation](https://react.email/docs)
- [Database RLS Audit](./db_rls_audit.md) - For user data access patterns

