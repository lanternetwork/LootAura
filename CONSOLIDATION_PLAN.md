# Dashboard/Profile Consolidation Plan

## Current State

### Dashboard Files
- `app/(dashboard)/dashboard/page.tsx` - Server component, fetches sales/drafts
- `app/(dashboard)/dashboard/DashboardClient.tsx` - Client component, manages state
- `components/dashboard/SalesPanel.tsx` - Sales grid display
- `components/dashboard/DraftsPanel.tsx` - Drafts grid with error handling
- `components/dashboard/DraftCard.tsx` - Individual draft card
- `components/dashboard/AnalyticsPanel.tsx` - Placeholder analytics

### Profile Files
- `app/(account)/profile/page.tsx` - Auth wrapper, renders ProfileClient
- `app/(account)/profile/ProfileClient.tsx` - Large client component (417 lines)
- `components/profile/IdentityCard.tsx` - Avatar, name, location, actions
- `components/profile/AboutCard.tsx` - Editable bio/location
- `components/profile/OwnerMetrics.tsx` - Metrics display (views, saves, CTR, fulfilled)
- `components/profile/PreferencesCard.tsx` - Theme/units preferences
- `components/profile/OwnerListingsTabs.tsx` - Active/Drafts/Archived tabs

### Data Helpers
- `lib/data/salesAccess.ts` - getUserSales, getUserDrafts (existing)
- No SSR helpers for profile, metrics, preferences yet

## Target State

### Shared Components (components/dashboard/)
1. **ProfileSummaryCard.tsx** - Extract from IdentityCard, presentational only
2. **DraftsPanel.tsx** - Update existing, use shared DraftCard
3. **SalesPanel.tsx** - Update existing, remove debug logs
4. **AnalyticsPanel.tsx** - Update to use real metrics from OwnerMetrics
5. **PreferencesCard.tsx** - Move from profile/, add radius/email opt-in

### SSR Data Helpers (lib/data/)
1. **getUserProfile()** - Read from profiles_v2 view, return profile data
2. **getUserMetrics7d()** - Read from metrics source, return 7-day metrics
3. **getUserPreferences()** - Read preferences, return theme/units/radius/email
4. **getUserSales()** - Already exists, reuse
5. **getUserDrafts()** - Already exists, reuse

### Pages
1. **/dashboard** - SSR fetch all data, render shared components
2. **/profile** - Redirect to /dashboard#profile (preferred) or render shared components

## Mapping

| Current Module | New Shared Component | Data Source |
|---------------|---------------------|-------------|
| IdentityCard (profile) | ProfileSummaryCard | getUserProfile() |
| OwnerMetrics (profile) | AnalyticsPanel | getUserMetrics7d() |
| PreferencesCard (profile) | PreferencesCard (moved) | getUserPreferences() |
| DraftsPanel (dashboard) | DraftsPanel (updated) | getUserDrafts() |
| SalesPanel (dashboard) | SalesPanel (updated) | getUserSales() |
| AboutCard (profile) | Not needed in dashboard | (Keep in profile if needed) |
| OwnerListingsTabs (profile) | SalesPanel handles this | getUserSales() |

## Implementation Order

1. Create SSR data helpers (lib/data/profileAccess.ts)
2. Create ProfileSummaryCard component
3. Update existing dashboard components
4. Update /dashboard page to use SSR + shared components
5. Update /profile to redirect or use shared components
6. Remove debug logs
7. Write tests

