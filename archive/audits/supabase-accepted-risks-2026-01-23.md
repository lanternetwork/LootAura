# Supabase Accepted Risks — Prelaunch

**Date:** 2026-01-23  
**Status:** Approved for launch

---

## Context

This document records Supabase Performance & Security Advisor findings that were reviewed before launch and intentionally accepted. These items represent calculated trade-offs between security, performance, cost, and operational complexity for the MVP launch.

All items have been evaluated for risk level and impact. Items marked as "Accepted" are deferred to post-launch optimization based on business priorities and resource constraints.

---

## Accepted Items

### 1. Leaked Password Protection Disabled

**Description:**  
Supabase Advisor recommends enabling leaked password protection, which requires Supabase Pro plan.

**Reason Accepted:**
- OAuth (Google) is the primary authentication method
- Email/password authentication is secondary/fallback
- Cost tradeoff accepted for MVP launch
- User security is maintained through OAuth provider's protections

**Risk Level:** Low–Medium  
**Impact:** Users using email/password may not be protected against known password leaks  
**Mitigation:** OAuth is primary auth method, reducing exposure

**Plan:** Revisit post-launch when evaluating Pro plan features

---

### 2. PostGIS Extension in public Schema

**Description:**  
PostGIS extension is installed in the `public` schema (Supabase default).

**Reason Accepted:**
- Supabase default installation location
- Required for spatial queries (map functionality, distance calculations)
- Moving extension would be breaking change and unsupported by Supabase
- No security risk (extension is read-only for application usage)

**Risk Level:** Low  
**Impact:** None — standard Supabase configuration  
**Action:** None required

---

### 3. RLS Disabled on public.spatial_ref_sys

**Description:**  
The `spatial_ref_sys` table (PostGIS system table) has RLS disabled.

**Reason Accepted:**
- Read-only system table required by PostGIS
- Contains only reference data (coordinate system definitions)
- Enabling RLS on system tables is not recommended by PostGIS documentation
- No sensitive data exposed
- Required for spatial query functionality

**Risk Level:** Low  
**Impact:** None — system table, no user data  
**Action:** None required

---

## Resolved Items (for completeness)

The following Supabase Advisor warnings were identified and resolved before launch:

### Missing Indexes (5 warnings)
**Status:** ✅ Resolved  
**Resolution:** Created 5 concurrent partial indexes via migrations 127-131:
- `idx_sales_status_moderation` — status + moderation_status filter pattern
- `idx_sales_status_archived` — status + archived_at filter pattern
- `idx_sales_owner_status_archived` — owner_id + status + archived_at filter pattern
- `idx_sales_status_archived_date_end` — archive retention queries with date_end
- `idx_sales_status_moderation_archived` — triple filter pattern

**Impact:** Query performance improved for common filter combinations

### Function search_path Mutable
**Status:** ✅ Resolved  
**Function:** `lootaura_v2.update_promotions_updated_at()`  
**Resolution:** Added explicit `SET search_path = lootaura_v2, pg_catalog` via migration 133

**Impact:** Function hardened against search_path injection attacks

---

## Sign-off

**Date:** 2026-01-23  
**Status:** Approved for launch

All accepted risks have been evaluated and deemed acceptable for MVP launch. Items will be revisited post-launch based on:
- User feedback and usage patterns
- Security audit results
- Performance monitoring data
- Business priorities and resource availability

---

**Related Documentation:**
- RLS Policy Audit: `RLS_POLICY_AUDIT_REPORT.md`
- Performance Indexes Audit: Performance Advisor findings (migrations 127-131)
- Function Security: Migration 133
