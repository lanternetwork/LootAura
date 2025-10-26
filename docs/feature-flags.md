# Feature Flags Guide

**Last updated: 2025-01-27 — Map-Centric Architecture**

This guide documents all feature flags and environment variables used in LootAura for controlling functionality, debugging, and environment-specific behavior.

## 🚩 Feature Flags

### Debug Mode

**Environment Variable**: `NEXT_PUBLIC_DEBUG`

**Type**: `boolean`

**Default**: `false`

**Description**: Enables comprehensive debug logging and admin tools.

**Features Enabled**:
- Console logging for all API calls
- Diagnostic overlay with fetch event monitoring
- Admin tools at `/admin/tools`
- Performance timing information
- Viewport change tracking

**Usage**:
```bash
# Enable debug mode
NEXT_PUBLIC_DEBUG=true

# Disable debug mode (default)
NEXT_PUBLIC_DEBUG=false
```

### Clustering System

**Environment Variable**: `NEXT_PUBLIC_FEATURE_CLUSTERING`

**Type**: `boolean`

**Default**: `true`

**Description**: Controls whether map pins are clustered or displayed individually.

**Behavior**:
- `true`: Enables hybrid clustering system
- `false`: Renders individual pins only

**Usage**:
```bash
# Enable clustering (default)
NEXT_PUBLIC_FEATURE_CLUSTERING=true

# Disable clustering
NEXT_PUBLIC_FEATURE_CLUSTERING=false
```

### ZIP Code Writeback

**Environment Variable**: `ENABLE_ZIP_WRITEBACK`

**Type**: `boolean`

**Default**: `false`

**Description**: Enables writing Nominatim geocoding results back to the database.

**Behavior**:
- `true`: Stores Nominatim results in `zipcodes` table
- `false`: Only reads from existing ZIP code data

**Usage**:
```bash
# Enable ZIP writeback
ENABLE_ZIP_WRITEBACK=true

# Disable ZIP writeback (default)
ENABLE_ZIP_WRITEBACK=false
```

## 🔧 Environment Configuration

### Supabase Configuration

**Environment Variables**:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE`: Supabase service role key
- `NEXT_PUBLIC_SUPABASE_SCHEMA`: Database schema (default: `lootaura_v2`)

**Schema Options**:
- `lootaura_v2`: V2 schema with new features
- `public`: Legacy schema for existing deployments

### Mapbox Configuration

**Environment Variable**: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`

**Type**: `string`

**Required**: `true`

**Description**: Mapbox access token for map rendering and geocoding.

**Format**: Must start with `pk.`

### Site Configuration

**Environment Variable**: `NEXT_PUBLIC_SITE_URL`

**Type**: `string`

**Default**: `https://yardsalefinder.com`

**Description**: Base URL for the application.

**Usage**:
```bash
# Production
NEXT_PUBLIC_SITE_URL=https://yardsalefinder.com

# Development
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Preview
NEXT_PUBLIC_SITE_URL=https://loot-aura-preview.vercel.app
```

## 🔐 Authentication & Security

### VAPID Keys (Push Notifications)

**Environment Variables**:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: VAPID public key
- `VAPID_PRIVATE_KEY`: VAPID private key

**Type**: `string`

**Required**: `false`

**Description**: Keys for push notification functionality.

### Seed Token

**Environment Variable**: `SEED_TOKEN`

**Type**: `string`

**Required**: `false`

**Description**: Token for admin operations like seeding data.

**Usage**:
```bash
# Set seed token
SEED_TOKEN=your-secure-token-here

# Use in API calls
curl -X POST /api/admin/seed/mock \
  -H "Authorization: Bearer $SEED_TOKEN"
```

## 🌐 External Services

### Redis (Rate Limiting)

**Environment Variables**:
- `UPSTASH_REDIS_REST_URL`: Redis REST API URL
- `UPSTASH_REDIS_REST_TOKEN`: Redis REST API token

**Type**: `string`

**Required**: `false`

**Description**: Upstash Redis configuration for rate limiting.

### Nominatim (Geocoding Fallback)

**Environment Variable**: `NOMINATIM_APP_EMAIL`

**Type**: `string`

**Required**: `false`

**Description**: Email address for Nominatim geocoding service requests.

**Usage**:
```bash
# Set email for Nominatim requests
NOMINATIM_APP_EMAIL=your-email@example.com
```

## 🧪 Testing Configuration

### Test Environment Variables

**Environment Variables**:
- `NODE_OPTIONS`: Node.js options for test runs
- `CI`: Indicates if running in CI environment

**Usage**:
```bash
# Test with memory optimization
NODE_OPTIONS='--max-old-space-size=8192 --expose-gc'

# CI environment
CI=true
```

## 📊 Monitoring & Analytics

### Sentry (Error Tracking)

**Environment Variables**:
- `SENTRY_DSN`: Sentry DSN for error tracking
- `SENTRY_ORG`: Sentry organization
- `SENTRY_PROJECT`: Sentry project name

**Type**: `string`

**Required**: `false`

**Description**: Sentry configuration for error monitoring.

## 🔄 Feature Flag Management

### Adding New Feature Flags

1. **Define Environment Variable**:
   ```typescript
   // In lib/env.ts
   export const FEATURE_NEW_FEATURE = process.env.NEXT_PUBLIC_FEATURE_NEW_FEATURE === 'true'
   ```

2. **Use in Components**:
   ```typescript
   // In component
   if (FEATURE_NEW_FEATURE) {
     // New feature code
   }
   ```

3. **Document Usage**:
   - Add to this file
   - Include in environment setup docs
   - Update deployment configuration

### Feature Flag Best Practices

1. **Naming Convention**: Use `NEXT_PUBLIC_FEATURE_` prefix for client-side flags
2. **Default Values**: Always provide sensible defaults
3. **Documentation**: Document all flags and their behavior
4. **Testing**: Test both enabled and disabled states
5. **Cleanup**: Remove flags when features are stable

## 🚀 Deployment Configuration

### Vercel Environment Variables

**Required for Production**:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE=your-service-role-key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your-mapbox-token
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

**Optional for Production**:
```bash
NEXT_PUBLIC_DEBUG=false
NEXT_PUBLIC_FEATURE_CLUSTERING=true
ENABLE_ZIP_WRITEBACK=false
SEED_TOKEN=your-seed-token
```

### Environment-Specific Configuration

**Development**:
```bash
NEXT_PUBLIC_DEBUG=true
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**Preview**:
```bash
NEXT_PUBLIC_DEBUG=false
NEXT_PUBLIC_SITE_URL=https://loot-aura-preview.vercel.app
```

**Production**:
```bash
NEXT_PUBLIC_DEBUG=false
NEXT_PUBLIC_SITE_URL=https://yardsalefinder.com
```

## 🔍 Debugging Feature Flags

### Check Current Configuration

```typescript
// In browser console
console.log('Debug Mode:', process.env.NEXT_PUBLIC_DEBUG)
console.log('Clustering:', process.env.NEXT_PUBLIC_FEATURE_CLUSTERING)
console.log('Schema:', process.env.NEXT_PUBLIC_SUPABASE_SCHEMA)
```

### Admin Tools

Access admin tools at `/admin/tools` to view:
- Current environment variables
- Feature flag status
- System configuration
- Debug information

## 📚 Related Documentation

- [Environment Configuration](environment-configuration.md)
- [Debug Guide](debug-guide.md)
- [Dev Setup Guide](dev-setup.md)
- [API Documentation](api.md)

## 🎯 Summary

Feature flags provide flexible control over LootAura's functionality:

1. **Debug Mode**: Comprehensive debugging and monitoring
2. **Clustering**: Map pin clustering behavior
3. **ZIP Writeback**: Geocoding result storage
4. **Environment Config**: Database and service configuration
5. **Security**: Authentication and access control

Proper configuration of these flags ensures optimal performance and functionality across all environments.
