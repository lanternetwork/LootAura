# CI Checks Reference

**Last updated: 2025-10-13 — Unified CI Implementation**

This document lists the exact required check names that must be added to GitHub Rulesets and Vercel Deployment Checks.

## Required Checks

### Core Checks (Required)
- `ci / lint` - ESLint code quality checks
- `ci / typecheck` - TypeScript type checking
- `ci / test-unit` - Unit tests (Vitest)
- `ci / test-integration` - Integration tests
- `ci / build` - Next.js application build

### Optional Checks (Recommended)
- `ci / css-scan` - Tailwind CSS token validation
- `ci / migration-verify` - Database migration verification (runs only when SQL files change)

## GitHub Rulesets Setup

1. Go to **GitHub Repository** → **Settings** → **Rules** → **Rulesets**
2. Edit the rule for `~DEFAULT_BRANCH` (usually `main`)
3. Enable the following options:
   - ✅ **Require PR**
   - ✅ **Require status checks to pass**
   - ✅ **Require up to date**
   - ✅ **Include administrators**
4. Add the required checks listed above
5. Save the ruleset

## Vercel Deployment Checks

1. Go to **Vercel Dashboard** → **Project** → **Settings** → **Git**
2. Enable **"Require GitHub checks to pass before Production deployments"**
3. Add the same required checks listed above
4. Save settings

## Check Descriptions

### `ci / lint`
- **Purpose**: Code quality and style enforcement
- **Tool**: ESLint
- **Failure**: Code style violations, unused variables, etc.
- **Fix**: Run `npm run lint` locally and fix issues

### `ci / typecheck`
- **Purpose**: TypeScript type safety
- **Tool**: TypeScript compiler
- **Failure**: Type errors, missing types, etc.
- **Fix**: Run `npm run typecheck` locally and fix type issues

### `ci / test-unit`
- **Purpose**: Unit test validation
- **Tool**: Vitest
- **Failure**: Test failures, assertion errors
- **Fix**: Run `npm run test` locally and fix failing tests

### `ci / test-integration`
- **Purpose**: Integration test validation
- **Tool**: Vitest with integration test suite
- **Failure**: Integration test failures
- **Fix**: Run integration tests locally and fix issues

### `ci / build`
- **Purpose**: Application build validation
- **Tool**: Next.js build system
- **Failure**: Build errors, compilation failures
- **Fix**: Run `npm run build` locally and fix build issues

### `ci / css-scan` (Optional)
- **Purpose**: Tailwind CSS token validation
- **Tool**: Custom CSS token scanner
- **Failure**: Missing required grid classes in compiled CSS
- **Fix**: Ensure all required Tailwind classes are present in code

### `ci / migration-verify` (Optional)
- **Purpose**: Database migration verification
- **Tool**: Custom migration verifier
- **Failure**: Schema inconsistencies, missing indexes
- **Fix**: Fix database schema or migration issues
- **Note**: Only runs when SQL files are modified

## Troubleshooting

### Check Not Appearing
- Ensure the workflow file `.github/workflows/ci.yml` exists
- Verify the job names match exactly (case-sensitive)
- Check that the workflow has run at least once

### Check Failing
- Click on the failing check to see detailed logs
- Run the corresponding command locally to reproduce the issue
- Fix the underlying problem and push changes

### Check Not Required
- Verify the check is added to the GitHub Ruleset
- Ensure the ruleset is active for the target branch
- Check that the check has run successfully at least once

## Rollback

If a check needs to be temporarily disabled:
1. Go to GitHub Rulesets and remove the check
2. Or modify the workflow file to skip the job conditionally
3. Re-enable once the issue is resolved

---

**Note**: All checks must pass before merging PRs or deploying to production.
