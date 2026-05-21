# Operations Guide

**Last updated: 2026-05-13**

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

## Admin ZIP import (`upsert_zipcodes`) — RPC execute privileges

**Migrations:** `053_insert_zipcodes_rpc.sql` (defines `public.upsert_zipcodes(jsonb)`), `173_restrict_upsert_zipcodes_execute_service_role_only.sql` (locks down `EXECUTE`).

**Security decision:** The function is `SECURITY DEFINER` and bulk-writes `lootaura_v2.zipcodes`. It must **not** be executable by PostgREST `anon` or `authenticated` JWTs (any browser could otherwise call `rpc('upsert_zipcodes', …)` with the public anon key). Only **`service_role`** may execute it.

**App path:** `POST /api/admin/zipcodes/import` uses the server-only admin Supabase client (`SUPABASE_SERVICE_ROLE_KEY`) after `assertAdminOrThrow`. Do not expose a public or user-JWT path to this RPC.

## Sale listing public visibility (Phase 4)

**Migration:** `172_sales_phase4_public_visibility_ends_at.sql`

**Database predicate** for anon/authenticated **non-owner** reads on `lootaura_v2.sales` (`sales_public_read`) and for `lootaura_v2.is_sale_publicly_visible` (drives `items_public_read`):

- `status = 'published'`
- `archived_at IS NULL`
- `(ends_at IS NULL OR ends_at > now())` — rows with `ends_at <= now()` are not public; strictly future `ends_at` is public.
- `moderation_status IS DISTINCT FROM 'hidden_by_admin'` — admin-hidden listings stay hidden at the RLS layer (aligned with app filters).

**Transition:** Rows with `ends_at IS NULL` remain **visible** to the public until backlog/backfill is complete; a later phase will fail-close NULL `ends_at` after operators confirm zero backlog (not part of Phase 4).

**App layer:** Public map/search/count/list routes apply the same filters via `applyPhase4PublicPublishedSaleReadFilters` (`lib/sales/phase4PublicPublishedSaleReadFilters.ts`) so service-role or explicit queries stay aligned with RLS. Owner dashboard routes and admin APIs are unchanged.

**Caching:** `GET /api/sales` cache keys include a coarse `phase4LiveBucket` (30s) so short-TTL cached payloads cannot list sales as live for an unbounded time after `ends_at` passes.

**Rollout:** Apply migration `172` to the database before relying on DB-side enforcement; deploy app changes in the same release window. Verify `pending_via_ends_at` / archive jobs as usual; Phase 4 does not remove the legacy archive fallback.

## Tier 0 observability (structured logs, Phase A)

**Purpose:** One JSON line per telemetry record on stdout when enabled, so Vercel and log drains can alert without changing business behavior. No third-party metrics vendors and no OpenTelemetry in this phase.

### Enabling emission

- **`NODE_ENV === 'test'`:** telemetry JSON is **off** (keeps unit and integration output clean).
- **Production:** telemetry JSON is **off** unless `LOG_TELEMETRY_JSON=1` is set (avoids surprise stdout volume).
- **Non-production:** telemetry JSON defaults **on** (unless `NODE_ENV` is `test`).

Records are written by `emitObservabilityRecord` (`lib/observability/emit.ts`) as a single JSON object per line with a leading `t` ISO timestamp field.

### Event taxonomy (summary)

| Area | Example `event` values | Typical fields |
|------|------------------------|----------------|
| Ingestion | `ingestion.orchestration.started` / `completed`, `ingestion.external_page_source.*` | `mode`, `durationMs`, counts, `ok` |
| Geocode | `geocode.worker.batch_*`, `geocode.queue.batch_completed` | `claimed`, `batchSize`, `durationMs`, `queuePressureClass`, Redis depths |
| Publish | `publish.worker.batch_completed` | `attempted`, `succeeded`, `failed`, `skipped`, `expired`, `durationMs` |
| Archive | `archive.sales.batch_iteration`, `job_summary`, `stale_pending_after_job`, `max_iterations` | `archived`, `batchesRun`, `stalePendingTotalAfter`, `maxIterationsHit` |
| Parser / source | `parser.source.*`, `parser.fixture.*`, `ingestion.external_page_source.persist_summary` | `parserVersion`, `adapter`, `pageHostHash` (no raw HTML), duplicate counts, `parseDurationMsTotal` |
| Queue | Geocode queue batch events include depth and pressure | `queueDepthBeforeTotal`, `redisStarvationSignal` |
| API | `api.sales.*.latency`, `api.cron.daily.hit`, `api.cron.geocode.hit`, `api.admin.archive.trigger.hit` | `durationMs`, `cacheHit`, `resultCount`, `errorCount`, `degradedMode`, `phase` |

Canonical names live in `lib/observability/events.ts` (`ObservabilityEvents`).

### Correlation model

`createCorrelationBundle` and `mergeCorrelation` (`lib/observability/correlation.ts`) standardize:

- **`requestId`** — HTTP or synthetic cron id (often equals `operationId` on cron).
- **`operationId`** — logical run id (`generateOperationId` when not supplied).
- **`correlationId`** — UUID for cross-service correlation within a run.
- **`workerId`** — optional (for example region); not required on Vercel.
- **`jobType`** — semantic label (`ingestion.orchestration`, `cron.geocode`, `archive.sales`, and similar).

Daily cron builds one bundle and passes the same ids into archive, ingestion persist, geocode backlog, and publish so a single filter by `correlationId` reconstructs the run.

### Queue health (geocode)

- **`geocode.queue.batch_completed`:** `dequeued`, `completed`, `requeued`, `queueDepthBeforeTotal` / `queueDepthAfterTotal`, `queuePressureBefore` / `queuePressureAfter`, `redisStarvationSignal` when nothing was available to process.
- **`geocode.worker.batch_completed`:** DB claim batch; `dbBacklogDepletionSignal` when `claimed === 0`; `queuePressureClass` from claimed versus `batchSize` (a full batch suggests more work may remain).

### Archive telemetry

- **`archive.sales.batch_iteration`:** per RPC batch counts (`batchArchivedViaEndsAt`, `batchArchivedViaLegacyFallback`).
- **`archive.sales.job_summary`:** totals, `durationMs`, `stalePendingTotalAfter`, `maxIterationsHit`.
- **`archive.sales.stale_pending_after_job`:** pending rows still match archive criteria after the job; investigate locks, clock skew, or data drift.

### Public API latency

`api.sales.get.latency`, `api.sales.search.latency`, and `api.sales.markers.latency` include **`durationMs`**, **`cacheHit`** (sales list when short-TTL server cache hits), **`resultCount`**, **`errorCount`**, and **`degradedMode`** where applicable. No full query strings or street-level PII are logged.

### Parser and external source troubleshooting

1. **`ingestion.external_page_source.fetch_failed`** — transport or SSRF-safe fetch layer; check `errorCode`, `pageHostHash`, `pageIndex`.
2. **`ingestion.external_page_source.parse_failed`** — DOM parse or adapter fault; never includes raw HTML.
3. **`ingestion.external_page_source.zero_listings_page`** — successful parse but no listings (`invalidListingCount` may still be positive).
4. **`parser.source.duplicate_suppressed`** — URL or unique-constraint dedupe counts.
5. **`parser.source.normalization_warning`** — aggregated listing-level normalization signals (for example `cityConflict`).
6. **`parser.source.degraded` / `parser.source.failing` / `parser.source.recovered`** — aggregate parser/source health transitions (hostname hash only; no URLs, no HTML).
7. **`parser.fixture.stale`** — fixture `captured_at` age crossed the stale threshold (Tier 0 fixture freshness).

### Parser health, fixture freshness, and drift (Tier 0)

**Purpose:** Detect extraction drift and stale fixtures *before* silent parser decay. Scoring is **deterministic** (no ML). **Sparse transition reporting** fires only when aggregate health *changes* along allowed edges (see below)—not on every poll, fixture row, or parse.

**Semantics**

| Status | Meaning |
|--------|---------|
| **healthy** | Parser signals within thresholds; fixtures **fresh** (age below aging threshold). |
| **degraded** | Elevated parser rates (zero-listings, selector drift, duration, etc.) or **aging** fixtures—investigate before production impact. |
| **failing** | Invalid metrics, critical parser rates, **stale** fixtures (combined operational view), or invalid fixture metadata—**fail closed**; treat as extraction collapse risk. |

**Combined vs parser-only (admin API)** — `GET/POST /api/admin/parser-health` returns per-host **`parserStatus`** (classifier-only) and **`freshnessStatus`**, plus **`healthStatus`** internally for transitions. **Transition telemetry** uses the **combined** operational status (parser + freshness + invalid metadata), aligned with `combineParserHealthAndFreshness` in diagnostics aggregation.

**Sparse telemetry transitions** (`lib/parserRegression/reportParserHealth.ts`)

| Edge | Telemetry | Sentry (only if `report=1`) |
|------|-----------|------------------------------|
| **healthy → degraded** | `parser.source.degraded` | `captureMessage` (warning) |
| **→ failing** (from any non-failing, e.g. degraded or healthy) | `parser.source.failing` | `captureException` (synthetic error, stable fingerprint) |
| **degraded / failing → healthy** | `parser.source.recovered` | single `captureMessage` (info) |
| **Freshness → stale** (first time stale) | `parser.fixture.stale` | none |

- **Deduping:** in-memory cache per normalized host; **fingerprint** = host + combined status + freshness + **sorted reason tokens**. Repeated identical snapshots emit **nothing** (no per-row / per-fixture spam).
- **Cold start:** first observation **healthy + fresh** seeds the cache **without** emit (avoids noisy green dashboards).
- **Payloads:** `pageHostHash` and transition labels only—**no** raw HTML, **no** full URLs, **no** fixture bodies, **no** plaintext host in Sentry messages (hash in tags/extra only).
- **Tests:** `resetParserHealthReporterForTests()` clears the in-memory cache.

**`parser.fixture.stale` meaning** — At least one fixture for that host crossed the **stale** age threshold (`captured_at` vs evaluated time). Operators should refresh `raw.html` / `expected.json` and bump `captured_at` (see fixture refresh below).

**Fixture metadata (`metadata.json`)** — required fields for every parser regression fixture:

- **`captured_at`** — ISO 8601 capture time of the HTML snapshot (drives freshness).
- **`source_host`** — plain hostname only (no path/query); used for aggregation and diagnostics.

Optional: `parser_version`, `source_type`. Malformed metadata **fails** harness load and CI (no silent acceptance).

**Operator flow**

1. Call **`GET` or `POST /api/admin/parser-health`** (admin session or `CRON_SECRET` bearer). JSON response: **`ok`**, **`evaluatedAtMs`**, **`sources[]`**, **`summary`** (`healthy` / `degraded` / `failing` counts only). Each source includes **`sourceHost`**, **`parserStatus`**, **`freshnessStatus`**, **`score`**, **`reasons`**, **`fixtureCount`**. No raw HTML, no full URLs, no `pageHostHash` in this public JSON (hashes may appear only in structured logs).
2. For deeper triage, use **repo-local** diagnostics builders or logs—not the slim admin JSON—for invalid fixture paths and degradation hints.
3. If **`summary.failing`** or sustained **`summary.degraded`** — filter logs by **`pageHostHash`** on `parser.source.*` and `parser.fixture.stale` plus ingestion events (`ingestion.external_page_source.*`).
4. **`?report=1`** on the admin parser-health URL enables **optional Sentry** for the transitions above (default: structured telemetry only).

**Selector drift troubleshooting**

- Confirm **`parser.regression.fixture_mismatch`** (CI) or **`parser.source.extraction_failure`** / **`zero_listings_page`** in production logs for the same host hash.
- Re-capture **`raw.html`**, update **`expected.json`**, bump **`captured_at`**, and keep **`source_host`** aligned with the live listing hostname pattern.

**Fixture refresh process**

1. Fetch current page HTML (operator browser or approved tooling); store under `tests/fixtures/parsers/<adapter>/<case>/raw.html`.
2. Run the parser locally or via CI; update **`expected.json`** to match normalized output.
3. Set **`captured_at`** to the snapshot time and verify **`source_host`** matches the canonical hostname for aggregation.

Canonical event names: `lib/observability/events.ts` (`parser.source.degraded`, `parser.source.failing`, `parser.source.recovered`, `parser.fixture.stale`).

### YSTM 90% product coverage (Phases 1–5)

**Goal:** At least **90%** of **valid-active** YSTM listing URLs in the coverage audit footprint are **map-visible** on LootAura (`coveragePct ≥ 90`). This is **not** the detail-first parser SLO. Full program: `docs/YSTM_90_PERCENT_COVERAGE_SPEC.md`.

**Admin scoreboard:** `GET /api/admin/ingestion/ystm-coverage` (admin session). KPI fields: `validActiveYstmUrls`, `publishedVisibleInAuditFootprint`, `missingValidYstmUrls`, `coveragePct`.

**Production prerequisites**

1. Apply migrations **`196_ystm_coverage_audit_phase_1.sql`** through **`199_ystm_coverage_catalog_repair_phase_5.sql`**.
2. Confirm `lootaura_v2.ystm_coverage_observations` receives rows after audit runs (empty table ⇒ coverage % is null until Phase 1 runs).
3. Ensure crawlable `ingestion_city_configs` exist for `external_page_source` (discovery Phase 2).

**Scheduled crons** (`vercel.json`, `Authorization: Bearer <CRON_SECRET>`)

| UTC | Path | Phase |
|-----|------|-------|
| `0 4 * * *`, `0 16 * * *` | `/api/cron/discovery` | 2 — source expansion |
| `0 6 * * *`, `0 18 * * *` | `/api/cron/ystm-coverage-audit` | 1 — build audit footprint |
| `0 8 * * *`, `0 20 * * *` | `/api/cron/ystm-missing-ingest` | 3 — publish missing URLs |
| `0 10 * * *`, `0 22 * * *` | `/api/cron/ystm-existing-refresh` | 4 — refresh known URLs |
| `0 12 * * *`, `0 14 * * *` | `/api/cron/ystm-catalog-repair` | 5 — repair stuck ingest |

**Default budgets (repo burn-in; override via env)**

| Phase | Key variables | Defaults (cap) |
|-------|---------------|----------------|
| 1 Audit | `CRON_YSTM_COVERAGE_MAX_CONFIGS`, `MAX_LIST_FETCHES`, `MAX_DETAIL_VALIDATIONS`, `MAX_URLS_PER_LIST_PAGE` | 24 (40), 40 (80), 80 (120), 120 (200) |
| 2 Discovery | `CRON_DISCOVERY_MAX_STATES_PER_RUN`, `MAX_DISCOVERED_PAGES`, `MAX_VALIDATION_FETCHES`, `MAX_REVALIDATION_CONFIGS`, `MAX_PLACEHOLDER_REPAIR_CONFIGS` | 10 (15), 200 (500), 120 (200), 120 (200), 120 (200) |
| 3 Missing ingest | `CRON_YSTM_MISSING_INGEST_MAX_ATTEMPTS`, `MAX_SCANNED` | 48 (60), 160 (200) |
| 4 Existing refresh | `CRON_YSTM_EXISTING_REFRESH_MAX_ATTEMPTS`, `MAX_SCANNED` | 32 (80), 120 (200) |
| 5 Catalog repair | `CRON_YSTM_CATALOG_REPAIR_MAX_ATTEMPTS`, `MAX_SCANNED` | 60 (100), 160 (250) |

- Catalog-repair cron prioritizes **never-attempted** rows, then **`publish_failed`** before **`needs_check`**; watch `catalogRepairQueue` on the scoreboard (baseline **294**).

**Operational checks**

- After deploy, manually invoke once: `GET /api/cron/ystm-coverage-audit` with cron auth; confirm JSON `listingUrlsDiscovered > 0` and SQL `valid_active_v` increases.
- Missing-ingest cron scans **never-attempted** URLs first (`missing_ingestion_attempted_at` nulls-first) before failed retries; watch `missingIngestionNeverAttempted` on the scoreboard.
- Existing-refresh cron prioritizes **stale/never-synced** rows, then **published** ingested sales; watch `existingRefreshStale` and `neverSynced` on the scoreboard.
- If `coveragePct` stays null with `valid_active_v = 0`, fix migrations/cron before tuning missing-ingest.
- Reduce defaults toward spec “steady state” after `coveragePct ≥ 90` for 14 days.

### External source discovery — nationwide registry automation (Phase 4)

**Purpose:** Keep `ingestion_city_configs` for `external_page_source` self-maintaining: discover new external source city list pages, validate, promote crawlable URLs, revalidate/repair stale rows, and mark unresolved placeholders failed without deleting rows or touching manual configs.

**Scheduled production runner:** `GET` or `POST` **`/api/cron/discovery`** — **`Authorization: Bearer <CRON_SECRET>`** only. Declared in **`vercel.json`** (default **daily at 04:00 UTC**, `0 4 * * *`). Response and telemetry are **aggregate-only** (no raw URLs, HTML, or city page payloads).

#### Lifecycle per run

1. **Lease acquire** — `ingestion_discovery_state` key `source_discovery_nationwide` (overlap prevention + stale lock recovery).
2. **Discover** — bounded batch of USPS states from persisted `state_cursor` (round-robin; does not rescan all states each run).
3. **Validate** — Phase 1 validator + SSRF-safe fetch (`fetchSafeExternalPageHtml`).
4. **Promote** — writes validated candidates to `ingestion_city_configs` (never overwrites `manual`).
5. **Revalidate/heal** — repairs stale URLs, normalizes malformed city names, marks unresolved placeholders `failed`.
6. **Cursor advance** — `state_cursor` moves forward for fair nationwide progression.

#### Remediation semantics

| Status / field | Meaning |
|----------------|---------|
| `pending` | Empty placeholder awaiting discovery |
| `validated` | Promoted/healed crawl target |
| `failed` | Automated discovery/healing could not resolve |
| `manual` | Operator-owned; cron never mutates |
| `source_crawl_excluded_at` | Excluded from crawlable ingestion rotation (row stays enabled; not deleted) |

Placeholder policy: after discovery attempt, unresolved placeholders become `failed` with `placeholder_unresolved`; when failure count meets threshold (default **1**), `source_crawl_excluded_at` is set so daily ingestion cursor skips them.

#### Environment tuning

| Variable | Default | Cap | Role |
|----------|---------|-----|------|
| `CRON_DISCOVERY_MAX_STATES_PER_RUN` | 10 | 15 | State index batch size |
| `CRON_DISCOVERY_MAX_DISCOVERED_PAGES` | 200 | 500 | City link cap per run |
| `CRON_DISCOVERY_MAX_VALIDATION_FETCHES` | 120 | 200 | Page validation fetch budget |
| `CRON_DISCOVERY_MAX_REVALIDATION_CONFIGS` | 40 | 200 | Healing row budget |
| `CRON_DISCOVERY_MAX_PLACEHOLDER_REPAIR_CONFIGS` | 120 | 200 | Empty `source_pages` repair per run |
| `CRON_DISCOVERY_LEASE_SECONDS` | 300 | 900 | Overlap lock TTL |
| `CRON_DISCOVERY_MAX_RUNTIME_MS` | 240000 | 300000 | Wall-clock cap (graceful degradation) |
| `CRON_DISCOVERY_PLACEHOLDER_EXCLUDE_AFTER_FAILURES` | 1 | 5 | Failures before crawl exclusion |

#### Telemetry

Event: **`source.discovery.cron_completed`**. JSON fields include `statesScanned`, `configsPromoted`, `configsRepaired`, `configsFailed`, `placeholdersUnresolved`, `crawlableConfigCount`, `failedConfigCount`, `discoveryLatencyMs`, `repairRate`, `overlapPrevented`, `phasesCompleted`.

#### Operational recovery

- **Overlapping runs:** Response `skipped: true`, `overlapPrevented: true` — expected; wait for lease expiry or investigate stuck lease.
- **Stuck lease:** Stale lease recovery runs automatically when `lease_expires_at` is in the past; confirm `CRON_DISCOVERY_LEASE_SECONDS` and clock skew.
- **Degraded run:** `degraded: true` when a phase fails or runtime budget exits early; inspect logs under `ingestion/discovery/runSourceDiscoveryCron` (aggregate fields only).
- **Manual cities:** Always protected; use `source_discovery_status = manual` for operator URLs.

Schema: migration **`177_ingestion_discovery_state_and_crawl_exclusion.sql`**, discovery status columns from **`176_ingestion_city_configs_source_discovery.sql`**. Apply **`178_discovery_state_key_rename.sql`** in production if `ingestion_discovery_state` still has legacy key `ystm_nationwide` (renames to `source_discovery_nationwide`; runtime also migrates on first cron acquire).

### External source reconciliation — Phase 1B (detection-only runner)

**Purpose:** Run **bounded** reconciliation in production. By default the runner is **detection-only** (Phase 1B): it refreshes server-supported sources, classifies drift, and can persist metadata on **`ingested_sales`** without touching public **`sales`**. Optional **Phase 2A** (`applySafeSync: true` with `dryRun: false`) applies **gated** updates to **existing linked published sales** only (see Phase 2A runbook below). Neither phase performs cancellation, archive-on-source-removal, or address relocation.

**Related:** `GET /api/admin/reconciliation/health` (ingest-side health snapshot). Phase 1B **runner** is `POST /api/admin/reconciliation/run`.

**Scheduled production runner (repo-owned):** `GET` or `POST` **`/api/cron/reconciliation`** — **`Authorization: Bearer <CRON_SECRET>`** only. Each invocation runs bounded reconciliation with **`dryRun: false`**, **`applySafeSync: true`**, and **`aggregateTelemetryOnly: true`** (aggregate counters only in JSON and telemetry; no raw URLs, descriptions, or HTML). Default batch size is **20** per run (hard-capped at **100**; override with `CRON_RECONCILIATION_BATCH_LIMIT`). Declared in **`vercel.json`** (default **hourly at :30 UTC** as minute `30 * * * *` — not more frequent than ingestion crons; adjust if needed). Candidate selection uses deterministic SQL ordering + persisted keyset cursor (see migration `175_reconciliation_candidate_coverage.sql` and `RECONCILIATION_CANDIDATE_POOL_MAX`).

#### Authentication and limits

- **Admin session** or **`Authorization: Bearer <CRON_SECRET>`** (optional cron-style invocation; no new schedules are required for Phase 1B).
- Rate limiting matches other admin tooling: `ADMIN_TOOLS` and `ADMIN_HOURLY` (see `lib/rateLimit/policies.ts`).

#### Request body (JSON)

| Field | Default | Notes |
|--------|---------|--------|
| `limit` | `25` | Hard-capped at **100** per request. |
| `dryRun` | **`true`** | Must send **`"dryRun": false`** explicitly to allow metadata writes. |
| `sourcePlatform` | omitted | If set, only ingest rows whose `source_platform` matches (trimmed string). |
| `onlyPlaceholder` | `false` | If **`true`**, only candidates that are placeholder-flagged or detectable as placeholders. |

Candidate ordering stays **deterministic** (same selection ordering as the worker; the run applies `limit` to the head of that ordered list).

#### Dry run vs metadata persistence

- **`dryRun: true` (default):** Fetches and parses where the source is **server refetch supported**; computes fingerprints, classification, and all aggregate counters. **Does not persist** reconciliation metadata on `ingested_sales` (no side effects on stored reconciliation fields from this mode).
- **`dryRun: false`:** May **persist only** `ingested_sales` reconciliation / sync metadata (same ingest-only columns as Phase 1A-style reconciliation). **Does not** write to public **`sales`**.

The JSON response includes **`persistenceApplied`**: `true` only when the run was not a dry run and at least one ingest row received a successful metadata write.

#### Response counters (aggregate only)

Responses and Phase 1B telemetry intentionally omit raw URLs, raw descriptions, and raw HTML.

- **`attempted`** — Rows matching filters after linked ingest load (full candidate set for this run’s filter).
- **`processed`** — Rows actually evaluated in this request: `min(attempted, limit)`.
- **`changed` / `unchanged` / `failed`** — Outcome buckets for the processed batch.
- **`parseFailed`** — Reconciliation parse did not yield a usable listing snapshot (investigate parser health and source DOM drift; use fixture and parser ops above—not raw page dumps in logs).
- **`sourceMissingSoft`** — Fetch layer reported missing or empty HTML (transport, blocking, or treat-as-missing policy).
- **`placeholderResolved`** — Classifier recorded a placeholder-resolution class where applicable (aggregate count).
- **`unsupportedSource`** — Count of rows that are **not** server-refetch-supported for reconciliation (overlaps with capability tallies; see below).
- **`refreshCapability`** — Three counts, **per processed row**, by source capability:
  - **`serverRefetchSupported`** — Server-side refetch allowed for this row’s source; fetch/parse path may run.
  - **`extensionAssistedRequired`** — Known source pattern that needs extension-assisted capture (no server refetch in this phase).
  - **`unsupportedForReconciliation`** — Not reconcilable via the current server path.

Not every host or `source_platform` is server-refreshable; use these three counts to see how much of the backlog is actionable in Phase 1B without the extension.

#### Telemetry

Each runner invocation emits a **single** aggregate record: **`source.reconciliation.run_summary`**, including **`runMode`**: `dry_run`, `persist_metadata`, or `persist_metadata_sales_sync` (when `applySafeSync` was requested and `dryRun` is false), plus aggregate counters aligned with the HTTP response. Optional sparse companions when safe sync is enabled: **`source.reconciliation.sales_sync_applied`** and **`source.reconciliation.sales_sync_skipped`** (counts only; no URLs, addresses, or descriptions). Per-row reconciliation telemetry is **not** emitted on this route.

#### Operator runbook

1. **Dry reconciliation (recommended first):** `POST` with `{}` or `{ "limit": 20 }`. Defaults **`dryRun: true`**. Review `changed`, `parseFailed`, `sourceMissingSoft`, and `refreshCapability`.
2. **Metadata persistence:** `POST` with `{ "dryRun": false, "limit": <N> }` only after dry runs look acceptable. Confirm **`persistenceApplied`** in the response.
3. **Phase 2A — safe public sale sync (optional):** `POST` with `{ "dryRun": false, "applySafeSync": true, "limit": <N> }` only after ingest metadata persistence looks good. This path may update **existing linked published `sales`** rows (title/description/images/cover/schedule/`ends_at`/`listing_timezone`/`updated_at` only) when reconciliation classifies **material** changes (`description_changed`, `images_changed`, `schedule_changed`, `placeholder_resolved`) and fingerprints differ. **`applySafeSync` defaults to false** and must be sent explicitly as **`true`**. **`dryRun: true` never mutates `sales`** (or ingest). Response includes **`publicSalesUpdated`** (boolean) and counters: **`salesSyncAttempted`**, **`salesSyncUpdated`**, **`salesSyncSkipped`**, **`descriptionsUpdated`**, **`imagesUpdated`**, **`schedulesUpdated`**, **`titlesUpdated`**, **`manualReviewRequired`** (address drift vs published display line — **no relocation** in Phase 2A).
4. **Targeted runs:** Use `sourcePlatform` and/or `onlyPlaceholder` to narrow cohorts.
5. **Interpretation:** High **`parseFailed`** → parser regression and adapter health (Tier 0). High **`extensionAssistedRequired`** or **`unsupportedForReconciliation`** → limited server-only coverage. **`manualReviewRequired`** → normalized ingest address line disagrees with the sale’s display address; operators reconcile manually (Phase 2A does **not** move pins or geocode).

**Out of scope for Phase 2A:** cancellation, source removal, archive, **address/coordinate relocation**, destructive deletes, and broad parser rewrites. **`ends_at` in the past** does not trigger archive here; existing visibility and archive jobs continue to apply.

#### Rollback

- Disable safe sync by omitting **`applySafeSync`** or setting **`dryRun: true`**.
- If a bad sync slipped through, remediate affected **`sales`** rows manually (restore copy/media/schedule from backups or re-run ingestion); keep **`ingested_sale_id`** linkage intact.

#### Later Phase 2+

Broader synchronization (promotions, pricing modes, automated archive on source removal, etc.) remains future work with its own review — Phase 2A is intentionally narrow.

### Cross-service operational flow

1. Start from a **correlation key** in the report or alert (`requestId`, `jobId`, `saleId`, or a tight time window) so the same unit of work can be traced across services.
2. Filter logs for that id across cron, workers, and API latency events.
3. For backlog stalls: compare **Redis queue** telemetry versus **DB geocode worker** `claimed` and `queuePressureClass`.
4. For archive backlog: use **`stalePendingTotalAfter`** and **`maxIterationsHit`** on `archive.sales.job_summary`.
