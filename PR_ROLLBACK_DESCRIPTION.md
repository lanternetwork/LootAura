# Rollback /app namespace + WebView navigation experiments (restore pre-#216 stability)

## Summary

This PR restores the repository to the effective state immediately before PR #216 ("Add dedicated /app namespace…") and all dependent follow-on PRs that modified WebView navigation. This rollback removes the `/app` namespace infrastructure and all subsequent navigation experiments that attempted to fix white page issues.

## Reverted PRs (in reverse chronological order)

1. **PR #234** - Fix build: remove orphaned code block causing syntax error
2. **PR #233** - Fix white page: sync source prop to navState.url + normalize href + reload guard + syntax fixes
3. **PR #232** - Fix white page: sync source prop to navState.url + normalize href + reload guard
4. **PR #231** - Fix white page: sync source prop to navState.url + normalize href
5. **PR #230** - Canonicalize in-app header navigation to /app/* only
6. **PR #229** - HOTFIX: Eliminate white pages with immutable WebView source
7. **PR #228** - Fix white page navigation by syncing URL state
8. **PR #227** - Fix white pages with enterprise navigation state model
9. **PR #226** - Fix blank pages with origin-based navigation policy
10. **PR #225** - Fix header navigation blank pages with explicit WebView navigation
11. **PR #224** - Fix header navigation URL resolution and add diagnostics
12. **PR #223** - fix(nav): Fix blank-page navigation from header links
13. **PR #222** - Harden oauth callback
14. **PR #220** - fix(diagnostics): Ensure blank-space diagnostics report real values
15. **PR #219** - fix(native): Restore native footer with reliable route detection
16. **PR #218** - feat(phase-b): Keep navigation inside /app namespace

## Changes Restored

### WebView Entry Point
- **Before rollback:** `LOOTAURA_URL = 'https://lootaura.com/app/sales'`
- **After rollback:** `LOOTAURA_URL = 'https://lootaura.com'`

### Removed Infrastructure
- Deleted `/app/app/layout.tsx` (native shell layout without web footer)
- Deleted `/app/app/sales/page.tsx` (sales list in /app namespace)
- Deleted `/app/app/sales/[id]/page.tsx` (sale detail in /app namespace)
- Deleted `/mobile/app/auth/callback.tsx` (OAuth callback route)

### Removed Navigation Experiments
- Removed commanded/observed URL state model
- Removed source prop syncing to navState.url
- Removed reload guards and deferred source updates
- Removed immutable WebView source hotfix
- Removed origin-based navigation policy
- Removed explicit WebView navigation via injectJavaScript
- Removed header href normalization to /app/*
- Removed extensive navigation diagnostics

### Restored Behavior
- WebView entry URL points to root (`https://lootaura.com`)
- Header navigation uses standard paths (no /app normalization)
- Navigation uses state-driven WebView source updates
- OAuth callback handling removed (will be reintroduced separately)

## Version

- Incremented `versionCode` from 63 to 64

## Follow-up Plan

1. **Reintroduce Google OAuth handling** in an isolated PR without moving the app under `/app`
   - OAuth callback deep link handling can be restored without the `/app` namespace
   - This will be a separate, focused PR to avoid the complexity that led to the white page issues

2. **Future /app namespace implementation** (if needed)
   - Will require a more careful, incremental approach
   - Must avoid the navigation state conflicts that caused persistent white pages
   - Should be validated thoroughly before merging

## Testing

- [ ] Verify WebView loads `https://lootaura.com` on app start
- [ ] Verify header navigation works without white pages
- [ ] Verify sale detail pages load correctly
- [ ] Verify native footer overlay works on sale detail
- [ ] Run Expo export:embed to ensure build passes
