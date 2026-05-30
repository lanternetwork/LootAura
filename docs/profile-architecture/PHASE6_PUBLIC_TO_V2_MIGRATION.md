# Phase 6 — public.profiles → lootaura_v2.profiles data migration

**Status:** Migration artifact ready (not applied in CI)  
**Migration:** `supabase/migrations/216_migrate_public_profiles_to_v2.sql`  
**Verification:** [profile-phase6-post-migration-verify.sql](../../scripts/audit/profile-phase6-post-migration-verify.sql)

## When to apply

| Condition | Action |
|-----------|--------|
| Phase 1 gate: `only_public` = 0 and no material drift | **Skip** Phase 6; proceed to legacy table retirement planning |
| `only_public` > 0 or significant drift in `users_in_both` | **Apply** migration 216 in production, then run post-verify SQL |

Phase 5 app code is already live without `public.profiles` fallbacks. If `only_public` > 0, those users may not see profile data until Phase 6 runs.

## What the migration does

0. **Bootstrap** optional `public.profiles` columns (`bio`, `location_*`, `updated_at`) if migration 061 never ran in production.
1. **Insert** rows present only in `public.profiles` into `lootaura_v2.profiles` (`ON CONFLICT DO NOTHING`).
2. **Merge** rows in both tables:
   - If `public.updated_at` is strictly newer → take non-null public field values.
   - Otherwise → keep non-null v2 values.
3. **Backfill** `member_since` from `auth.users.created_at` where null (same pattern as migration 135).

**Does not:** drop `public.profiles`, change RLS, or modify application code.

## Apply checklist

- [ ] Phase 1 production SQL executed and reviewed
- [ ] Stakeholder sign-off on merge policy (newest `updated_at`, else v2 non-null)
- [ ] Apply migration 216 via Supabase CLI / dashboard on **staging** first
- [ ] Run [profile-phase6-post-migration-verify.sql](../../scripts/audit/profile-phase6-post-migration-verify.sql)
- [ ] Confirm `users_still_only_in_public` = 0 (or document exceptions)
- [ ] Apply to **production**; re-run verify SQL
- [ ] Monitor profile 404 rate and `/u/[username]` for 48h

## Post-migration results (fill after apply)

| Metric | Staging | Production | Date |
|--------|--------:|-----------:|------|
| `users_still_only_in_public` | | | |
| Display name mismatches (sample) | | | |
| Avatar mismatches (sample) | | | |

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Engineering | | | Migration applied |
| Reviewer | | | Verify SQL clean |

After Phase 6 passes verification, legacy table **drop** remains a **separate** future migration (see [PHASE7_LEGACY_RETIREMENT_READINESS.md](./PHASE7_LEGACY_RETIREMENT_READINESS.md)).
