# Phase 8 — Drop `public.profiles`

**Status:** Migration ready  
**Migration:** `supabase/migrations/217_drop_legacy_public_profiles.sql`  
**SQL Editor copy:** [profile-drop-legacy-public-profiles.sql](../../scripts/audit/profile-drop-legacy-public-profiles.sql)

## Prerequisites (all required)

| # | Gate | How to verify |
|---|------|----------------|
| 1 | Phases 3–5 deployed | App uses `profiles_v2` / v2 writes only |
| 2 | Phase 1 production audit complete | [PHASE1_PRODUCTION_DIVERGENCE_REPORT.md](./PHASE1_PRODUCTION_DIVERGENCE_REPORT.md) signed |
| 3 | Phase 6 applied if needed | Migration `216` + [post-verify SQL](../../scripts/audit/profile-phase6-post-migration-verify.sql) → `only_public` = 0 |
| 4 | Soak period (optional) | 1–2 weeks stable profile metrics after Phase 5/6 |
| 5 | Sign-off | Engineering + DBA on this doc |

## Apply steps

1. Run preflight section of [profile-drop-legacy-public-profiles.sql](../../scripts/audit/profile-drop-legacy-public-profiles.sql) in **staging** (full script).
2. Smoke-test: `/account`, `/api/profile`, public `/u/[username]`, preferences.
3. Repeat in **production**.
4. Apply migration **217** via deploy or SQL Editor (idempotent if you already ran the manual script).

## What must remain

| Object | Action |
|--------|--------|
| `lootaura_v2.profiles` | **Keep** |
| `public.profiles_v2` | **Keep** (view over v2) |
| `get_profile` / `update_profile` RPCs | **Keep** |

## Post-drop verification

```sql
SELECT to_regclass('public.profiles') IS NULL AS dropped;
SELECT COUNT(*) FROM public.profiles_v2 LIMIT 1;
```

## Sign-off

| Role | Name | Date | Environment |
|------|------|------|-------------|
| Engineering | | | |
| DBA | | | |
