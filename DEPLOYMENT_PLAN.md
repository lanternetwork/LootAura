# YardSaleFinder - Deployment Plan

## Target Stack

- **Hosting**: Vercel (Next.js hosting)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Maps**: Google Maps (JavaScript API + Places API + Geocoding API)
- **Monitoring**: Sentry (error tracking)
- **Analytics**: Web Vitals + Custom events
- **Rate Limiting**: Upstash Redis (production)

## Pre-Deploy Checklist

### Repository State ✅
- [x] **Default branch**: `main` (consolidated from `master`)
- [x] **CI/CD**: GitHub Actions workflow active (`.github/workflows/ci.yml`)
- [x] **Branch protection**: Ready to enable (see plan.md)
- [x] **Code quality**: All tests passing, TypeScript strict mode

### Domain & Auth ✅
- [x] **Custom Domain**: Add `lootaura.com` in Vercel → Project → Domains
- [x] **DNS**: Point `lootaura.com` (A/AAAA or CNAME) to Vercel
- [x] **Supabase Auth Redirects**: Add `https://lootaura.com/*` to Redirect URLs

### Required Environment Variables

#### Production Environment Variables
```bash
# Supabase (Public - safe to expose)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Supabase (Server-only - never expose)
SUPABASE_SERVICE_ROLE=your_service_role_key

# Google Maps (Public - safe to expose)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_key

# Optional: Nominatim fallback (Server-only)
NOMINATIM_APP_EMAIL=your-email@domain.com

# Push Notifications (Optional)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key

# Monitoring (Optional)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn

# Rate Limiting (Production)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

# SEO & Marketing
NEXT_PUBLIC_SITE_URL=https://lootaura.com
```

#### Preview Environment Variables
```bash
# Same as production but with preview-specific values
NEXT_PUBLIC_SITE_URL=https://lootaura.com
```

### Supabase Configuration

#### Database Migrations
Run these migrations in order:
1. `supabase/migrations/001_initial_schema.sql` - Core database schema
2. `supabase/migrations/002_performance_indexes.sql` - Performance optimization
3. `supabase/migrations/003_push_notifications.sql` - Push notification support

#### Storage Bucket Setup
- **Bucket name**: `sale-photos`
- **Access**: Public read, authenticated write
- **URL pattern**: `https://*.supabase.co/storage/v1/object/public/sale-photos/**`

#### RLS Policies
- **yard_sales**: Public read, authenticated write with owner_id
- **favorites**: User-specific read/write
- **reviews**: Public read, authenticated write with owner_id
- **push_subscriptions**: User-specific read/write

### Google Maps Configuration

#### APIs to Enable
- **Maps JavaScript API**: For map display
- **Places API**: For address autocomplete
- **Geocoding API**: For address to coordinates conversion

#### API Key Restrictions
- **HTTP referrers**: `https://lootaura.com/*`
- **IP addresses**: Vercel server IPs (if needed)
- **API restrictions**: Maps JavaScript API, Places API, Geocoding API

## Deploy Steps

### 1. Create Vercel Project

1. **Go to Vercel Dashboard**
   - Visit [vercel.com](https://vercel.com)
   - Sign in with GitHub account

2. **Import Project**
   - Click "New Project"
   - Select "Import Git Repository"
   - Choose `lanternetwork/YardSaleTracker` repository
   - Click "Import"

3. **Configure Project Settings**
   - **Framework Preset**: Next.js
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm ci`

### 2. Configure Environment Variables

1. **Go to Project Settings**
   - Click on your project
   - Go to "Settings" tab
   - Click "Environment Variables"

2. **Add Production Variables**
   ```
   NEXT_PUBLIC_SUPABASE_URL = https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = your_anon_key
   SUPABASE_SERVICE_ROLE = your_service_role_key
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = your_google_maps_key
   NOMINATIM_APP_EMAIL = your-email@domain.com
   NEXT_PUBLIC_SITE_URL = https://lootaura.com
   ```

3. **Add Preview Variables** (same as production)

### 3. Deploy to Production

1. **Trigger Deployment**
   - Push to `main` branch
   - Vercel will automatically deploy

2. **Verify Deployment**
   - Check build logs for errors
   - Verify all environment variables are loaded
   - Test health endpoint: `https://lootaura.com/api/health`

### 4. Configure Custom Domain (Optional)

1. **Add Domain**
   - Go to "Domains" tab in project settings
   - Add custom domain `lootaura.com`
   - Follow DNS configuration instructions

2. **Update Environment Variables**
   - Update `NEXT_PUBLIC_SITE_URL` to `https://lootaura.com`
   - Redeploy to apply changes

## Post-Deploy Validation

### Manual QA Script (lootaura.com)

1. **Basic Functionality**
   - [ ] Visit homepage: `https://lootaura.com`
   - [ ] Navigate to explore: `https://lootaura.com/explore`
   - [ ] Test sign in: `https://lootaura.com/signin`

2. **Add Sale Flow**
   - [ ] Sign in with test account
   - [ ] Navigate to Add tab: `https://lootaura.com/explore?tab=add`
   - [ ] Fill out form with test data
   - [ ] Submit and verify success message

3. **List & Map Display**
   - [ ] Check List tab shows new sale
   - [ ] Check Map tab shows marker
   - [ ] Click marker to see details

4. **Details Page**
   - [ ] Click "View Details" on a sale
   - [ ] Verify all fields display correctly
   - [ ] Test "Get Directions" link

5. **Favorites & Reviews**
   - [ ] Add sale to favorites
   - [ ] Check favorites page
   - [ ] Add a review
   - [ ] Verify review appears

6. **Optional Features**
   - [ ] Test PWA installation
   - [ ] Test push notifications
   - [ ] Test offline functionality

### Automated Validation

```bash
# Health check
curl https://lootaura.com/api/health

# Expected response:
{
  "ok": true,
  "timestamp": "2025-01-27T...",
  "database": "connected"
}
```

## Rollback Plan

### Immediate Rollback
1. **Revert to Previous Deployment**
   - Go to Vercel dashboard
   - Click on project
   - Go to "Deployments" tab
   - Click "Promote to Production" on previous deployment

2. **Environment Variable Rollback**
   - Revert environment variables to previous values
   - Redeploy if necessary

### Feature Flags (if implemented)
- Use environment variables to disable features
- Example: `DISABLE_SCRAPER=true` to disable Craigslist import

## Cost & Quota Management

### Monthly Cost Estimates
- **Vercel**: $0 (Hobby plan) to $20 (Pro plan)
- **Supabase**: $25 (Pro plan) to $200 (high usage)
- **Google Maps**: $10-50 (depending on usage)
- **Upstash Redis**: $0-10 (depending on usage)
- **Sentry**: $0-26 (depending on plan)

### Quota Monitoring
- **Vercel**: 100GB bandwidth, 100GB-hours function execution
- **Supabase**: 8GB database, 100GB storage, 500k requests
- **Google Maps**: 28k loads, 1k requests per month (free tier)
- **Upstash**: 10k requests per day (free tier)

### Cost Optimization
- **Geocoding**: Write-time only (100x cost reduction)
- **Maps**: Dynamic import (50% cost reduction)
- **Images**: Next.js optimization (70% cost reduction)
- **Database**: Efficient queries with indexes (60% cost reduction)
- **Caching**: Multi-layer caching (80% cost reduction)

## Security Configuration

### Content Security Policy
- **Script sources**: `'self'`, Google Maps APIs
- **Image sources**: `'self'`, `data:`, `https:`, `blob:`
- **Connect sources**: `'self'`, Supabase domains
- **Frame sources**: `'self'`, Google Maps

### Security Headers
- **X-Frame-Options**: DENY
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: strict-origin-when-cross-origin
- **HSTS**: Enabled in production
- **X-XSS-Protection**: 1; mode=block

### Rate Limiting
- **API endpoints**: 100 requests per minute
- **Auth endpoints**: 10 requests per minute
- **Search endpoints**: 50 requests per minute
- **Upload endpoints**: 20 requests per minute

### Authentication
- **Supabase Auth**: JWT-based authentication
- **RLS policies**: Owner-based access control
- **Service role**: Server-only, never exposed to client

## Monitoring & Alerts

### Error Monitoring
- **Sentry**: Automatic error tracking
- **Web Vitals**: Performance monitoring
- **Custom events**: User actions and business metrics

### Performance Monitoring
- **Core Web Vitals**: LCP, FID, CLS
- **API response times**: Database and external API calls
- **Build times**: Deployment performance

### Cost Monitoring
- **Database usage**: Query volume and optimization
- **Maps API usage**: Loads and requests per user
- **Storage usage**: Image and data storage growth
- **Bandwidth**: CDN and API usage

### Alerts to Configure
- **Error rate**: > 1% errors
- **Response time**: > 5 seconds
- **Cost thresholds**: $50, $100, $200 monthly
- **Quota usage**: > 80% of limits

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check environment variables
   - Verify Node.js version (18.x)
   - Check for TypeScript errors

2. **Runtime Errors**
   - Check Supabase connection
   - Verify Google Maps API key
   - Check RLS policies

3. **Performance Issues**
   - Monitor database queries
   - Check image optimization
   - Verify caching configuration

5. **Map/List Sync (MAP Authority) – Debug Playbook**
   - Verify middleware allows public assets (`/_next/*`, `/manifest.json`) and GET sales endpoints.
   - In MAP authority, wide sales fetches are suppressed; list derives from map-visible pin IDs.
   - DOM checks (open Elements):
     - Ensure `[data-debug="sales-list"]` container exists and is above the map (z-index).
     - Confirm a badge inside the list shows `MAP LIST: K` for visible pins.
     - Each rendered item has a wrapper with `[data-sale-id]`; expect K nodes.
   - Logs to expect on pan:
     - `[LIST] visible pins seq=… count=K ids=[…]`
     - `[LIST][MAP] seq=… ids.count=K haveInDict=K missing=[]`
     - `[LIST] update (map) … rendered=K`
     - `[DOM] list item rendered id=…` (K lines) and `[DOM] item mounts id=…` (K lines)
     - `[DOM] nodes in panel = K expected = K` (heights > 0)
   - If nodes == K but invisible: check container height/overflow/z-index; temporarily set `min-height:240` and a background tint.
   - If nodes < K: ensure items are wrapped in real DOM elements (no Fragments), and `data-sale-id` is on those elements.

4. **Security Issues**
   - Check CSP policies
   - Verify rate limiting
   - Review RLS policies

### Support Contacts
- **Vercel**: [Vercel Support](https://vercel.com/support)
- **Supabase**: [Supabase Support](https://supabase.com/support)
- **Google Maps**: [Google Cloud Support](https://cloud.google.com/support)

## Success Criteria

### Technical Success
- [ ] Build time < 5 minutes
- [ ] Page load time < 3 seconds
- [ ] Error rate < 1%
- [ ] Uptime > 99.5%

### User Experience Success
- [ ] All core flows work end-to-end
- [ ] Mobile experience is smooth
- [ ] Offline functionality works
- [ ] PWA installation works

### Business Success
- [ ] Users can create accounts
- [ ] Users can post sales
- [ ] Users can browse and search
- [ ] Users can favorite sales

The deployment plan is designed to be comprehensive yet straightforward, ensuring a smooth transition to production with minimal risk.
