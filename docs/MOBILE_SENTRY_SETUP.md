# Mobile Sentry Setup

**Last updated:** 2026-01-XX

This document describes how Sentry error reporting is configured for the LootAura Expo mobile app and how to verify it's working in production builds.

## Overview

Sentry is configured to capture native-layer errors (React Native component errors, native module errors) in production builds. WebView JavaScript errors are handled by the web app's Sentry configuration (see `sentry.client.config.ts`).

## Required EAS Secrets

The following environment variable must be set in EAS Dashboard:

### `EXPO_PUBLIC_SENTRY_DSN`

- **Location:** EAS Dashboard → Project `07dcac78-a086-4c00-9174-07984586ab86` → Settings → Secrets
- **Scope:** Production builds only (preview builds can use the same secret if desired)
- **Value:** Your Sentry DSN URL (format: `https://<key>@<org>.ingest.sentry.io/<project>`)
- **How to get:** Sentry Dashboard → Project Settings → Client Keys (DSN)

**Important:** Do not commit the DSN value to git. It must be set in EAS Dashboard secrets.

## Configuration

### Initialization

Sentry is initialized in `mobile/app/_layout.tsx` (root layout, earliest safe entrypoint):

- Only enabled in production builds (`!__DEV__`)
- DSN comes directly from `process.env.EXPO_PUBLIC_SENTRY_DSN` (set in EAS Secrets)
- PII is disabled (`sendDefaultPii: false`)
- Performance monitoring enabled at 10% sample rate

### Release Tagging

Releases are tagged with format: `com.lootaura.app@<version>+<versionCode>`

- Example: `com.lootaura.app@107+107`
- Version comes from `app.json` → `version` field
- VersionCode comes from `app.json` → `android.versionCode` field
- This enables correlation of errors to specific builds in Sentry

### EAS Build Configuration

The `EXPO_PUBLIC_SENTRY_DSN` environment variable must be set in EAS Dashboard → Secrets:

- **Not defined in `mobile/eas.json`** - DSN must be set via EAS Secrets / build environment
- Production builds will have access to `EXPO_PUBLIC_SENTRY_DSN` at runtime if set in EAS Secrets
- The env var is available to the app via `process.env.EXPO_PUBLIC_SENTRY_DSN` in production builds

## Verifying Sentry is Working

### In Production Builds

1. **Check Sentry Dashboard:**
   - Go to Sentry Dashboard → Your Project → Issues
   - Look for errors from the mobile app
   - Errors should appear with release tag: `com.lootaura.app@<version>+<versionCode>`

2. **Check Release Information:**
   - Go to Sentry Dashboard → Your Project → Releases
   - You should see releases with format `com.lootaura.app@<version>+<versionCode>`
   - Each release should correspond to a production build

3. **Expected Behavior:**
   - Native-layer errors (React Native component crashes, native module errors) will be captured
   - Errors will include stack traces and device information (no PII)
   - Errors will be tagged with the release version

### What to Expect (No New Logging)

- **No console logs** are added for Sentry initialization (silent initialization)
- **No UI changes** - Sentry runs in the background
- **No test buttons** - errors are captured automatically when they occur

### Testing (Optional)

To verify Sentry is capturing errors, you can temporarily trigger a native error:

1. Add a temporary test in a development build (not production)
2. Or wait for a real error to occur in production
3. Check Sentry Dashboard for the error

**Note:** Do not add permanent test error mechanisms to production code.

## Troubleshooting

### Errors Not Appearing in Sentry

1. **Check EAS Secrets:**
   - Verify `EXPO_PUBLIC_SENTRY_DSN` is set in EAS Dashboard → Secrets
   - Ensure it's set for the correct build profile (production)

2. **Check Build Logs:**
   - EAS build logs should not show Sentry initialization errors
   - To verify `EXPO_PUBLIC_SENTRY_DSN` is present (without printing the value), check that the build environment includes the variable name
   - If DSN is missing or empty, Sentry will not initialize (silent failure, no errors in logs)
   - You can verify the env var is set by checking EAS Dashboard → Builds → View build → Environment variables section (variable name should be listed)

3. **Check Sentry Project:**
   - Verify the DSN matches your Sentry project
   - Ensure the project is configured for React Native platform

4. **Check Release Tagging:**
   - Verify `app.json` has correct `version` and `android.versionCode`
   - Check that releases appear in Sentry Dashboard with expected format

### Common Issues

- **DSN Not Set:** If `EXPO_PUBLIC_SENTRY_DSN` is not set in EAS Secrets, Sentry will not initialize (silent failure)
- **Wrong Environment:** Sentry only initializes in production builds (`!__DEV__`), not in development
- **Release Mismatch:** If versionCode doesn't match between builds, releases won't correlate correctly

## Related Documentation

- [Sentry React Native Documentation](https://docs.sentry.io/platforms/react-native/)
- [Expo Environment Variables](https://docs.expo.dev/guides/environment-variables/)
- [EAS Build Secrets](https://docs.expo.dev/build-reference/variables/)
