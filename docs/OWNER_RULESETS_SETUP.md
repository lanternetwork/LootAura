# Owner Rulesets Setup Guide

**Last updated: 2025-10-13 — Unified CI Implementation**

This guide provides step-by-step instructions for setting up GitHub Rulesets and Vercel Deployment Checks to enforce CI requirements.

## GitHub Rulesets Setup

### Step 1: Access Rulesets
1. Navigate to your GitHub repository
2. Go to **Settings** → **Rules** → **Rulesets**
3. Click **"New ruleset"** or edit existing ruleset for `~DEFAULT_BRANCH`

### Step 2: Configure Basic Settings
1. **Name**: "CI Requirements"
2. **Target**: `~DEFAULT_BRANCH` (usually `main`)
3. **Enforcement**: "Active"

### Step 3: Enable Required Options
Check the following boxes:
- ✅ **Require PR**
- ✅ **Require status checks to pass**
- ✅ **Require up to date**
- ✅ **Include administrators**

### Step 4: Add Status Checks
Add these exact check names (case-sensitive):
- `ci / lint`
- `ci / typecheck`
- `ci / test-unit`
- `ci / test-integration`
- `ci / build`

### Step 5: Optional Checks (Recommended)
Add these optional checks:
- `ci / css-scan`
- `ci / migration-verify`

### Step 6: Save Ruleset
Click **"Create ruleset"** or **"Update ruleset"**

## Vercel Deployment Checks

### Step 1: Access Vercel Settings
1. Go to your Vercel Dashboard
2. Select your project
3. Go to **Settings** → **Git**

### Step 2: Enable GitHub Checks
1. Find **"Require GitHub checks to pass before Production deployments"**
2. Toggle it **ON**

### Step 3: Add Required Checks
Add the same checks as in GitHub Rulesets:
- `ci / lint`
- `ci / typecheck`
- `ci / test-unit`
- `ci / test-integration`
- `ci / build`

### Step 4: Optional Checks
Add optional checks if desired:
- `ci / css-scan`
- `ci / migration-verify`

### Step 5: Save Settings
Click **"Save"** to apply the changes

## Verification

### Test GitHub Rulesets
1. Create a test PR to the main branch
2. Verify that the PR is blocked from merging
3. Check that all required checks are listed
4. Confirm that checks must pass before merge

### Test Vercel Deployment
1. Merge a PR to main branch
2. Verify that Vercel deployment is blocked until checks pass
3. Confirm that production deployment requires green checks

## Troubleshooting

### Checks Not Appearing
- Ensure the `.github/workflows/ci.yml` file exists
- Verify the workflow has run at least once
- Check that job names match exactly

### Checks Not Required
- Verify the ruleset is active for the target branch
- Ensure the check has run successfully at least once
- Check that the check name matches exactly (case-sensitive)

### Deployment Blocked
- Ensure all required checks are green
- Verify the checks are added to both GitHub and Vercel
- Check that the Vercel integration is properly configured

## Rollback

### Disable Rulesets
1. Go to GitHub Rulesets
2. Edit the ruleset
3. Uncheck "Active" or delete the ruleset

### Disable Vercel Checks
1. Go to Vercel Settings → Git
2. Toggle off "Require GitHub checks to pass before Production deployments"

## Best Practices

### Check Naming
- Use exact names as specified in `docs/CI_CHECKS.md`
- Case-sensitive: `ci / lint` not `CI / Lint`
- Include spaces: `ci / test-unit` not `ci/test-unit`

### Testing
- Test with a dummy PR before enforcing on main
- Verify all checks run and pass
- Confirm merge blocking works as expected

### Maintenance
- Review check requirements periodically
- Update checks when adding new CI jobs
- Monitor check performance and adjust as needed

---

**Important**: These settings will block all PRs and deployments until the checks pass. Ensure your CI is stable before enabling.
