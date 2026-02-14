# Mobile Map Authority Implementation Summary

## Overview

Implemented an explicit session-level map authority model to fix mobile GPS-first behavior and prevent unexpected map recentering.

## Changes Made

### 1. Authority Management (`lib/map/authority.ts`)
- **New file**: Session-level authority state management
- **States**: `'system'` (default) and `'user'` (permanent for session)
- **Storage**: `sessionStorage['map:authority']` (resets on hard refresh/new tab)
- **Functions**:
  - `getMapAuthority()`: Get current authority (defaults to 'system')
  - `setMapAuthority()`: Set authority (prevents downgrade from 'user' to 'system')
  - `flipToUserAuthority()`: One-way flip to user authority
  - `isColdStart()`: Check if no authority set (cold start)
  - `isUserAuthority()` / `isSystemAuthority()`: Authority checks

### 2. Initial Viewport Resolver (`lib/map/initialViewportResolver.ts`)
- **Updated**: Authority-aware precedence logic
- **Mobile Cold Start**: GPS-first (ignores persistence/cookies/URL params unless user-initiated)
- **User Authority**: All automatic sources ignored, only explicit user actions allowed
- **Desktop**: Normal precedence (unchanged behavior)

**Key Changes**:
- Added authority checks before resolving viewport
- Mobile cold start always attempts GPS (even if persisted viewport exists)
- User authority returns `source: 'user'` with null viewport (preserves current state)

### 3. Sales Client (`app/sales/SalesClient.tsx`)
- **Updated**: Authority management and user action tracking
- **GPS Recentering**: Only if authority is still 'system'
- **User Action Handlers**: All flip authority to 'user' immediately:
  - `handleViewportMove`: Map pan/zoom
  - `handleZipLocationFound`: ZIP search
  - `handleUseMyLocation`: "Use my location" button
  - `handleFiltersChange`: Distance filter changes that recenter

**Key Changes**:
- Import `flipToUserAuthority` and `isUserAuthority`
- GPS recentering checks `!isUserAuthority()` before applying
- All user actions call `flipToUserAuthority()` immediately

### 4. Server-Side Page (`app/sales/page.tsx`)
- **Updated**: Reduced server-side overrides on mobile
- **Mobile Detection**: User-agent based (best-effort)
- **Cookie/Profile Skip**: On mobile requests, skip cookie and profile `home_zip` lookups
- **IP Fallback**: Still available as fallback after GPS fails

**Key Changes**:
- Added `isMobileRequest` detection via user agent
- Skip `la_loc` cookie on mobile requests
- Skip `home_zip` profile lookup on mobile requests
- IP geolocation still available as fallback

### 5. Integration Test (`tests/integration/viewport.persistence.test.tsx`)
- **Added**: Comprehensive authority leak prevention test
- **Test Name**: "Mobile map authority does not leak after user intent"
- **Phases**:
  1. Cold start → GPS attempted
  2. User action (ZIP search) → Authority flips to user
  3. Delayed GPS → Must be ignored
  4. Navigation → Authority persists
  5. Persistence → Must not override user authority
  6. Hard refresh → Authority resets, GPS attempted again

**Additional Tests**:
- Persisted viewport cannot override GPS on mobile cold start
- URL params behavior on mobile cold start

## Behavior Summary

### Cold Start (Mobile, <768px)
| Scenario | Behavior |
|----------|----------|
| No URL params, no persistence | GPS attempted → IP fallback → US center |
| Persisted viewport exists | GPS attempted (ignores persistence) → IP fallback |
| URL params exist | URL params used (user-initiated navigation) |
| GPS permission denied | IP fallback → US center |
| GPS timeout | IP fallback → US center |

### Active Session
| Scenario | Behavior |
|----------|----------|
| User pans map | Authority → 'user', no auto-recenter |
| User searches ZIP | Authority → 'user', map centers on ZIP |
| User changes distance filter | Authority → 'user', map recenters to new distance |
| User clicks "Use my location" | Authority → 'user', map centers on GPS |
| GPS result arrives late | Ignored (authority is 'user') |
| Navigation to sale detail | Authority persists, map state preserved |
| Component remount | Authority persists (sessionStorage) |
| Hard refresh | Authority resets to 'system', GPS attempted |

### Desktop (≥768px)
| Scenario | Behavior |
|----------|----------|
| Initial load | URL params → Persisted → IP fallback |
| "Use my location" button | Authority → 'user', map centers on GPS |
| User actions | Authority → 'user', no auto-recenter |
| Behavior | Unchanged (respects authority rules) |

## Files Changed

1. `lib/map/authority.ts` (new)
2. `lib/map/initialViewportResolver.ts` (modified)
3. `app/sales/SalesClient.tsx` (modified)
4. `app/sales/page.tsx` (modified)
5. `tests/integration/viewport.persistence.test.tsx` (modified)

## Why These Changes Satisfy Requirements

### ✅ Requirement 1: Authority Model
- **Implemented**: Session-level authority with `sessionStorage`
- **Two states**: `'system'` and `'user'`
- **Persistence**: Survives navigation, resets on hard refresh

### ✅ Requirement 2: Cold Start GPS-First
- **Implemented**: Mobile cold start always attempts GPS first
- **Ignores**: Persistence, cookies, URL params (unless user-initiated)
- **Fallback**: IP geolocation → US center

### ✅ Requirement 3: User Authority Triggers
- **Implemented**: All user actions flip authority immediately
- **Actions**: Map pan/zoom, ZIP search, filter changes, "Use my location"
- **Protection**: Once 'user', GPS/cookies/persistence/IP ignored

### ✅ Requirement 4: Persistence Rules
- **Implemented**: Persistence only for navigation, never overrides GPS or user intent
- **Usage**: Preserves map state between routes during session
- **Restriction**: Never used on mobile cold start or when authority is 'user'

### ✅ Requirement 5: ZIP Search Semantics
- **Implemented**: ZIP search immediately flips authority to 'user'
- **Override**: GPS, cookies, persistence all ignored
- **Late GPS**: Discarded if arrives after ZIP search

### ✅ Requirement 6: Desktop Behavior
- **Implemented**: Minimal changes, respects authority rules
- **No GPS prompts**: Desktop unchanged (manual button only)
- **Authority rules**: Same protection against auto-recenter

### ✅ Requirement 7: Re-centering Guarantees
- **Implemented**: Map never recenters automatically once authority is 'user'
- **Navigation**: Authority persists via sessionStorage
- **Remounts**: Authority persists (not component refs)
- **Reset**: Only on session reset (hard refresh/new tab)

### ✅ Requirement 8: Integration Test
- **Implemented**: Comprehensive test proving authority never leaks
- **Coverage**: All phases from cold start to hard refresh
- **Assertions**: Authority rules enforced at every step

## Testing

Run the integration test:
```bash
npm test -- tests/integration/viewport.persistence.test.tsx
```

The test verifies:
- GPS-first on mobile cold start
- User actions flip authority immediately
- GPS results ignored after user authority
- Authority persists across navigation
- Persistence cannot override user authority
- Hard refresh resets authority

## Notes

- **Server-side mobile detection**: Best-effort via user agent (client-side has accurate viewport width)
- **SessionStorage availability**: Gracefully handles private browsing mode (defaults to 'system')
- **Backward compatibility**: Desktop behavior unchanged, mobile gets GPS-first on cold start
- **Minimal changes**: Only modified necessary files, no new features added
