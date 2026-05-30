# Phase 5 — Legacy read/write removal

**Status:** Complete (PR #513)

## Goal

Remove runtime fallbacks to `public.profiles`. All app reads/writes use `profiles_v2`, `get_profile` / `update_profile` RPCs, `ensureLootauraProfileExists`, or `fromBase(rls, 'profiles')` (lootaura_v2 base table).

## Changes

| Surface | Before | After |
|---------|--------|-------|
| `GET /api/profile` | After failed RPC create, queried `public.profiles` | `ensureLootauraProfileExists` + `fetchProfileV2` + `get_profile`; 404 if still missing |
| `generateMetadata` on `/u/[username]` | Fallback to `public.profiles` when view empty | `profiles_v2` only → not-found metadata |
| `PUT /api/preferences` | Fallback update on `public.profiles` | `fromBase(rls, 'profiles')` (v2) |
| `GET /api/health/supabase` | Service role probe on `public.profiles` | Probe on `profiles_v2` |

## Still canonical (not legacy)

- `lib/profile/ensureLootauraProfile.ts` — `getRlsDb().from('profiles')` targets **lootaura_v2.profiles**
- Admin/jobs/lock/email routes using `fromBase(..., 'profiles')`

## Gate reminder

Phase 1 production divergence SQL was not run in CI. Before treating production as safe for users with data **only** in `public.profiles`, run [profile-divergence-audit.sql](../../scripts/audit/profile-divergence-audit.sql) and complete [PHASE1_PRODUCTION_DIVERGENCE_REPORT.md](./PHASE1_PRODUCTION_DIVERGENCE_REPORT.md). If divergence exists, execute Phase 6 before dropping the legacy table.

## Verification

- Static guard: `tests/unit/account/account-settings-profile-path.test.ts` — no `.from('profiles')` under `app/`
- `tests/unit/auth/profile.test.ts` — GET 404 without legacy table mock
