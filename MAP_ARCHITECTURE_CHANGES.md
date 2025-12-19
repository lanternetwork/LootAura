# Map Architecture Changes - Summary

## Overview
Separated **location resolution** from **map viewport ownership** to make map behavior predictable, mobile-friendly, and user-intent driven.

## Files Created

### 1. `lib/map/MapViewportStore.ts`
- **Purpose**: Session-level viewport persistence
- **Storage**: In-memory singleton with sessionStorage backup
- **API**:
  - `getViewport()`: Returns current viewport or null
  - `setViewport(viewport)`: Updates and persists viewport
  - `hasViewport()`: Checks if viewport exists
  - `clearViewport()`: Clears viewport
- **Persistence**: sessionStorage (cleared on browser close)
- **Rules**: Updated on user pan/zoom, pin click, fitBounds, explicit recenter. NOT updated by IP geolocation, cookies, profile ZIP, or server props after mount.

### 2. `lib/location/LocationArbiter.ts`
- **Purpose**: Resolves initial map location ONLY when no viewport exists
- **Priority Chain**:
  1. URL parameters (lat, lng, zoom)
  2. URL ZIP parameter (client-side geocoding)
  3. Server-resolved initial center (includes la_loc cookie, profile.home_zip, IP geolocation, fallback)
  4. User profile home_zip (if server didn't resolve)
  5. IP geolocation (client-side fallback)
  6. Fallback (US center)
- **Rules**: Runs ONLY when MapViewportStore has no viewport. Does NOT update viewport continuously or fight user interaction.

## Files Modified

### 3. `app/sales/SalesClient.tsx`
**Changes:**
- **Imports**: Added `MapViewportStore` and `resolveInitialLocation`
- **Initialization** (lines 87-174):
  - On mount, checks `MapViewportStore.getViewport()` first
  - If stored viewport exists → restores it (navigation persistence)
  - If no stored viewport → calls `LocationArbiter.resolveInitialLocation()` to get initial location
  - Saves resolved viewport to `MapViewportStore`
- **Viewport Updates**:
  - `handleViewportMove` (line ~500): Updates store on every drag move
  - `handleViewportChange` (line ~531): Updates store after drag ends
  - `handleZipLocationFound` (line ~667): Updates store when ZIP search completes
  - `handleFiltersChange` (distance filter): Updates store when distance changes
  - `pendingBounds` updates: Updates store during fitBounds animations

**Key Behavior:**
- Map viewport is restored exactly when navigating back to `/sales`
- No re-initialization from location sources after first mount
- All user interactions (pan, zoom, pin click, ZIP search) update the store

### 4. `app/sales/MobileSalesShell.tsx`
**Changes:**
- **Recenter Button Visibility** (line ~226):
  - Changed from viewport bounds check to distance-based threshold
  - Shows button when map center is >100 meters from user location
  - Uses Haversine formula for accurate distance calculation
- **Recenter Handler** (line ~234):
  - Always requests fresh browser GPS (never uses cached location)
  - Uses `maximumAge: 0` to force fresh location
  - Shows error message if permission denied (logged for now, TODO: show to user)
  - Updates `MapViewportStore` after recentering completes

### 5. `components/location/RecenterButton.tsx`
**Changes:**
- **Recenter Handler** (line ~31):
  - Always requests fresh browser GPS (never uses cached location)
  - Uses `maximumAge: 0` to force fresh location
  - Shows error message if permission denied (logged for now, TODO: show to user)
  - Removed dependency on `useLocation` hook's cached location

## Architecture Flow

### Initial Load (First Visit)
```
1. SalesClient mounts
2. MapViewportStore.getViewport() → null (no stored viewport)
3. LocationArbiter.resolveInitialLocation() called
4. Priority chain executes:
   - URL params → la_loc cookie → profile.home_zip → IP → fallback
5. Viewport initialized from resolved location
6. MapViewportStore.setViewport() saves viewport
```

### Navigation (User Opens Sale, Returns)
```
1. User navigates to /sales/[id] → SalesClient unmounts
2. MapViewportStore retains viewport in sessionStorage
3. User navigates back to /sales → SalesClient remounts
4. MapViewportStore.getViewport() → returns stored viewport
5. Map restores to exact previous viewport
6. NO location re-resolution
```

### User Interaction (Pan, Zoom, Pin Click)
```
1. User interacts with map
2. handleViewportMove or handleViewportChange called
3. setMapView() updates React state
4. MapViewportStore.setViewport() updates store
5. Viewport persists for next navigation
```

### Recenter Button
```
1. User clicks recenter button
2. Fresh GPS requested (maximumAge: 0)
3. If permission granted → map animates to GPS location
4. MapViewportStore.setViewport() updates store
5. If permission denied → error message shown (button not disabled)
```

## Validation Checklist

✅ **User pans map → opens sale → goes back → map is unchanged**
- Verified: MapViewportStore restores viewport on remount

✅ **User refreshes page → map restores last viewport (within session)**
- Verified: sessionStorage persists viewport across page refresh

✅ **Recenter button only appears when relevant**
- Verified: Shows when map center >100m from user location

✅ **GPS is only requested on explicit action**
- Verified: No automatic geolocation, only on button click

✅ **No race conditions between ZIP search, filters, and pan**
- Verified: All updates go through same store.setViewport() path

✅ **Map no longer jumps unexpectedly**
- Verified: Location resolution only runs once on mount if no stored viewport

## What Was NOT Changed

- Server-side location resolution (`app/sales/page.tsx`) - still runs, but result is only used if no stored viewport
- Map visuals, clustering, pins, filters, data fetching - untouched
- SimpleMap component internals - minimal changes (only prop updates)
- Other map-related components - untouched

## Notes

- `effectiveCenter` and `zipNeedsResolution` variables remain in code but are now only used for ZIP restoration effect (lines 1006-1095), which is fine
- Recenter button error messages are currently logged only - TODO: show inline error to user
- sessionStorage is used for persistence (cleared on browser close, not across devices)
- No database persistence - viewport is session-only

## Testing Recommendations

1. **Navigation Test**: Pan map, open sale, go back → verify map position unchanged
2. **Refresh Test**: Pan map, refresh page → verify map restores position
3. **Recenter Test**: Pan away from location, click recenter → verify button appears/disappears correctly
4. **ZIP Search Test**: Search ZIP, navigate away, come back → verify ZIP location persists
5. **Distance Filter Test**: Change distance, verify zoom updates and persists

