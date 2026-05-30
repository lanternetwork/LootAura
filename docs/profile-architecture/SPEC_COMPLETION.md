# Profile architecture cleanup — spec completion

**Branch:** `spec/profile-architecture-phase1-audit`  
**PR:** [#513](https://github.com/lanternetwork/LootAura/pull/513)

## Delivered in repository

| Phase | Deliverable | Apply in prod |
|-------|-------------|---------------|
| 1 | Divergence + schema audit SQL/docs | Run SQL, fill reports |
| 2 | Surface inventory | — |
| 3–4 | `/account` → `/api/profile/update`; remove legacy APIs | On merge |
| 5 | Remove `public.profiles` app fallbacks | On merge |
| 6 | Migration `216` + verify SQL + runbook | After Phase 1 gate |
| 7 | Retirement readiness audit | — |
| 8 | Migration `217` + drop runbook | After Phase 6 verify |

## Operator checklist (post-merge)

1. [ ] Run [profile-divergence-audit.sql](../../scripts/audit/profile-divergence-audit.sql) → complete Phase 1 report  
2. [ ] If `only_public` > 0: apply migration **216**, run [post-verify](../../scripts/audit/profile-phase6-post-migration-verify.sql)  
3. [ ] Monitor profile 404s / public profile pages  
4. [ ] Apply migration **217** or [drop script](../../scripts/audit/profile-drop-legacy-public-profiles.sql) (prod Phase 6 verified)  

## Out of scope (this spec)

- Rewriting historical migrations that mention `public.profiles`
- Changing `profiles_v2` view or v2 RLS model
