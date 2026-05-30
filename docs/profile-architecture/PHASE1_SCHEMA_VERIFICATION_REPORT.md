# Phase 1 — Production Schema Verification Report

**Status:** Phase 1 (audit)  
**Date:** 2026-05-29  
**Branch:** `spec/profile-architecture-phase1-audit`

## Purpose

Confirm whether production `public.profiles` matches repository migrations and whether legacy application code (`user_id` vs `id`) is valid in production.

Run [profile-divergence-audit.sql](../../scripts/audit/profile-divergence-audit.sql) sections **A1–A4** and paste results under **Production — fill from SQL** below.

---

## Repository-expected schema

### `public.profiles` (legacy table)

| Column | Source | Notes |
|--------|--------|-------|
| `id` | `001_initial_schema.sql` | PK, `references auth.users(id)` |
| `display_name` | `001_initial_schema.sql` | |
| `avatar_url` | `001_initial_schema.sql` | |
| `created_at` | `001_initial_schema.sql` | |
| `bio` | `061_user_preferences_and_profiles_ext.sql` | optional add |
| `location_city` | `061` | optional add |
| `location_region` | `061` | optional add |
| `updated_at` | `061` | optional add |

**Not in repo migrations:** `user_id`, `username`, `preferences`, `social_links`, `full_name`

### `lootaura_v2.profiles` (canonical table)

| Column | Source | Notes |
|--------|--------|-------|
| `id` | `033_safe_lootaura_v2_schema.sql` | PK = `auth.users.id` |
| `username` | migrations `062+` | unique |
| `full_name`, `display_name`, `avatar_url`, `bio` | various | |
| `home_zip`, `preferences` | `033` / later | jsonb preferences |
| `location_city`, `location_region` | `062` | |
| `social_links` | `084` | jsonb |
| `member_since` | `135` | |
| email / lock fields | `100`, `108`, `119` | |

### `public.profiles_v2` (view)

View over `lootaura_v2.profiles` only (`122_fix_profiles_v2_security_invoker.sql`). Not a second physical store.

---

## Legacy code assumptions vs repository schema

| Code path | Table reference | Key column used | Repo `public.profiles` has column? |
|-----------|-----------------|-----------------|-----------------------------------|
| `app/account/_actions.ts` | `T.profiles` → `public.profiles` | **`user_id`** on upsert/select | **No** (repo: `id` only) |
| `app/api/v2/profiles/route.ts` | `public.profiles` | **`user_id`** | **No** |
| `lib/hooks/useAuth.ts` `useUpdateProfile` | `public.profiles` | **`id`** | **Yes** |
| `app/api/preferences/route.ts` PUT fallback | `public.profiles` | **`id`** | **Yes** |
| `app/api/profile/route.ts` GET fallback | `public.profiles` | **`id`** | **Yes** |
| `ensureLootauraProfileExists` | `lootaura_v2.profiles` via `getRlsDb()` | **`id`** | **Yes** (v2) |

**Repo conclusion:** `app/account/_actions.ts` and `app/api/v2/profiles/route.ts` assume `public.profiles.user_id`, which is **not** created by any migration in this repository. Production must be verified before Phase 3.

---

## Production — fill from SQL

### A1 — `public.profiles` columns

_Paste output of section `A1_public_profiles_columns`._

```
(pending)
```

### A2 — `lootaura_v2.profiles` columns

_Paste output of section `A2_lootaura_v2_profiles_columns`._

```
(pending)
```

### A3 — `public.profiles` has `user_id`?

_Paste `public_profiles_has_user_id` (true/false)._

```
(pending)
```

### A4 — `public.profiles` has `id`?

_Paste `public_profiles_has_id` (true/false)._

```
(pending)
```

---

## Verification verdict

| Check | Repo expectation | Production (fill after SQL) | Match? |
|-------|------------------|----------------------------|--------|
| `public.profiles` primary user key | `id` | (pending) | (pending) |
| `user_id` column exists | Absent in migrations | (pending) | (pending) |
| Canonical data in v2 | `lootaura_v2.profiles` | (pending) | (pending) |

### Schema verdict (pre-production SQL)

**Repo/code mismatch confirmed:** legacy account and v2 profile API paths reference `user_id` on `public.profiles`; migrations only define `id`.

### Final schema verdict (after SQL)

```
(pending — set to PASS / FAIL / DRIFT after production SQL)
```

**Confidence:** High for repo analysis; production column list pending SQL run.

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Engineering | | | Schema SQL run in production |
| Reviewer | | | Gate for Phase 3+ code |
