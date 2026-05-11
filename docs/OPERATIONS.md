# Operations Guide

**Last updated: 2025-01-31**

## Rate Limiting Operations

### Policy Tuning

Rate limiting policies can be adjusted in `lib/rateLimit/policies.ts`:

```typescript
export const Policies = {
  AUTH_DEFAULT: { name: 'AUTH_DEFAULT', limit: 5, windowSec: 30, scope: 'ip' },
  // ... other policies
}
```

**Common Tuning Scenarios:**

- **High Auth Failures**: Increase `AUTH_DEFAULT.limit` or `AUTH_HOURLY.limit`
- **Map Panning Issues**: Increase `SALES_VIEW_30S.limit` or adjust `burstSoft`
- **Geocoding Bottlenecks**: Increase `GEO_ZIP_SHORT.limit` or `GEO_ZIP_HOURLY.limit`
- **Mutation Spam**: Decrease `MUTATE_MINUTE.limit` or `MUTATE_DAILY.limit`

### Reading Rate Limit Headers

All API responses include rate limiting headers:

```
X-RateLimit-Limit: 5          # Maximum requests allowed
X-RateLimit-Remaining: 3      # Requests remaining in window
X-RateLimit-Reset: 1640995200 # Unix timestamp when window resets
X-RateLimit-Policy: AUTH_DEFAULT 5/30  # Policy name and limits
Retry-After: 30               # Seconds to wait (429 responses only)
```

**Header Interpretation:**
- `Remaining: 0` + No `Retry-After` = Soft limit (burst allowed)
- `Remaining: 0` + `Retry-After` = Hard limit (blocked)
- `Remaining > 0` = Within limits

### Flipping the Rate Limit Flag

**Enable Rate Limiting:**
```bash
# In Vercel dashboard
RATE_LIMITING_ENABLED=true

# Or via CLI
vercel env add RATE_LIMITING_ENABLED true production
```

**Disable Rate Limiting:**
```bash
# Remove the environment variable
vercel env rm RATE_LIMITING_ENABLED production

# Or set to false
vercel env add RATE_LIMITING_ENABLED false production
```

**Verification:**
```bash
# Check if rate limiting is active
curl -I https://your-domain.com/api/auth/signin

# Should see X-RateLimit-* headers when enabled
# Should NOT see X-RateLimit-* headers when disabled
```

### Upstash Redis Setup

1. **Create Upstash Database:**
   - Go to [Upstash Console](https://console.upstash.com/)
   - Create new Redis database
   - Choose region closest to your Vercel deployment

2. **Get Credentials:**
   ```bash
   # Copy from Upstash dashboard
   UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token
   ```

3. **Configure Vercel:**
   ```bash
   vercel env add UPSTASH_REDIS_REST_URL "https://your-db.upstash.io" production
   vercel env add UPSTASH_REDIS_REST_TOKEN "your-token" production
   ```

4. **Test Connection:**
   ```bash
   # Check admin tools at /admin/tools
   # Should show "Upstash Redis" backend when configured
   ```

### Monitoring Rate Limits

**Admin Tools Dashboard:**
- Visit `/admin/tools` (debug mode only)
- View "Rate Limiting Status" tile
- Shows: enabled/disabled, backend type, active policies, recent blocks

**Log Monitoring:**
Rate-limited requests are logged with the following format:
```
[RATE_LIMIT] Request rate-limited: policy=AUTH_DEFAULT, scope=ip, key=ip:192.168.1.1, remaining=0, resetAt=2025-01-31T12:00:00.000Z
```

**Metrics Collection:**
- Rate limit blocks are logged to performance metrics
- Available via `/api/performance/metrics` endpoint
- Can be integrated with monitoring systems

### Troubleshooting

**Common Issues:**

1. **Rate Limiting Not Working:**
   - Check `NODE_ENV === 'production'`
   - Verify `RATE_LIMITING_ENABLED === 'true'`
   - Confirm Redis credentials are set

2. **Too Many 429s:**
   - Check if limits are too strict
   - Verify legitimate users aren't being blocked
   - Consider increasing limits or adjusting windows

3. **Redis Connection Issues:**
   - Verify Upstash credentials
   - Check network connectivity
   - System falls back to in-memory storage

4. **Headers Missing:**
   - Rate limiting is bypassed (check environment)
   - Headers only present when rate limiting is active

**Debug Commands:**
```bash
# Test rate limiting locally
NODE_ENV=production RATE_LIMITING_ENABLED=true npm run dev

# Check environment variables
vercel env ls production

# Test specific endpoint
curl -v https://your-domain.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

### Performance Considerations

**Redis vs Memory:**
- **Redis**: Production-ready, persistent, shared across instances
- **Memory**: Development-only, resets on restart, single instance

**Window Size Impact:**
- Smaller windows = more precise limiting but higher Redis usage
- Larger windows = less Redis usage but less precise limiting

**Policy Complexity:**
- Multiple policies per endpoint = more Redis calls
- Consider combining policies when possible

### Security Considerations

**IP Spoofing:**
- Rate limiting trusts `X-Forwarded-For` headers
- Ensure reverse proxy strips untrusted headers
- Consider additional validation for sensitive endpoints

**User-Based Limits:**
- Mutation limits use user ID when authenticated
- Falls back to IP when no session
- Prevents authenticated users from bypassing limits

**Bypass Controls:**
- Rate limiting disabled by default
- Only enabled in production with explicit flag
- Preview deployments bypass unless explicitly enabled

## Image Monitoring

### Image Validation Logging

Image validation failures are logged when invalid image URLs are submitted:

**Format:**
```
[SALES][IMAGE_VALIDATION] Rejected cover_image_url: url=https://example.com/image.jpg, user=user-id, reason=invalid_url_format
[SALES][IMAGE_VALIDATION] Rejected image URL in images array: url=https://example.com/image.jpg, user=user-id, reason=invalid_url_format
```

**Monitoring:**
- Logs include URL, user ID, and rejection reason
- Can be filtered in log aggregation tools
- Useful for identifying potential security issues or user errors

**Common Reasons:**
- `invalid_url_format`: URL is not a valid Cloudinary URL
- URL does not match Cloudinary domain pattern
- Malformed URL structure

### Admin Tools Image Statistics

**Location:** `/admin/tools` → "Image Statistics" section

**Displays:**
- Total sales count
- Sales with cover images (count and percentage)
- Sales with images array (count and percentage)
- Sales using placeholders (count and percentage)
- Last 10 sales with image details:
  - Sale ID and title
  - Cover image URL (if present)
  - Images array count
  - Placeholder usage status
  - Display cover URL (actual URL used for rendering)

**Use Cases:**
- Monitor image adoption rate
- Identify sales needing images
- Track placeholder usage
- Verify image URL correctness

**API Endpoint:**
- `/api/admin/images-stats`
- Returns JSON with statistics and recent sales data
- Requires admin access

### Image Validation Rules

All image URLs must:
- Be valid Cloudinary URLs (`res.cloudinary.com`)
- Match the configured Cloudinary cloud name
- Use HTTPS protocol
- Not contain external domains

See [docs/IMAGES.md](docs/IMAGES.md) for complete image management documentation.

## Sentry Monitoring

### Sentry Setup

1. **Get Sentry DSN:**
   - Create project at [sentry.io](https://sentry.io)
   - Copy DSN from project settings

2. **Configure Environment Variable:**
   ```bash
   NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id
   ```

3. **Verify Integration:**
   - Check Sentry dashboard for events
   - Test error tracking by triggering an error

### Monitoring

**Error Tracking:**
- Client-side errors automatically captured
- Server-side errors in API routes captured
- Source maps for better stack traces

**Performance Monitoring:**
- Page load times tracked
- API response times monitored
- User transaction tracing

**Log Levels:**
- Errors automatically sent to Sentry
- Warnings and info logs only in debug mode
- No PII in error reports

## Debug Mode

### Enabling Debug Mode

Set `NEXT_PUBLIC_DEBUG=true` in environment variables to enable:
- Detailed console logging
- Admin tools access at `/admin/tools`
- Extended error messages
- Development diagnostics

**Warning:** Debug mode should only be enabled in development/staging environments, not production.

### Admin Tools

Access debug tools at `/admin/tools` when debug mode is enabled:
- Cloudinary diagnostics
- Image statistics
- Rate limiting status
- Environment variable display
- Health check links

## Ingestion integrity (read-only)

**Endpoint:** `GET /api/admin/ingestion/integrity`  
**Auth:** Same as other admin APIs — must satisfy `assertAdminOrThrow` (admin session / credentials as configured).

**What it does:** Calls database function `lootaura_v2.ingestion_integrity_report()` (migration `168_ingestion_integrity_report_rpc.sql`). No mutations. Response shape:

- `ok` — `true` only when every **hard** check passes.
- `hardFailures` — human-readable lines for failed hard checks (expect empty when healthy).
- `warnings` — investigate-only signals (does **not** set `ok` to false today).
- `checks` — structured per-check results (`id`, `level`, `ok`, optional `detail`).

**Hard checks (must be clean in production):**

1. **No duplicate non-null `sales.ingested_sale_id`** — duplicate group count must be **0**. Non-zero means publish idempotency is broken (historically when `idx_sales_ingested_sale_id_unique` was missing). The partial unique index `idx_sales_ingested_sale_id_unique` on `lootaura_v2.sales(ingested_sale_id) WHERE ingested_sale_id IS NOT NULL` is required so repeated publish attempts surface as `23505` and the worker can reuse the existing sale row.
2. **No orphan `ingested_sales.published_sale_id`** — every non-null `published_sale_id` must reference an existing `sales.id`.
3. **No orphan `sales.ingested_sale_id`** — every non-null `ingested_sale_id` must reference an existing `ingested_sales.id`.
4. **Critical indexes present** — allowlist includes `idx_sales_ingested_sale_id_unique`, `sales_geom_gist_idx`, `idx_ingested_sales_publish_worker_claim`, `idx_ingested_sales_geocode_claim`. A missing row means **schema drift** (migration not applied or index renamed); fix by aligning DB with repo migrations, not by changing app code.

**Warning check (investigate only):**

- **Duplicate `external_source_url`** among **published** rows classified as imported: `import_source IS NOT NULL OR ingested_sale_id IS NOT NULL`. Non-zero group counts can be legitimate edge cases or bad data; use `checks[].detail.samples` (truncated URLs) to triage. This does **not** fail `ok`.

**Healthy output:** `ok: true`, `hardFailures: []`, `warnings` usually `[]` (warnings non-empty is acceptable while investigating URL duplicates). Optional `?debug=1` adds `raw` DB JSON for operators.

**If duplicates on `ingested_sale_id` reappear:** treat as P0 — verify the unique index exists, run duplicate-repair migration path if needed, and inspect publish worker / ingestion for paths that bypass conflict handling.

**How to run (example):** from a browser or HTTP client where you already have an admin session cookie, `GET` the URL above on your deployment (e.g. production or preview). There is no separate CLI; apply migration `168` before relying on this endpoint.
