# Profile architecture cleanup

P0 architecture consolidation: single source of truth in `lootaura_v2.profiles`, reads via `public.profiles_v2`, no runtime dependency on `public.profiles`.

## Phase 1 — production audit

| Artifact | Purpose |
|----------|---------|
| [scripts/audit/profile-divergence-audit.sql](../../scripts/audit/profile-divergence-audit.sql) | Read-only SQL for Supabase SQL Editor |
| [PHASE1_SCHEMA_VERIFICATION_REPORT.md](./PHASE1_SCHEMA_VERIFICATION_REPORT.md) | Repo vs production schema + legacy code assumptions |
| [PHASE1_PRODUCTION_DIVERGENCE_REPORT.md](./PHASE1_PRODUCTION_DIVERGENCE_REPORT.md) | Table comparison + Phase 1 gate |

Run production SQL and complete gate before Phase 5 legacy removal.

## Phase 2–4 (this PR)

| Artifact | Status |
|----------|--------|
| [PHASE2_PROFILE_SURFACE_INVENTORY.md](./PHASE2_PROFILE_SURFACE_INVENTORY.md) | Complete |
| Phase 3: `/account` → `POST /api/profile/update` | Complete |
| Phase 4: Remove `_actions`, `api/v2/profiles`, `useUpdateProfile` | Complete |

## Phase 5 (this PR)

| Artifact | Status |
|----------|--------|
| [PHASE5_LEGACY_READ_WRITE_REMOVAL.md](./PHASE5_LEGACY_READ_WRITE_REMOVAL.md) | Complete |

No `app/**` code uses `.from('profiles')` (legacy `public.profiles`). Phase 1 production gate still recommended before legacy table retirement.

## Later phases

- Phase 6: Data migration (conditional on Phase 1 divergence)
- Phase 7: Retirement readiness audit
