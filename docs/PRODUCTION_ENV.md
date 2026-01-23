# Production Environment Variables Matrix

**Last updated: 2025-10-31**

This document lists all required environment variables for production deployment, their scope (client/server), and where they should be set.

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

## Required Environment Variables

### 🔵 Public Variables (Client-Safe)

These variables are exposed to the browser and safe for client-side code.

| Variable | Required | Description | Where to Set | Notes |
|----------|----------|-------------|--------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Yes | Supabase project URL | Vercel dashboard → Environment Variables | Get from Supabase project settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Yes | Supabase anonymous key | Vercel dashboard → Environment Variables | Get from Supabase project settings > API |
| `NEXT_PUBLIC_SUPABASE_SCHEMA` | ⚠️ Conditional | Database schema (`lootaura_v2` or `public`) | Vercel dashboard → Environment Variables | Defaults to `public` if not set |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | ✅ Yes | Mapbox API public token | Vercel dashboard → Environment Variables | Get from Mapbox account, restrict to domains |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | ✅ Yes (if images) | Cloudinary cloud name | Vercel dashboard → Environment Variables | Get from Cloudinary dashboard |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | ✅ Yes (if images) | Cloudinary upload preset | Vercel dashboard → Environment Variables | Create unsigned preset in Cloudinary |
| `NEXT_PUBLIC_SITE_URL` | ✅ Yes | Canonical site URL | Vercel dashboard → Environment Variables | `https://lootaura.com` for production |
| `NEXT_PUBLIC_SENTRY_DSN` | ✅ Yes | Sentry DSN for error tracking | Vercel dashboard → Environment Variables | Get from Sentry project settings |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ⚠️ Optional | VAPID public key for push notifications | Vercel dashboard → Environment Variables | Generate with `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_DEBUG` | ⚠️ Optional | Debug mode flag | Vercel dashboard → Environment Variables | Set to `false` in production |
| `NEXT_PUBLIC_FEATURE_CLUSTERING` | ⚠️ Optional | Enable map clustering | Vercel dashboard → Environment Variables | Default: `true` |
| `NEXT_PUBLIC_FLAG_SAVED_PRESETS` | ⚠️ Optional | Enable saved presets | Vercel dashboard → Environment Variables | Default: `true` |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | ⚠️ Optional | Enable Google OAuth | Vercel dashboard → Environment Variables | Default: `true` |
| `NEXT_PUBLIC_CLARITY_ID` | ⚠️ Optional | Microsoft Clarity project ID | Vercel dashboard → Environment Variables | Get from Clarity dashboard → Settings → Project ID |

### 🔴 Server-Only Variables (Never Client-Exposed)

These variables are **never** exposed to the browser and must remain server-side only.

| Variable | Required | Description | Where to Set | Notes |
|----------|----------|-------------|--------------|-------|
| `SUPABASE_SERVICE_ROLE` | ✅ Yes | Supabase service role key | Vercel dashboard → Environment Variables | **SERVER-ONLY** - Bypasses RLS. Get from Supabase project settings > API |
| `UPSTASH_REDIS_REST_URL` | ✅ Yes (if rate limiting) | Upstash Redis REST URL | Vercel dashboard → Environment Variables | **SERVER-ONLY** - Get from Upstash Redis dashboard |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ Yes (if rate limiting) | Upstash Redis REST token | Vercel dashboard → Environment Variables | **SERVER-ONLY** - Get from Upstash Redis dashboard |
| `VAPID_PRIVATE_KEY` | ⚠️ Optional | VAPID private key for push notifications | Vercel dashboard → Environment Variables | **SERVER-ONLY** - Generate with `npx web-push generate-vapid-keys` |
| `NOMINATIM_APP_EMAIL` | ⚠️ Optional | Email for Nominatim geocoding fallback | Vercel dashboard → Environment Variables | **SERVER-ONLY** - For fallback geocoding politeness |
| `MAPBOX_GEOCODING_ENDPOINT` | ⚠️ Optional | Mapbox geocoding endpoint override | Vercel dashboard → Environment Variables | **SERVER-ONLY** - Default: `https://api.mapbox.com/geocoding/v5/mapbox.places` |
| `RATE_LIMITING_ENABLED` | ✅ Yes | Enable rate limiting | Vercel dashboard → Environment Variables | **SERVER-ONLY** - Set to `true` in production |

## Production Checklist

### ✅ Required for Production

- [ ] `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- [ ] `SUPABASE_SERVICE_ROLE` - Supabase service role key (server-only)
- [ ] `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` - Mapbox public token
- [ ] `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- [ ] `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` - Cloudinary upload preset
- [ ] `NEXT_PUBLIC_SITE_URL` - Site URL (`https://lootaura.com`)
- [ ] `NEXT_PUBLIC_SENTRY_DSN` - Sentry DSN for error tracking
- [ ] `RATE_LIMITING_ENABLED` - Set to `true`
- [ ] `UPSTASH_REDIS_REST_URL` - Upstash Redis URL
- [ ] `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token

### ⚠️ Optional for Production

- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - If using push notifications
- [ ] `VAPID_PRIVATE_KEY` - If using push notifications
- [ ] `NOMINATIM_APP_EMAIL` - If using fallback geocoding
- [ ] `NEXT_PUBLIC_DEBUG` - Should be `false` in production
- [ ] Feature flags (`NEXT_PUBLIC_FLAG_*`) - Configure as needed

## Where to Set Variables

### Vercel Dashboard

1. Go to your Vercel project
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable for:
   - **Production**: Production deployments only
   - **Preview**: Preview deployments (PR previews)
   - **Development**: Local development (optional)

### Variable Scopes

- **Production**: Set for `main` branch deployments
- **Preview**: Set for PR preview deployments (can use production values or separate staging values)
- **Development**: Set for local `.env.local` file (see `env.example`)

## Security Notes

### 🔴 Server-Only Variables

These variables **must never** be:
- Exposed in client-side code
- Included in browser bundles
- Logged in client-side console logs
- Committed to version control

**Verified Safe:**
- `SUPABASE_SERVICE_ROLE` - Only referenced in `lib/supabase/admin.ts` (server-only)
- `UPSTASH_REDIS_REST_TOKEN` - Only used in rate limiting middleware (server-only)
- `VAPID_PRIVATE_KEY` - Only used in push notification API routes (server-only)

### 🔵 Public Variables

These variables are:
- Safe to expose in client-side code
- Included in browser bundles
- Visible in browser DevTools
- Documented as public in codebase

## Environment Validation

Environment variables are validated at startup using `lib/env.ts`:
- **Public variables**: Validated on both client and server
- **Server variables**: Validated only on server
- **Missing required variables**: Application will fail to start with clear error messages

## Quick Reference

### Minimum Production Setup

```bash
# Required Public Variables
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloud_name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_upload_preset
NEXT_PUBLIC_SITE_URL=https://lootaura.com
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn

# Required Server Variables
SUPABASE_SERVICE_ROLE=your_service_role_key
RATE_LIMITING_ENABLED=true
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
```

### Full Production Setup

See `env.example` for complete list with descriptions and examples.

## Troubleshooting

### "Missing environment variable" error

1. Check Vercel dashboard → Environment Variables
2. Verify variable name matches exactly (case-sensitive)
3. Ensure variable is set for correct environment (Production/Preview)
4. Redeploy after adding new variables

### "Rate limiting not working"

1. Verify `RATE_LIMITING_ENABLED=true`
2. Check `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set
3. Verify Upstash Redis database is active and accessible

### "Image uploads failing"

1. Verify `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is set
2. Check `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` is set
3. Verify Cloudinary upload preset is configured correctly (unsigned, folder restrictions)

### "Map not loading"

1. Verify `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is set
2. Check Mapbox token has correct scopes (Mapbox GL JS, Geocoding API)
3. Verify token is not restricted to wrong domains

## Related Documentation

- **Environment Configuration**: See `env.example` for complete variable list
- **Environment Parity**: See `docs/env-parity.md` for dev/stage/prod comparison
- **Rate Limiting**: See `docs/OPERATIONS.md` for rate limiting setup
- **Image Hosting**: See `docs/IMAGES.md` for Cloudinary configuration

