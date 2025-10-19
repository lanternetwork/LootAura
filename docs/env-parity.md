# Environment Variables Parity Matrix

**Last updated: 2025-10-19**

This document provides a comprehensive matrix of all environment variables across development, staging, and production environments.

## Environment Matrix

| Variable | Type | Dev | Stage | Prod | Notes |
|----------|------|-----|-------|------|-------|
| **Public Variables (Client-Safe)** |
| `NEXT_PUBLIC_SUPABASE_URL` | URL | ✅ | ✅ | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | String | ✅ | ✅ | ✅ | Supabase anonymous key |
| `NEXT_PUBLIC_SUPABASE_SCHEMA` | String | `lootaura_v2` | `lootaura_v2` | `lootaura_v2` | Schema selection |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | String | ✅ | ✅ | ✅ | Mapbox API token |
| `NEXT_PUBLIC_SITE_URL` | URL | `http://localhost:3000` | `https://staging.lootaura.com` | `https://lootaura.com` | Canonical site URL |
| `NEXT_PUBLIC_SENTRY_DSN` | String | ❌ | ✅ | ✅ | Sentry error tracking |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | String | ❌ | ✅ | ✅ | Push notification key |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | String | ❌ | ✅ | ✅ | Cloudinary cloud name |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | String | ❌ | ✅ | ✅ | Cloudinary upload preset |
| `NEXT_PUBLIC_DEBUG` | Boolean | `true` | `false` | `false` | Debug mode flag |
| `NEXT_PUBLIC_FEATURE_CLUSTERING` | Boolean | `true` | `true` | `true` | Map clustering feature |
| `NEXT_PUBLIC_FLAG_OFFLINE_CACHE` | Boolean | `false` | `true` | `true` | Offline caching feature |
| `NEXT_PUBLIC_FLAG_SAVED_PRESETS` | Boolean | `true` | `true` | `true` | Saved presets feature |
| `NEXT_PUBLIC_FLAG_SHARE_LINKS` | Boolean | `true` | `true` | `true` | Share links feature |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | Boolean | `true` | `true` | `true` | Google OAuth feature |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE` | Number | `5242880` | `5242880` | `5242880` | Client upload size limit |
| **Server-Only Variables (Never Client-Exposed)** |
| `SUPABASE_SERVICE_ROLE` | String | ✅ | ✅ | ✅ | **SERVER-ONLY** - Bypasses RLS |
| `VAPID_PRIVATE_KEY` | String | ❌ | ✅ | ✅ | **SERVER-ONLY** - Push notifications |
| `UPSTASH_REDIS_REST_URL` | String | ❌ | ✅ | ✅ | **SERVER-ONLY** - Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | String | ❌ | ✅ | ✅ | **SERVER-ONLY** - Rate limiting |
| `NOMINATIM_APP_EMAIL` | String | ❌ | ✅ | ✅ | **SERVER-ONLY** - Geocoding fallback |
| `MAPBOX_GEOCODING_ENDPOINT` | String | ❌ | ✅ | ✅ | **SERVER-ONLY** - Geocoding override |
| `MANUAL_LOCATION_OVERRIDE` | String | ❌ | ❌ | ❌ | **DEV-ONLY** - Testing override |

## Security Verification

### ✅ Service Role Key Protection
- **Location**: Only referenced in `lib/supabase/admin.ts`
- **Client Exposure**: ❌ Never imported in client-side code
- **Bundle Analysis**: Confirmed not included in client bundles
- **Usage**: Server-side only for admin operations and signed URL generation

### ✅ Secret Separation
- **Public Variables**: Safe to expose in client bundles
- **Server Variables**: Never referenced in client code
- **Environment Validation**: All required variables validated at startup

## Variable Validation

### Required for All Environments
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `SUPABASE_SERVICE_ROLE`

### Required for Production
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Optional/Feature Flags
- `NEXT_PUBLIC_CLOUDINARY_*` (Image uploads)
- `NEXT_PUBLIC_FLAG_*` (Feature toggles)
- `MANUAL_LOCATION_OVERRIDE` (Development only)

## Cross-Reference Validation

### ✅ All Variables in env.example
All variables listed above are present in `env.example` with appropriate comments and examples.

### ✅ All Variables Referenced
All variables in the matrix are actively used in the codebase:
- **Supabase**: Authentication, database operations, RLS policies
- **Mapbox**: Map rendering, geocoding, clustering
- **Sentry**: Error tracking and performance monitoring
- **VAPID**: Push notifications for sale updates
- **Redis**: Rate limiting for API endpoints
- **Cloudinary**: Image upload and optimization

### ❌ Unused Variables
No unused environment variables detected in the codebase.

## Environment-Specific Notes

### Development
- Debug mode enabled by default
- All feature flags enabled for testing
- Optional services (Sentry, Redis) disabled
- Manual location override available

### Staging
- Debug mode disabled
- All production services enabled
- Feature flags match production
- Separate Supabase project for testing

### Production
- Debug mode disabled
- All services enabled
- Feature flags optimized for performance
- Monitoring and alerting configured

## Migration Notes

### Schema Migration
- **Legacy**: `NEXT_PUBLIC_SUPABASE_SCHEMA` unset (defaults to `public`)
- **V2**: `NEXT_PUBLIC_SUPABASE_SCHEMA=lootaura_v2`
- **Backward Compatibility**: Existing deployments continue to work

### Feature Rollout
- **Gradual**: Feature flags allow safe rollout
- **Rollback**: Flags can be disabled without code changes
- **Monitoring**: Each feature has corresponding monitoring

## Security Checklist

- [ ] Service role key never exposed to client
- [ ] All server-only variables properly isolated
- [ ] Public variables safe for client exposure
- [ ] Environment validation on startup
- [ ] No secrets in client bundles
- [ ] Proper variable documentation
- [ ] Cross-environment parity verified
