# LootAura

**Last updated: 2025-01-27 — Map-Centric Architecture Documentation**

A modern web application for discovering and managing yard sales, garage sales, and estate sales in your area. Built with enterprise-grade architecture featuring **map-centric design**, Supabase backend, and Mapbox integration.

## 📋 Quick Start

- **Architecture Overview**: See [docs/architecture.md](docs/architecture.md) for comprehensive development standards
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines
- **Deployment**: See [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md) for production deployment
- **Launch**: See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for launch validation
- **Roadmap**: See [ROADMAP.md](ROADMAP.md) for development milestones
- **What's New**: See [docs/CHANGELOG.md](docs/CHANGELOG.md) for latest updates and release notes
- **Environment Setup**: See [docs/env-parity.md](docs/env-parity.md) for environment variable configuration

## 🏗️ Architecture Invariants

LootAura follows strict architectural invariants to prevent regressions:

- **Map-Centric Design**: Map viewport drives all data fetching and list display
- **Single Fetch Path**: Only 2 entry points to fetchMapSales (viewport changes, filter changes)
- **Distance-to-Zoom Mapping**: Distance slider controls map zoom instead of API filtering
- **Parameter Canonicalization**: `categories` parameter with legacy `cat` support
- **Single Source**: Both markers and list read from the same data source
- **DOM Structure**: List container with direct children, no intermediate wrappers
- **Debug Discipline**: Single `NEXT_PUBLIC_DEBUG` flag, no PII in logs
- **ID Parity**: Marker IDs must be discoverable in list after updates

See [docs/INVARIANTS.md](docs/INVARIANTS.md) for complete protocol contracts.

## 🚦 Rate Limiting

LootAura implements production-grade rate limiting to protect against abuse and ensure fair usage.

### Policies

| Policy | Limit | Window | Scope | Description |
|--------|-------|--------|-------|-------------|
| `AUTH_DEFAULT` | 5 req | 30s | IP | Authentication attempts |
| `AUTH_HOURLY` | 60 req | 1h | IP | Hourly auth limit |
| `AUTH_CALLBACK` | 10 req | 60s | IP | OAuth callback burst |
| `GEO_ZIP_SHORT` | 10 req | 60s | IP | ZIP code lookups |
| `GEO_ZIP_HOURLY` | 300 req | 1h | IP | Hourly geocoding |
| `SALES_VIEW_30S` | 20 req | 30s | IP | Map viewport fetches |
| `SALES_VIEW_HOURLY` | 800 req | 1h | IP | Hourly map requests |
| `MUTATE_MINUTE` | 3 req | 60s | User | Sale/item creation |
| `MUTATE_DAILY` | 100 req | 24h | User | Daily mutations |
| `ADMIN_TOOLS` | 3 req | 30s | IP | Admin endpoints |

### Enable/Disable

Rate limiting is **disabled by default** and only enabled when:
- `NODE_ENV === 'production'` AND `RATE_LIMITING_ENABLED === 'true'`

```bash
# Enable in production
RATE_LIMITING_ENABLED=true

# Disable (default)
# RATE_LIMITING_ENABLED=false or unset
```

### Backend Configuration

**Production (Upstash Redis):**
```bash
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token
```

**Development (In-Memory):**
- No Redis credentials needed
- Uses in-memory sliding window
- Resets on server restart

### Testing Rate Limits

```bash
# Test auth rate limiting
curl -X POST https://your-domain.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  -v

# Test sales viewport rate limiting  
for i in {1..25}; do
  curl "https://your-domain.com/api/sales?bbox=38.0,-85.0,38.1,-84.9" \
    -H "X-Forwarded-For: 192.168.1.1" \
    -v
done
```

### Response Headers

All responses include rate limiting headers:

```
X-RateLimit-Limit: 5
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1640995200
X-RateLimit-Policy: AUTH_DEFAULT 5/30
Retry-After: 30  # Only on 429 responses
```

### Soft-Then-Hard Behavior

Some policies support burst tolerance:
- **Sales Viewport**: Allows 2 extra requests in 5-second window
- **Headers**: `X-RateLimit-Remaining: 0` indicates soft limit
- **No Retry-After**: Soft limits don't include `Retry-After` header

## 🐛 Debug Mode

### Enabling Debug Mode
```bash
# Set environment variable
NEXT_PUBLIC_DEBUG=true

# Or in Vercel dashboard
# Environment Variables → Add → NEXT_PUBLIC_DEBUG = true
```

### Debug Features
- **Filter Normalization**: See how categories are processed
- **Map Viewport**: Understand how map changes drive data fetching
- **DOM Structure**: Verify grid layout and card counting
- **ID Parity**: Check marker-list consistency
- **Admin Tools**: Access comprehensive debugging tools at `/admin/tools`

See [docs/DEBUG_GUIDE.md](docs/DEBUG_GUIDE.md) for complete debug guide.

## 🔧 Admin Tools

LootAura includes comprehensive admin and debugging tools accessible at `/admin/tools`:

### Available Tools
- **Debug Controls**: Toggle debug mode and view real-time diagnostics
- **Review Key Lookup**: Look up sale information and review keys by sale ID
- **System Information**: View environment variables and configuration status
- **Health Checks**: Quick access to system health endpoints
- **Diagnostic Overlay**: Real-time monitoring of fetch events and system behavior

### Access
- **URL**: `/admin/tools`
- **Authentication**: None required (publicly accessible)
- **API Endpoint**: `/api/lookup-sale` (also publicly accessible)

### Features
- **Sale Lookup**: Enter any sale ID to get comprehensive sale information
- **Multi-table Support**: Searches across `sales_v2`, `sales`, and `yard_sales` tables
- **Real-time Diagnostics**: Monitor fetch events, timing, and system behavior
- **Health Monitoring**: Direct links to health check endpoints
- **Environment Status**: View current configuration and feature flags

## Features

- **Interactive Map View**: Find sales near you with an interactive Mapbox map
- **List View**: Browse sales in a clean, organized list
- **User Authentication**: Sign up and manage your account
- **Favorites**: Save sales you're interested in
- **CSV Import/Export**: Import and export sales data
- **Admin Tools**: Comprehensive debugging and development tools
- **Responsive Design**: Works on desktop and mobile devices

## Data Sources

**No third-party scraping**: LootAura uses native listings and mock seed data for demos. We do not scrape external websites like Craigslist.

## AI Assistant Guidelines

**Important**: See [docs/AI_ASSISTANT_RULES.md](docs/AI_ASSISTANT_RULES.md) for critical restrictions and guidelines that must be followed when working on this codebase.

## Category Management

**Important**: See [docs/CATEGORY_MANAGEMENT.md](docs/CATEGORY_MANAGEMENT.md) for comprehensive information about category management, troubleshooting, and maintenance tools.

## Troubleshooting

**Important**: See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues, solutions, and diagnostic tools.

## Debugging

### Enterprise Debug Policy

**Important**: `NEXT_PUBLIC_DEBUG` is the only runtime debug flag. All debug features are gated behind this environment variable to prevent production leaks.

### Diagnostic Overlay

When `NEXT_PUBLIC_DEBUG=true` is set, a diagnostic overlay appears showing:

- **Last 10 fetch events** with endpoint, query parameters, authority, and timing
- **Viewport/Request sequences** to verify proper sequencing behavior
- **Red badge** indicating suppressed wide fetches under MAP authority
- **Toggle button** to show/hide the overlay

### Visual Confirmation

The overlay helps verify:
- **Suppression**: Red "SUPPRESSED" status for wide `/api/sales` calls under MAP authority
- **Sequencing**: Monotonically increasing viewport/request sequence numbers
- **Parameter Consistency**: Identical `from`/`to` values in both endpoint calls
- **Authority Stability**: No authority flips when changing date filters

### Enabling Debug Mode

```bash
# Set environment variable
NEXT_PUBLIC_DEBUG=true

# Or in Vercel dashboard
# Environment Variables → Add → NEXT_PUBLIC_DEBUG = true
```

## ZIP Codes (Full US) — Free Lookups

LootAura includes a comprehensive US ZIP code database for instant, free geocoding lookups:

### Database Storage
- **Table**: `lootaura_v2.zipcodes` with public read access via RLS
- **Data**: All US ZIP codes with lat/lng coordinates, city, and state
- **Access**: Public read-only access for anonymous and authenticated users

### One-Time Setup
1. **Set Environment Variable**: Add `SEED_TOKEN` to Vercel (Preview/Production)
2. **Ingest Data**: 
   ```bash
   POST /api/admin/seed/zipcodes
   Authorization: Bearer <SEED_TOKEN>
   ```
3. **Optional Preview**: Add `?dryRun=true` to preview counts without writing data

### Geocoding API
- **Endpoint**: `/api/geocoding/zip?zip=XXXXX`
- **Local First**: Queries `lootaura_v2.zipcodes` table for instant results
- **Fallback**: Nominatim geocoding (throttled) or Mapbox Geocoding API (token-based)
- **Write-back**: Optional storage of Nominatim results (set `ENABLE_ZIP_WRITEBACK=true`)

### Benefits
- **Free Lookups**: No paid geocoding services required for ZIP codes
- **Instant Results**: Local table provides immediate responses
- **Complete Coverage**: All US ZIP codes included
- **No Mapbox**: ZIP lookups use local database, not Mapbox geocoding

## Configuration

This project uses configurable Supabase schemas via environment variables. The schema is determined by the `NEXT_PUBLIC_SUPABASE_SCHEMA` environment variable, which defaults to `'public'` if not set.

### Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `NEXT_PUBLIC_SUPABASE_SCHEMA` - The schema to use (defaults to 'public')
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` - Mapbox public access token (maps/geocoding)
- `SUPABASE_SERVICE_ROLE` - Supabase service role key

### Optional Environment Variables

- `NEXT_PUBLIC_SITE_URL` - Your site URL (defaults to https://yardsalefinder.com)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` - VAPID public key for push notifications
- `VAPID_PRIVATE_KEY` - VAPID private key for push notifications
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL for rate limiting
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token
- `NOMINATIM_APP_EMAIL` - Email for Nominatim geocoding service

### Development

**Note:** Local development without `.env.local` is unsupported in this project. Use Vercel Preview for development and testing.

The application automatically uses the configured schema for all Supabase operations, removing the need for schema prefixes in queries.

## Getting Started

1. Clone the repository
2. Set up your environment variables
3. Deploy to Vercel
4. Configure your Supabase project
5. Run the application

## Technology Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Maps**: Mapbox GL JS
- **Deployment**: Vercel
#  Forced redeployment 09/30/2025 21:09:32

## Mock Seed Data

- Set `SEED_TOKEN` in Vercel Environment Variables (Preview and/or Production).
- To seed, send a POST request to `/api/admin/seed/mock` with header `Authorization: Bearer <SEED_TOKEN>`.
- The response includes `inserted`, `skipped`, and `itemsInserted` counts.
- Safe to re-run; the operation is idempotent.

## Search Performance & Distance Calculations

LootAura uses advanced PostGIS distance calculations for accurate location-based search:

### Distance Filtering
- **Primary Method**: PostGIS `ST_DWithin` with precise distance calculations
- **Fallback**: Bounding box approximation (only when PostGIS unavailable)
- **Performance**: Optimized with GIST indexes on geography columns
- **Accuracy**: Results ordered by actual distance, not approximation

### Search Features
- **Location Required**: All searches require lat/lng coordinates
- **Distance Filtering**: Configurable radius (1-160 km)
- **Date Range Filtering**: Today, weekend, next weekend, custom ranges
- **Category Filtering**: Multi-select category overlap matching
- **Text Search**: Fuzzy search across title, description, and city
- **Combined Filters**: All filters work together for precise results

### Performance Indicators
- **Normal Mode**: PostGIS distance calculations (most accurate)
- **Degraded Mode**: Only appears if PostGIS fails (rare)
- **Real-time**: Results update as filters change

## Operations

### Rollback Procedures
- **Emergency Rollback**: See [docs/runbook-rollback.md](docs/runbook-rollback.md) for detailed rollback procedures
- **Owner's Runbook**: See [docs/owners-runbook.md](docs/owners-runbook.md) for incident response procedures
- **Health Checks**: Monitor `/api/health` endpoint for system status
- **Feature Flags**: Use environment variables to disable features during incidents

### Monitoring & Alerts
- **Error Tracking**: Sentry integration for real-time error monitoring
- **Performance**: Web Vitals monitoring for Core Web Vitals metrics
- **Database**: Supabase monitoring for query performance and RLS policies
- **External Services**: Mapbox, Redis, and CDN status monitoring

### Quality Assurance
- **Accessibility**: See [docs/a11y-check.md](docs/a11y-check.md) for manual accessibility testing
- **Testing**: Comprehensive test suite with unit, integration, and E2E tests
- **Security**: RLS policies and privilege escalation testing
- **Performance**: Bundle size monitoring and memory optimization#   F o r c e   r e d e p l o y   -   1 0 / 1 3 / 2 0 2 5   2 0 : 4 7 : 1 6 
 
 #   F o r c e   r e d e p l o y 
 
 