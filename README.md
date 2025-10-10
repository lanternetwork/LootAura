# YardSaleTracker
Yard Sale Tracker

A modern web application for discovering and managing yard sales, garage sales, and estate sales in your area.

## Features

- **Interactive Map View**: Find sales near you with an interactive Mapbox map
- **List View**: Browse sales in a clean, organized list
- **User Authentication**: Sign up and manage your account
- **Favorites**: Save sales you're interested in
- **CSV Import/Export**: Import and export sales data
- **Responsive Design**: Works on desktop and mobile devices

## Data Sources

**No third-party scraping**: LootAura uses native listings and mock seed data for demos. We do not scrape external websites like Craigslist.

## AI Assistant Guidelines

**Important**: See [docs/AI_ASSISTANT_RULES.md](docs/AI_ASSISTANT_RULES.md) for critical restrictions and guidelines that must be followed when working on this codebase.

## Category Management

**Important**: See [docs/CATEGORY_MANAGEMENT.md](docs/CATEGORY_MANAGEMENT.md) for comprehensive information about category management, troubleshooting, and maintenance tools.

## Troubleshooting

**Important**: See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues, solutions, and diagnostic tools.

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