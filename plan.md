# LootAura Development Plan

**Last updated: 2025-01-31**

## Webapp Production Readiness / SLOs

### Service Level Objectives (SLOs)

#### Map Performance
- **Map Initial Interactive State**: Map + basic sales results should be interactive within ~2.5–3s on a mid-tier device (e.g., iPhone 12, mid-range Android), under normal network conditions (4G/LTE).
- **Map Pan Performance**: Map panning should maintain smooth 60fps with up to 200 visible pins; clustering should activate automatically to maintain performance.

#### Sales Query Performance
- **Core Sales Visibility Query**: Bbox-based sales queries should have p95 latency ≤ ~300ms from the database where feasible; slow paths (e.g., category filtering with large result sets) should be documented and optimized.
- **Sales Count Query**: `/api/sales/count` should respond within ~200ms p95 for typical queries (bbox < 5° span, no complex filters).

#### API Reliability
- **Error Rate**: Core API endpoints (`/api/sales`, `/api/sales/markers`, `/api/sales/count`) should maintain < 1% error rate (5xx responses) under normal load.
- **Rate Limiting**: Rate limit policies should prevent abuse while allowing normal usage patterns (e.g., map panning, filter changes).

### Release Gates

#### Pre-Production Checklist

**Error Handling & Observability:**
- ✅ No uncaught errors in normal flows (map search, sale detail, favorite/unfavorite, auth, profile) as seen in browser console.
- ✅ All API routes have top-level error handling with structured error responses.
- ✅ Central logger (`lib/log.ts`) is used consistently in server/API code; minimal `console.*` usage in production paths.
- ✅ Sentry integration is active and capturing errors from client, server, and edge runtimes.

**Cron & Background Jobs:**
- ✅ No failing cron runs in the last 7 days (based on logs/Sentry).
- ✅ Cron endpoints return structured responses with execution metadata.
- ✅ Email sending is non-blocking and error-tolerant (does not throw, returns result).

**Database & Security:**
- ✅ Supabase Security Advisor: all app-fixable lints resolved; only Supabase-managed infra items (e.g., PostGIS in `public`, `spatial_ref_sys` RLS) may remain.
- ✅ All `public.*_v2` views are `SECURITY INVOKER` (enforced via `093_supabase_security_lints_fix.sql`).
- ✅ All functions have fixed `search_path` (enforced via `094_function_search_path_hardening.sql`).
- ✅ RLS is enabled on all `lootaura_v2` tables with appropriate policies.

**Performance & Abuse Protection:**
- ✅ Rate limiting is applied to all sales/search endpoints (`/api/sales`, `/api/sales/markers`, `/api/sales/count`, `/api/sales/search`).
- ✅ Bbox size validation is enforced (max 10° span) to prevent abuse.
- ✅ Search parameter validation is in place (distance caps, query length limits, limit caps).

**Monitoring:**
- ✅ No new untriaged Sentry error groups from core flows in the last 7 days.
- ✅ Production logs do not contain PII (emails, full user IDs, tokens) in clear text.
- ✅ Structured logging is used for operational signals (component, operation, context).

### Performance Benchmarks

**Target Metrics (aspirational, to be validated in production):**
- Map first paint: < 2.5s (p95)
- Sales query latency: < 300ms (p95) for bbox queries
- Sales count query: < 200ms (p95)
- API error rate: < 1% (5xx responses)

**Note**: These benchmarks are based on typical usage patterns and should be validated against real production traffic. Adjust thresholds based on observed performance.

---

## Development Roadmap

### Current Focus
- Production hardening (error handling, logging, rate limiting, bbox validation)
- Security lint resolution (Supabase Security Advisor)
- Performance optimization (query latency, map rendering)

### Future Enhancements
- Advanced search filters
- User notifications
- Seller analytics dashboard
- Mobile app improvements

---

**Note**: This plan is a living document and should be updated as the project evolves.

