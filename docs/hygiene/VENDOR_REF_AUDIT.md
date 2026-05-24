# Vendor reference hygiene audit

Sanitizes public-facing repo surfaces that named a specific external sale marketplace vendor. **Does not** change runtime host matching, `source_platform` values, cron route paths, or migration history.

## Match inventory (before)

On `main`, vendor-pattern matches appeared across **~230 files** (full tree). Public-surface files with branding prose included:

| Area | Representative paths |
|------|----------------------|
| Docs | `docs/YSTM_*.md`, `docs/OPERATIONS.md` |
| Admin UI | `app/admin/ingestion/YstmCoverageScoreboardSection.tsx`, `IngestionDashboardClient.tsx`, `IngestionFunnelSection.tsx` |
| Diagnostics | `lib/admin/buildYstmCoverageDiagnostics.ts`, `buildIngestionDiagnostics.ts` |
| Fixtures (visible text) | `tests/fixtures/ingestion/discovery/*.html` titles |
| Package scripts | `backfill:ystm-sale-instance-identity` |

## Changes in this PR

- Renamed public docs: `YSTM_*` → `EXTERNAL_SOURCE_*` with neutral prose.
- Admin dashboard labels, diagnostic markdown, cron route **comments**, and fixture **titles** use neutral language.
- `package.json` script aliases renamed (script file paths unchanged).
- Fixture fake API keys: `AIzaSy_FAKE_EXTERNAL_FIXTURE_KEY` (domains unchanged for parser tests).

## Remaining matches (after) — justified

| Category | Examples | Why kept |
|----------|----------|----------|
| **Host / URL matching** | `yardsaletreasuremap.com` in `lib/ingestion/discovery/sourceDiscovery.ts`, fixtures, `YSTM_URL_LIKE` SQL filters | Required for production ingestion and tests |
| **Parser selectors** | `data-ystm-empty-list`, `/pics/YSTM_site_logo.png` in fixtures | DOM contract used by discovery/validation |
| **Cron / API paths** | `/api/cron/ystm-coverage-audit`, `vercel.json` paths | Changing would break deployed schedules |
| **Env / constants** | `CRON_YSTM_*`, `YSTM_COVERAGE_TARGET_PCT`, `INGESTION_YSTM_*` | Operational config names; safe to document |
| **DB / migrations** | `ystm_coverage_observations`, `*_ystm_*.sql` filenames | Applied history + schema |
| **Code identifiers** | `ystmDetailFirstReady`, `runYstmCoverageAuditCron`, module paths | Internal symbols; rename deferred to avoid wide refactor |
| **Metrics field names** | `ystmDetailIngestedTotal`, `validActiveYstmUrls` | API/DB JSON contract |
| **`source_platform`** | `yardsaletreasuremap` enum values | Production data values |

Fixture HTML still contains `https://yardsaletreasuremap.com/...` URLs **only** where parsers require the real host shape; visible page titles use neutral branding.

## Verification

- `npm run test` / CI (no schema or host-matching logic changes in this PR).
- Grep public surfaces: `docs/*.md`, `app/admin/**`, `README.md` should not contain vendor branding prose.
