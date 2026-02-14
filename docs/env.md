# Environment Variables

**Last updated: 2025-01-31**

This document lists all required environment variables for production deployment, organized by category.

## Overview

LootAura requires environment variables for:
- **Supabase**: Database and authentication
- **Mapbox**: Map rendering and geocoding
- **Cloudinary**: Image hosting and optimization
- **Rate Limiting**: Upstash Redis for production scaling
- **Monitoring**: Sentry for error tracking
- **Analytics**: Microsoft Clarity for session recordings and heatmaps
- **Push Notifications**: VAPID keys for browser push
- **Feature Flags**: Client-side feature toggles
- **Email**: Resend for transactional emails
- **Payments**: Stripe for promotion payments
- **Webhooks**: Resend and Stripe webhook secrets

## Public Variables (Client-Safe)

These variables are exposed to the browser and safe for client-side code.

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `NEXT_PUBLIC_SUPABASE_SCHEMA` - Database schema (`lootaura_v2` or `public`)

### Mapbox
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` - Mapbox API public token

### Cloudinary
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` - Cloudinary upload preset

### Site Configuration
- `NEXT_PUBLIC_SITE_URL` - Canonical site URL

### Monitoring & Analytics
- `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error tracking
- `NEXT_PUBLIC_CLARITY_ID` - Microsoft Clarity project ID

### Push Notifications
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - VAPID public key for push notifications

### Feature Flags
- `NEXT_PUBLIC_DEBUG` - Debug mode flag
- `NEXT_PUBLIC_FEATURE_CLUSTERING` - Enable map clustering
- `NEXT_PUBLIC_FLAG_SAVED_PRESETS` - Enable saved presets
- `NEXT_PUBLIC_GOOGLE_ENABLED` - Enable Google OAuth

## Server-Only Variables (Never Client-Exposed)

These variables are **never** exposed to the browser and must remain server-side only.

### Supabase
- `SUPABASE_SERVICE_ROLE` - Supabase service role key (bypasses RLS)

### Rate Limiting
- `UPSTASH_REDIS_REST_URL` - Upstash Redis REST URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis REST token
- `RATE_LIMITING_ENABLED` - Enable/disable rate limiting

### Email
- `RESEND_API_KEY` - Resend API key for transactional emails
- `RESEND_WEBHOOK_SECRET` - Resend webhook signature verification secret

### Payments
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signature verification secret

### Admin & Moderation
- `ADMIN_EMAILS` - Comma-separated list of admin email addresses
- `MODERATION_DIGEST_EMAIL` - Email address for moderation digest

### Operations
- `MAINTENANCE_MODE` - Enable site-wide maintenance page

## Setting Environment Variables

### Vercel Dashboard
1. Go to your project → Settings → Environment Variables
2. Add each variable with appropriate scope (Production, Preview, Development)
3. Ensure server-only variables are marked as "Server-side only"

### Local Development
1. Copy `env.example` to `.env.local`
2. Fill in required values (never commit `.env.local`)

## Security Notes

- **Never commit** `.env.local` or any file containing actual secrets
- **Server-only variables** must never be prefixed with `NEXT_PUBLIC_`
- **Service role keys** bypass RLS - use only in server-side code
- **Webhook secrets** are required for webhook signature verification
