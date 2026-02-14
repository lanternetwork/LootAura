# CI Trigger Audit Report

## Problem
Only ~57 checks were running on push to feature branches instead of the expected 100+ checks.

## Workflows Audited

### 1. `ci.yml` ✅ FIXED
**Status:** Fixed
**Issue:** Had `branches-ignore: [main]` which prevented it from running on push to main branch
**Fix:** Removed branch filter so it runs on push to all branches
**Jobs:** ~50+ jobs (env-presence, lint, typecheck, test-unit, test-integration [43 batches], test-e2e-smoke, build, css-scan, migration-verify, notify-completion)

**Before:**
```yaml
push:
  branches-ignore:
    - main
```

**After:**
```yaml
push:
  # Run on all branches (main and feature branches)
  # No branch filter means it runs on every push
```

### 2. `synthetic-e2e.yml` ✅ ALREADY CORRECT
**Status:** Already configured correctly
**Triggers:** 
- `push:` (all branches, no filter)
- `pull_request:` (branches: [main])
- `schedule:` (every 6 hours)
- `workflow_dispatch:`

### 3. `load-test-on-deploy.yml` ⚠️ INTENTIONALLY PR-ONLY
**Status:** Intentionally deployment-only
**Triggers:** `deployment_status` only
**Reason:** This workflow is designed to run load tests only when deployments succeed, not on every push. This is intentional behavior.

### 4. `load-test.yml` ⚠️ INTENTIONALLY MANUAL-ONLY
**Status:** Intentionally manual/workflow_call only
**Triggers:** `workflow_dispatch` and `workflow_call` only
**Reason:** This is a reusable workflow meant to be called by other workflows or triggered manually. Not intended to run on every push.

### 5. CodeQL (Dynamic Workflow) ❓ NEEDS VERIFICATION
**Status:** Unknown - GitHub-managed workflow
**Location:** `dynamic/github-code-scanning/codeql`
**Note:** CodeQL workflows are typically configured via GitHub's Security settings. They usually run on:
- Push to main
- Pull requests targeting main
- Schedule (if configured)

**Action Required:** Verify CodeQL is configured to run on push to feature branches in GitHub Security settings.

## Summary of Changes

### Fixed
- **`ci.yml`**: Removed `branches-ignore: [main]` so it runs on push to all branches including main

### Already Correct
- **`synthetic-e2e.yml`**: Already runs on push to all branches

### Intentionally Excluded
- **`load-test-on-deploy.yml`**: Deployment-only (intentional)
- **`load-test.yml`**: Manual/workflow_call only (intentional)

### Needs Manual Verification
- **CodeQL**: Check GitHub Security settings to ensure it runs on push to feature branches

## Expected Behavior After Fix

After the fix to `ci.yml`:
- **Push to feature branches**: `ci.yml` (~50+ jobs) + `synthetic-e2e.yml` (1 job) + CodeQL (if configured) = ~52+ checks minimum
- **Push to main**: Same as above
- **Pull request to main**: All of the above + any PR-specific workflows

## Verification Steps

1. Push a commit to a feature branch
2. Check GitHub Actions tab - should see:
   - `ci` workflow running (all jobs)
   - `Synthetic E2E Tests` workflow running
   - `CodeQL` workflow running (if configured)
3. Check PR checks - should show 50+ checks from `ci` workflow alone

## Files Changed

- `.github/workflows/ci.yml` (lines 3-9): Removed `branches-ignore: [main]` from push trigger
