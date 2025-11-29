# Email Infrastructure Documentation

## Overview

LootAura uses **Resend** as the transactional email provider for sending automated emails to users. The email system is designed to be extensible, type-safe, and production-ready.

## Architecture

### Core Components

- **`lib/email/client.ts`**: Resend client singleton factory
- **`lib/email/types.ts`**: TypeScript types for email types and options
- **`lib/email/sendEmail.ts`**: Generic email sending helper with error handling
- **`lib/email/templates/`**: React Email template components
- **`lib/email/trigger/`**: Trigger functions for specific email types

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

### Triggering Specific Emails

Use trigger functions from `lib/email/trigger/`:

```typescript
import { triggerSaleCreatedConfirmation } from '@/lib/email/trigger/triggerSaleCreatedConfirmation'

// Fire-and-forget (non-blocking)
void triggerSaleCreatedConfirmation({
  userId: 'user-id',
  email: 'user@example.com',
  displayName: 'John Doe',
  saleId: 'sale-id',
  saleTitle: 'My Yard Sale',
  saleAddressLine: '123 Main St, City, ST 12345',
  startsAt: new Date('2024-12-07T08:00:00'),
  endsAt: new Date('2024-12-07T14:00:00'),
  timezone: 'America/New_York',
})
```

## Current Email Flows

### Sale Created Confirmation

**Triggered when:** A user successfully publishes a sale via `/api/drafts/publish`

**Location:** `app/api/drafts/publish/route.ts` (after sale creation, before response)

**Template:** `lib/email/templates/SaleCreatedConfirmationEmail.tsx`

**Data sources:**
- User email: From authenticated user session
- Display name: From user profile (optional)
- Sale data: From newly created sale row
- Sale URL: Built from `NEXT_PUBLIC_SITE_URL` and sale ID

**Error handling:** Non-blocking; failures are logged but do not affect sale creation

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

