# Phase 7 — Legacy table retirement readiness

**Status:** Complete (audit)  
**Date:** 2026-05-29  
**Branch:** `spec/profile-architecture-phase1-audit`

## Purpose

Confirm whether `public.profiles` can be dropped safely. **This phase does not drop the table** — it records blockers, remaining dependencies, and a go/no-go checklist.

---

## Executive summary

| Question | Answer |
|----------|--------|
| Application runtime uses `public.profiles`? | **No** (Phases 3–5 complete) |
| Canonical store is `lootaura_v2.profiles`? | **Yes** (reads via `profiles_v2`, writes via RPC / `fromBase`) |
| Safe to `DROP TABLE public.profiles` now? | **No** — see blockers |
| Phase 6 required? | **Unknown** until [Phase 1 gate](./PHASE1_PRODUCTION_DIVERGENCE_REPORT.md) is filled |

---

## Runtime dependency scan (application)

### `app/**` — legacy `public.profiles`

| Check | Result |
|-------|--------|
| `.from('profiles')` under `app/` | **None** (static guard in CI) |
| `T.profiles` / `_actions` / `api/v2/profiles` | **Removed** (Phase 4) |
| All reads use `profiles_v2` or RPC | **Yes** |

### `lib/**` — intentional v2 base table access

| File | Pattern | Target |
|------|---------|--------|
| `lib/profile/ensureLootauraProfile.ts` | `getRlsDb().from('profiles')` | `lootaura_v2.profiles` |
| `lib/jobs/processor.ts` | `fromBase(admin, 'profiles')` | v2 |
| `lib/auth/accountLock.ts` | `fromBase(client, 'profiles')` | v2 |
| `lib/profile/fetchProfileV2.ts` | `.from('profiles_v2')` | view → v2 |

### API routes using `fromBase(..., 'profiles')` (v2 writes)

- `app/api/profile/update/route.ts`
- `app/api/profile/notifications/route.ts`
- `app/api/preferences/route.ts` (PUT fallback)
- `app/api/admin/users/route.ts`, `app/api/admin/users/[id]/lock/route.ts`
- `app/api/admin/reports/route.ts`, `app/api/admin/reports/[id]/route.ts`
- `app/email/unsubscribe/route.ts`

### Dead code (optional cleanup, not blocking drop)

| Symbol | Location | Notes |
|--------|----------|-------|
| `T.profiles` | `lib/supabase/tables.ts` | No remaining imports in `app/` or `lib/` |

---

## Database-layer dependencies

### Physical tables

| Object | Role | Retirement impact |
|--------|------|-------------------|
| `public.profiles` | Legacy table (`001_initial_schema.sql`) | **Candidate for drop** after Phase 6 + verification |
| `lootaura_v2.profiles` | Canonical | **Keep** |
| `public.profiles_v2` | View over v2 | **Keep** |

### Foreign keys

Newer migrations reference **`lootaura_v2.profiles(id)`** only (e.g. `105`, `106`, `107`, `119`, `120`, `123`). No repo migrations add FKs to `public.profiles` after v2 cutover.

### Historical migrations

Migrations `061`, `034`, `062`, `084`, `102+` mention `public.profiles` only for **column adds** or **view definitions** pointing at v2. They are historical; dropping the legacy table does not require rewriting old migration files.

### RLS on legacy table

`001_initial_schema.sql` enables RLS policy `"Users manage profile"` on `public.profiles`. Orphan policies are removed when the table is dropped.

---

## Phase gates (must pass before `DROP TABLE`)

| # | Gate | Status |
|---|------|--------|
| 1 | Phases 3–4: single write path for account/settings | **Done** |
| 2 | Phase 5: no app fallback to `public.profiles` | **Done** |
| 3 | Phase 1 production SQL: `users_only_public` = 0 | **Pending** |
| 4 | Phase 1: no material field drift in `users_in_both` | **Pending** |
| 5 | Phase 6: merge public-only rows into v2 (if gate 3/4 fail) | **Not started** |
| 6 | Post-migration: re-run divergence SQL — all users visible in v2 | **Pending** |
| 7 | Observability: no spike in profile 404s / missing avatars after Phase 5 | **Monitor in prod** |

---

## Recommended retirement sequence (future PR, not this one)

1. Run [profile-divergence-audit.sql](../../scripts/audit/profile-divergence-audit.sql) in production; complete Phase 1 report.
2. If `users_only_public` > 0 or drift: ship Phase 6 migration (upsert public → v2 per [Phase 1 preview](./PHASE1_PRODUCTION_DIVERGENCE_REPORT.md#recommended-migration-scope-preview-for-phase-6)).
3. Re-run gate SQL; confirm zero public-only users.
4. Optional: `REVOKE ALL ON public.profiles FROM ...` soak period (1–2 weeks).
5. New migration: `DROP TABLE public.profiles CASCADE` (only after sign-off).
6. Remove `lib/supabase/tables.ts` `T.profiles` if still unused.

**Do not drop** `public.profiles_v2` or `lootaura_v2.profiles`.

---

## Risk if table dropped prematurely

| Risk | Severity | Mitigation |
|------|----------|------------|
| Users with rows only in `public.profiles` invisible to app | **High** | Phase 6 + gate 3 |
| Drifted display_name/avatar between tables | **Medium** | Field merge in Phase 6 |
| External ETL / manual SQL still writing `public.profiles` | **Low** | Audit Supabase logs / integrations |

---

## Sign-off

| Role | Ready to plan DROP? | Notes |
|------|---------------------|-------|
| Application architecture | **Yes** | No runtime legacy reads/writes |
| Data / production | **No** | Phase 1 SQL not executed |
| DBA / migration owner | **No** | Phase 6 conditional |

**Verdict:** Application is **retirement-ready**; database **is not** until Phase 1 gate and optional Phase 6 complete.
