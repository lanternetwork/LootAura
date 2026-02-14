# Operations Runbook

**Last updated: 2025-01-31**

This document provides step-by-step operational procedures for LootAura production systems.

## Table of Contents

- [Disable Emails](#disable-emails)
- [Rotate Webhook Secrets](#rotate-webhook-secrets)
- [Disable Promotions](#disable-promotions)
- [Maintenance Mode](#maintenance-mode)
- [Rate Limiting Operations](#rate-limiting-operations)
- [Image Monitoring](#image-monitoring)
- [Sentry Monitoring](#sentry-monitoring)
- [Debug Mode](#debug-mode)

## Disable Emails

### Temporarily Disable All Email Sending

**Method 1: Environment Variable (Recommended)**
```bash
# In Vercel dashboard → Environment Variables
RESEND_API_KEY=disabled
```

**Method 2: Code-Level Check**
Email sending functions check for `RESEND_API_KEY` presence. If missing or set to `disabled`, emails are skipped.

**Verification:**
- Check logs for email send attempts
- Verify no emails are sent from test accounts
- Monitor Resend dashboard for activity

### Re-enable Emails

```bash
# Restore valid Resend API key
RESEND_API_KEY=re_xxxxxxxxxxxxx
```

## Rotate Webhook Secrets

### Resend Webhook Secret

1. **Generate New Secret:**
   - Go to Resend dashboard → Webhooks
   - Create new webhook endpoint or regenerate secret
   - Copy the new webhook secret

2. **Update Environment Variable:**
   ```bash
   # In Vercel dashboard
   RESEND_WEBHOOK_SECRET=new_secret_value
   ```

3. **Update Webhook Configuration:**
   - In Resend dashboard, update webhook URL if needed
   - Configure webhook to use new secret

4. **Verify:**
   - Trigger a test webhook event
   - Check logs for successful signature verification
   - Verify `email_log` records are updated correctly

### Stripe Webhook Secret

1. **Generate New Secret:**
   - Go to Stripe dashboard → Developers → Webhooks
   - Select webhook endpoint
   - Click "Reveal" or "Reset" to generate new signing secret
   - Copy the new secret

2. **Update Environment Variable:**
   ```bash
   # In Vercel dashboard
   STRIPE_WEBHOOK_SECRET=whsec_new_secret_value
   ```

3. **Update Stripe Webhook Configuration:**
   - In Stripe dashboard, verify webhook URL is correct
   - Ensure webhook is enabled and listening to required events

4. **Verify:**
   - Use Stripe CLI to send test event: `stripe trigger payment_intent.succeeded`
   - Check logs for successful signature verification
   - Verify promotion records are created/updated correctly

## Disable Promotions

### Disable Promotion Payments

**Method 1: Environment Variable**
```bash
# Remove or disable Stripe secret key
STRIPE_SECRET_KEY=disabled
```

**Method 2: Feature Flag (if implemented)**
```bash
NEXT_PUBLIC_FEATURE_PROMOTIONS=false
```

**Verification:**
- Check promotion checkout page returns error
- Verify no new promotion payments are processed
- Monitor Stripe dashboard for payment attempts

### Re-enable Promotions

```bash
# Restore valid Stripe secret key
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
```

## Maintenance Mode

### Enable Maintenance Mode

1. **Set Environment Variable:**
   ```bash
   # In Vercel dashboard
   MAINTENANCE_MODE=true
   ```

2. **Deploy:**
   - Changes take effect on next deployment
   - Or trigger immediate redeploy

3. **Verify:**
   - Visit site root - should show maintenance page
   - API endpoints should return maintenance response
   - Admin tools may still be accessible (check middleware)

### Disable Maintenance Mode

```bash
# Remove or set to false
MAINTENANCE_MODE=false
```

## Rate Limiting Operations

### Enable/Disable Rate Limiting

**Enable:**
```bash
RATE_LIMITING_ENABLED=true
```

**Disable:**
```bash
RATE_LIMITING_ENABLED=false
# Or remove the variable
```

**Verification:**
```bash
curl -I https://your-domain.com/api/auth/signin
# Should see X-RateLimit-* headers when enabled
```

### Adjust Rate Limit Policies

Edit `lib/rateLimit/policies.ts`:

```typescript
export const Policies = {
  AUTH_DEFAULT: { name: 'AUTH_DEFAULT', limit: 5, windowSec: 30, scope: 'ip' },
  // Adjust limits as needed
}
```

**Common Tuning:**
- **High Auth Failures**: Increase `AUTH_DEFAULT.limit` or `AUTH_HOURLY.limit`
- **Map Panning Issues**: Increase `SALES_VIEW_30S.limit`
- **Mutation Spam**: Decrease `MUTATE_MINUTE.limit`

### Upstash Redis Setup

1. **Create Database:**
   - Go to [Upstash Console](https://console.upstash.com/)
   - Create new Redis database
   - Choose region closest to Vercel deployment

2. **Configure Environment:**
   ```bash
   UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token
   ```

3. **Test Connection:**
   - Visit `/admin/tools` (debug mode)
   - Check "Rate Limiting Status" shows "Upstash Redis"

## Image Monitoring

### View Image Statistics

**Admin Tools:**
- Visit `/admin/tools` (requires debug mode)
- View "Image Statistics" section
- Shows: total sales, images usage, placeholder usage

**API Endpoint:**
```bash
GET /api/admin/images-stats
# Requires admin authentication
```

### Image Validation Logs

Monitor logs for image validation failures:
```
[SALES][IMAGE_VALIDATION] Rejected cover_image_url: url=..., user=..., reason=invalid_url_format
```

## Sentry Monitoring

### Setup

1. **Get DSN:**
   - Create project at [sentry.io](https://sentry.io)
   - Copy DSN from project settings

2. **Configure:**
   ```bash
   NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
   ```

3. **Verify:**
   - Check Sentry dashboard for events
   - Trigger test error to verify tracking

### Monitoring

- **Error Tracking**: Automatic for client and server errors
- **Performance**: Page load times and API response times
- **Log Levels**: Errors sent automatically, warnings/info only in debug mode

## Debug Mode

### Enable Debug Mode

```bash
NEXT_PUBLIC_DEBUG=true
```

**Enables:**
- Detailed console logging
- Admin tools at `/admin/tools`
- Extended error messages
- Development diagnostics

**Warning:** Only enable in development/staging, never in production.

### Admin Tools

Access at `/admin/tools` when debug mode enabled:
- Cloudinary diagnostics
- Image statistics
- Rate limiting status
- Environment variable display
- Health check links

## Emergency Procedures

### Site-Wide Outage

1. **Enable Maintenance Mode:**
   ```bash
   MAINTENANCE_MODE=true
   ```

2. **Check Logs:**
   - Vercel deployment logs
   - Sentry error dashboard
   - Database connection status

3. **Rollback if Needed:**
   ```bash
   # In Vercel dashboard → Deployments
   # Select previous working deployment → Promote to Production
   ```

### Database Issues

1. **Check Supabase Status:**
   - Visit [Supabase Status Page](https://status.supabase.com/)
   - Check project dashboard for errors

2. **Verify Connection:**
   - Check `NEXT_PUBLIC_SUPABASE_URL` is correct
   - Verify `SUPABASE_SERVICE_ROLE` is valid

3. **Check RLS Policies:**
   - Verify policies are active
   - Check for policy conflicts

### Rate Limiting Issues

1. **Temporarily Disable:**
   ```bash
   RATE_LIMITING_ENABLED=false
   ```

2. **Adjust Policies:**
   - Edit `lib/rateLimit/policies.ts`
   - Increase limits if legitimate users blocked
   - Deploy changes

3. **Check Redis:**
   - Verify Upstash Redis is accessible
   - Check connection credentials

## Related Documentation

- **Environment Variables**: See [docs/env.md](docs/env.md)
- **Rate Limiting**: See [docs/OPERATIONS.md](docs/OPERATIONS.md) for detailed rate limiting guide
- **Image Management**: See [docs/IMAGES.md](docs/IMAGES.md)
