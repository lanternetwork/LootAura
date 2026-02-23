# Mobile Sentry Sourcemap Upload

**Last updated:** 2026-01-XX

This document describes how sourcemap upload is configured for Sentry error reporting in Expo Android EAS builds, enabling readable stack traces in production.

## Overview

Sourcemaps are automatically uploaded to Sentry after each production EAS build completes. This allows Sentry to display original source code locations in error stack traces instead of minified code.

## Required EAS Secrets

The following environment variables must be set in EAS Dashboard for sourcemap uploads to work:

### `SENTRY_AUTH_TOKEN`

- **Location:** EAS Dashboard → Project `07dcac78-a086-4c00-9174-07984586ab86` → Settings → Secrets
- **Scope:** Production builds only
- **Value:** Your Sentry authentication token
- **How to get:** 
  1. Go to Sentry Dashboard → Settings → Account → Auth Tokens
  2. Click "Create New Token"
  3. Select scopes: `project:read`, `project:releases`, `org:read`
  4. Copy the token value

### `SENTRY_ORG`

- **Location:** EAS Dashboard → Project `07dcac78-a086-4c00-9174-07984586ab86` → Settings → Secrets
- **Scope:** Production builds only
- **Value:** Your Sentry organization slug
- **How to get:** 
  1. Go to Sentry Dashboard
  2. The organization slug is in the URL: `https://sentry.io/organizations/<org-slug>/`
  3. Or go to Settings → Organizations → Your Organization → slug is shown there

### `SENTRY_PROJECT`

- **Location:** EAS Dashboard → Project `07dcac78-a086-4c00-9174-07984586ab86` → Settings → Secrets
- **Scope:** Production builds only
- **Value:** Your Sentry project slug
- **How to get:** 
  1. Go to Sentry Dashboard → Your Project
  2. The project slug is in the URL: `https://sentry.io/organizations/<org>/projects/<project-slug>/`
  3. Or go to Project Settings → General → Project Details → slug is shown there

### `EXPO_PUBLIC_SENTRY_DSN`

- **Already configured** (see `docs/MOBILE_SENTRY_SETUP.md`)
- Required for release tag extraction in the upload script

**Important:** Do not commit any of these values to git. They must be set in EAS Dashboard secrets.

## Configuration

### Upload Script

Sourcemaps are uploaded via `mobile/scripts/upload-sourcemaps.js`, which runs as a post-build hook in EAS production builds:

- **Trigger:** Runs automatically after each production EAS build completes
- **Platform:** Works for both Android and iOS builds
- **Release Tag:** Uses format `com.lootaura.app@version+versionCode` (matches Sentry initialization)
- **Failure Handling:** If upload fails, the build still succeeds (non-blocking)

### EAS Build Hook

The upload script is configured in `mobile/eas.json`:

```json
"production": {
  "hooks": {
    "postBuild": {
      "commands": ["node mobile/scripts/upload-sourcemaps.js"]
    }
  }
}
```

This ensures sourcemaps are uploaded only for production builds, not preview or development builds.

## Verifying Sourcemap Upload

### In EAS Build Logs

After a production build completes, check the build logs for:

1. **Upload Script Execution:**
   ```
   [Sentry] Uploading sourcemaps for release: com.lootaura.app@107+107
   [Sentry] Found sourcemap: <path>
   [Sentry] Running sourcemap upload...
   [Sentry] Successfully uploaded sourcemaps for release: com.lootaura.app@107+107
   ```

2. **If Secrets Are Missing:**
   ```
   [Sentry] Missing required environment variables: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
   [Sentry] Sourcemap upload skipped. Set these in EAS Dashboard → Secrets.
   ```

3. **If Sourcemap Not Found:**
   ```
   [Sentry] No sourcemap file found in expected locations.
   [Sentry] Sourcemaps may be generated in a different location by EAS.
   ```

### In Sentry Dashboard

1. **Check Release Artifacts:**
   - Go to Sentry Dashboard → Your Project → Releases
   - Click on a release (e.g., `com.lootaura.app@107+107`)
   - Go to "Artifacts" tab
   - You should see sourcemap files listed (e.g., `index.android.bundle.map`)

2. **Verify Stack Traces:**
   - Go to Sentry Dashboard → Your Project → Issues
   - Open an error from a production build
   - Check the stack trace - it should show original file names and line numbers (not minified code)
   - If sourcemaps are working, you'll see file paths like `app/_layout.tsx:12` instead of `index.android.bundle:12345`

3. **Check Release Details:**
   - In the release view, verify:
     - Release tag matches: `com.lootaura.app@<version>+<versionCode>`
     - Artifacts count > 0
     - Sourcemaps are listed under "Artifacts"

## Troubleshooting

### Sourcemaps Not Uploading

1. **Check EAS Secrets:**
   - Verify all 4 required secrets are set in EAS Dashboard
   - Ensure they're set for the production build profile
   - Check that values are correct (no extra spaces, correct slugs)

2. **Check Build Logs:**
   - Look for the `[Sentry]` log messages in EAS build output
   - If script doesn't run, check that `eas.json` has the post-build hook configured
   - If upload fails, check the error message in logs

3. **Check Sourcemap Generation:**
   - EAS builds should generate sourcemaps automatically
   - If sourcemaps aren't found, they may be in a different location
   - Check EAS build logs for sourcemap generation output

4. **Verify Sentry Project:**
   - Ensure `SENTRY_ORG` and `SENTRY_PROJECT` match your actual Sentry project
   - Check that the auth token has correct permissions (`project:releases` scope)

### Stack Traces Still Show Minified Code

1. **Check Release Tag Match:**
   - Ensure the release tag in Sentry matches exactly: `com.lootaura.app@version+versionCode`
   - The release tag in `app/_layout.tsx` (Sentry.init) must match the upload script

2. **Check Artifacts in Sentry:**
   - Go to Sentry Dashboard → Releases → Your Release → Artifacts
   - Verify sourcemap files are present
   - If missing, the upload may have failed silently

3. **Check Sourcemap Format:**
   - Sourcemaps must be in the correct format for React Native
   - EAS should generate them correctly, but verify in build logs

4. **Wait for Processing:**
   - Sentry may take a few minutes to process uploaded sourcemaps
   - New errors should use sourcemaps once processed

### Common Issues

- **"Missing required environment variables":** Set all 4 secrets in EAS Dashboard
- **"No sourcemap file found":** Sourcemaps may be in a different location (check EAS build logs)
- **"Failed to upload sourcemaps":** Check auth token permissions and Sentry project/org slugs
- **Stack traces still minified:** Verify release tag matches between Sentry.init and upload script

## Related Documentation

- [Sentry React Native Sourcemaps](https://docs.sentry.io/platforms/react-native/sourcemaps/)
- [Sentry CLI Releases](https://docs.sentry.io/product/cli/releases/)
- [EAS Build Hooks](https://docs.expo.dev/build-reference/build-hooks/)
- [Mobile Sentry Setup](./MOBILE_SENTRY_SETUP.md) - Initial Sentry configuration
