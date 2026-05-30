# Phase 1 — Profile Divergence Report

**Status:** Phase 1 (audit)  
**Date:** 2026-05-29  
**Branch:** `spec/profile-architecture-phase1-audit`

## Purpose

Compare `public.profiles` and `lootaura_v2.profiles` in **production** to determine whether Phase 6 data migration is required before Phase 5 legacy removal.

**SQL:** [scripts/audit/profile-divergence-audit.sql](../../scripts/audit/profile-divergence-audit.sql)  
**Instructions:** [README.md](./README.md)

---

## Executive summary

| Item | Value |
|------|-------|
| Production SQL executed? | **No** (pending — run in Supabase SQL Editor) |
| Divergence detected? | **Pending** |
| Phase 6 required before Phase 5? | **Pending** (see gate below) |

---

## Table comparison

### Row counts

_Paste section `B1_row_counts`._

| Metric | Count |
|--------|------:|
| `public.profiles` | (pending) |
| `lootaura_v2.profiles` | (pending) |
| `auth.users` | (pending) |

### User presence

_Paste section `C4_summary_presence` or `G1_phase1_gate_summary`._

| Category | Count | Notes |
|----------|------:|-------|
| Users only in `public.profiles` | (pending) | Phase 6 must merge to v2 |
| Users only in `lootaura_v2.profiles` | (pending) | Expected for auth-provisioned users |
| Users in both tables | (pending) | Check field drift below |

#### Sample: only in public (max 500)

_Paste `C1_users_only_in_public_profiles` or attach CSV._

```
(pending)
```

#### Sample: only in v2 (max 500)

_Paste `C2_users_only_in_v2_profiles`._

```
(pending)
```

---

## Field-level divergence (users in both)

| Drift type | Row count (from SQL) | Sample attached? |
|------------|---------------------:|------------------|
| Display name mismatch (`D1`) | (pending) | (pending) |
| Avatar URL mismatch (`D2`) | (pending) | (pending) |
| Bio mismatch (`D3`) | (pending) | (pending) |
| Preferences mismatch (`D4`) | (pending) | N/A if column missing on public |

### Conflicting usernames (v2)

_Paste `E1_duplicate_usernames_v2` if any._

```
(pending)
```

---

## Auth users without profiles

| Check | Count |
|-------|------:|
| Auth users missing v2 profile (`F1`) | (pending) |
| Auth users missing public profile (`F2`) | (pending) |

---

## Phase 1 implementation gate

Paste **`G1_phase1_gate_summary`**:

| Field | Value |
|-------|------:|
| `users_only_public` | (pending) |
| `users_only_v2` | (pending) |
| `users_in_both_with_field_drift` | (pending) |
| `public_has_user_id_column` | (pending) |

### Gate decision rules

| Condition | Next step |
|-----------|-----------|
| `users_only_public` = 0 AND `users_in_both_with_field_drift` = 0 | Phase 5 may proceed after Phases 3–4 (no Phase 6) |
| `users_only_public` > 0 OR significant field drift | **Phase 6 before Phase 5** |
| `public_has_user_id_column` = false AND account saves use `user_id` | Fix legacy write paths in Phase 3; investigate failed historical writes |

### Gate decision

```
(pending — choose one after SQL)

[ ] GO — No migration required (proceed 3 → 4 → 5 → 7)
[ ] GO — Phase 6 required before Phase 5
[ ] BLOCK — Schema drift / unexpected production shape (investigate)
```

---

## Risk assessment (static, from code audit)

| Risk | Severity | Evidence |
|------|----------|----------|
| Account settings write to wrong table/column | **High** | `app/account/_actions.ts` → `public.profiles` + `user_id` |
| Read/write split brain on `/account` | **High** | `useProfile()` reads `profiles_v2`; `_actions` writes `public.profiles` |
| Dashboard vs account inconsistency | **Medium** | Dashboard uses `/api/profile` (v2); `/account` uses server actions |
| Data loss if Phase 5 before Phase 6 | **High** when `users_only_public` > 0 | Removing fallbacks hides public-only rows from v2 reads |

---

## Recommended migration scope (preview for Phase 6)

_Final scope confirmed only after this report is filled._

| Scenario | Phase 6 action |
|----------|----------------|
| Rows only in `public.profiles` | Upsert into `lootaura_v2.profiles` by `id`, preserve newest field values |
| Rows in both with drift | Field-level merge: prefer newest `updated_at` / non-null v2 values per spec |
| Rows only in v2 | No action |

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Engineering | | | SQL executed, counts filled |
| Reviewer | | | Gate decision recorded |

**No Phase 3+ application code until gate row is completed and reviewed.**
