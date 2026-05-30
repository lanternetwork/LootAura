# Profile architecture cleanup

P0 architecture consolidation: single source of truth in `lootaura_v2.profiles`, reads via `public.profiles_v2`, no runtime dependency on `public.profiles`.

## Phase 1 (this PR) — production audit only

No application code changes until Phase 1 reports are reviewed.

| Artifact | Purpose |
|----------|---------|
| [scripts/audit/profile-divergence-audit.sql](../../scripts/audit/profile-divergence-audit.sql) | Read-only SQL for Supabase SQL Editor |
| [PHASE1_SCHEMA_VERIFICATION_REPORT.md](./PHASE1_SCHEMA_VERIFICATION_REPORT.md) | Repo vs production schema + legacy code assumptions |
| [PHASE1_PRODUCTION_DIVERGENCE_REPORT.md](./PHASE1_PRODUCTION_DIVERGENCE_REPORT.md) | Table comparison + Phase 1 gate |

## Implementation gate

1. Run `profile-divergence-audit.sql` in **production** Supabase SQL Editor.
2. Paste metrics into the Phase 1 reports (sections marked **Production — fill from SQL**).
3. Review `G1_phase1_gate_summary` before starting Phase 3+ code.

**Phase 5 ordering:** Phases 3 and 4 complete first; Phase 5 only if no divergence **or** Phase 6 migration complete.

## Later phases (not in this PR)

- Phase 2: Profile surface inventory
- Phase 3: Account surface migration
- Phase 4: Legacy API retirement
- Phase 5: Legacy read/write removal (conditional)
- Phase 6: Data migration (conditional)
- Phase 7: Retirement readiness audit
