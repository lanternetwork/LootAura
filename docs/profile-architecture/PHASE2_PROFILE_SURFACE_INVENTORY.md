# Phase 2 — Profile Surface Inventory Report

**Status:** Complete (codebase audit)  
**Branch:** `spec/profile-architecture-phase1-audit`  
**Date:** 2026-05-29

## Classification key

| Class | Meaning |
|-------|---------|
| **Canonical** | Reads/writes `profiles_v2` / `lootaura_v2.profiles` (RPC or `fromBase`) |
| **Legacy** | Active path touching `public.profiles` |
| **Dead** | No production callers located |

---

## Reads

| Path | Class | Surface | File |
|------|-------|---------|------|
| `useProfile()` | Canonical | `profiles_v2` | `lib/hooks/useAuth.ts` |
| `fetchProfileV2` | Canonical | `profiles_v2` | `lib/profile/fetchProfileV2.ts` |
| `getUserProfile` | Canonical | `profiles_v2` → `get_profile` RPC | `lib/data/profileAccess.ts` |
| `GET /api/profile` | Legacy fallback | `profiles_v2` then `public.profiles` | `app/api/profile/route.ts` |
| `GET /api/public/profile` | Canonical | `profiles_v2` only | `app/api/public/profile/route.ts` |
| `GET /api/profile/notifications` | Canonical | `profiles_v2` | `app/api/profile/notifications/route.ts` |
| `GET /api/preferences` | Canonical | `profiles_v2` | `app/api/preferences/route.ts` |
| Public `u/[username]` | Legacy fallback | `profiles_v2` + `public.profiles` | `app/(public)/u/[username]/page.tsx` |
| Middleware home_zip | Canonical | `profiles_v2` | `middleware.ts` |
| Sale owner / listings | Canonical | `profiles_v2` | `lib/data/salesAccess.ts`, `lib/data/sales.ts`, `app/api/public/listings/route.ts` |
| `GET /api/health/supabase` | Legacy | `profiles_v2` + `public.profiles` | `app/api/health/supabase/route.ts` |
| `GET /api/v2/profiles` | Legacy | `public.profiles` (`user_id`) | `app/api/v2/profiles/route.ts` |
| `_actions.getProfile` | Legacy | `public.profiles` | `app/account/_actions.ts` |
| Admin user list | Canonical | `fromBase(..., 'profiles')` → v2 | `app/api/admin/users/route.ts` |
| Jobs processor | Canonical | `fromBase(admin, 'profiles')` | `lib/jobs/processor.ts` |
| Account lock | Canonical | `fromBase(..., 'profiles')` | `lib/auth/accountLock.ts` |

---

## Writes

| Path | Class | Surface | File |
|------|-------|---------|------|
| `ensureLootauraProfileExists` | Canonical | `getRlsDb().from('profiles')` → v2 | `lib/profile/ensureLootauraProfile.ts` |
| Auth signup/signin/establish-session/callback/confirm | Canonical | calls `ensureLootauraProfileExists` | `app/api/auth/*`, `lib/auth/*` |
| `PUT /api/profile` | Canonical | `update_profile` RPC | `app/api/profile/route.ts` |
| `POST /api/profile/update` | Canonical | `fromBase(rls, 'profiles')` | `app/api/profile/update/route.ts` |
| `POST /api/profile/social-links` | Canonical | `update_profile` RPC | `app/api/profile/social-links/route.ts` |
| `PUT /api/profile/notifications` | Canonical | `fromBase(rls, 'profiles')` | `app/api/profile/notifications/route.ts` |
| `PUT /api/preferences` fallback | Legacy | `public.profiles` (`.eq('id')`) | `app/api/preferences/route.ts` |
| `POST/GET /api/v2/profiles` | Legacy | `public.profiles` upsert (`user_id`) | `app/api/v2/profiles/route.ts` |
| `_actions.updateProfile` | **Removed** | was `public.profiles` | Phase 3–4 complete |
| `useUpdateProfile` | **Removed** | was `public.profiles` | Phase 4 complete |
| Admin lock / email unsubscribe | Canonical | `fromBase(admin, 'profiles')` | `app/api/admin/*`, `app/email/unsubscribe/route.ts` |

---

## UI entry points

| Route / UI | Read | Write (before Phase 3) | Write (after Phase 3) |
|------------|------|------------------------|------------------------|
| `/account` (`AccountClient`) | `useProfile` → v2 | `/api/profile/update` → v2 | `/api/profile/update` → v2 |
| `/account/edit` | SSR `profiles_v2` | `/api/profile/update` | unchanged (canonical) |
| `(account)/profile` (`ProfileClient`) | `/api/profile` | `/api/profile`, `/api/profile/update` | unchanged |
| Dashboard cards | `/api/profile*` | `/api/profile/update`, social-links | unchanged |

---

## RPCs (canonical)

| RPC | Purpose | Migration |
|-----|---------|-----------|
| `get_profile(p_user_id)` | Read v2 base | `065_create_get_profile_rpc.sql` |
| `update_profile(...)` | Upsert v2 fields | `064`, `085`, `185` |

---

## Dead code (verified no app callers)

| Symbol | File | Phase 4 action |
|--------|------|----------------|
| `useUpdateProfile` | `lib/hooks/useAuth.ts` | Remove export |
| `GET/POST /api/v2/profiles` | `app/api/v2/profiles/route.ts` | Remove route (+ CSRF entry) |
| `getProfile` in `_actions` | `app/account/_actions.ts` | Remove with file |

---

## Phase 5 backlog (from inventory)

| Phase | Items |
|-------|--------|
| **5** | Remove legacy reads/writes in `profile/route.ts`, `u/[username]`, `preferences`, `health` (after Phase 1 gate + optional Phase 6) |

---

## Sign-off

Code inventory complete. No hidden profile write surfaces found outside this list (grep: `profiles`, `profiles_v2`, `get_profile`, `update_profile`, `T.profiles`, `fromBase(.*profiles`).
