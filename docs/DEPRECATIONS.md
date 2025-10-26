# Deprecations

This document summarizes deprecated components and utilities that have been moved to the `deprecated/` folder and their replacement guidance.

## Overview

During the map stack cleanup, several legacy components and utilities were deprecated in favor of the new `SimpleMap` component with the pins system. All deprecated items have been moved to the `deprecated/` folder with `@deprecated` headers.

## Deprecated Components

### `components/location/SalesMap.tsx`
- **Status**: Moved to `deprecated/components/SalesMap.tsx`
- **Replacement**: Use `components/location/SimpleMap.tsx`
- **Reason**: Replaced by SimpleMap with pins prop for better clustering support
- **Migration**: Replace `SalesMap` imports with `SimpleMap` and use the `pins` prop

### `components/location/SalesMapClustered.tsx`
- **Status**: Moved to `deprecated/components/SalesMapClustered.tsx`
- **Replacement**: Use `components/location/SimpleMap.tsx` with clustering enabled
- **Reason**: Replaced by SimpleMap with integrated clustering via pins system
- **Migration**: Replace `SalesMapClustered` imports with `SimpleMap` and use the `pins` prop

## Deprecated Utilities

### `lib/clustering.ts`
- **Status**: Moved to `deprecated/lib/clustering.ts`
- **Replacement**: Use `lib/pins/clustering.ts`
- **Reason**: Replaced by new pins-based clustering system
- **Migration**: Update imports from `@/lib/clustering` to `@/lib/pins/clustering`

## Deprecated Tests

### `tests/integration/map.clusters-flow.test.tsx`
- **Status**: Moved to `deprecated/tests/map.clusters-flow.test.tsx`
- **Reason**: Tests deprecated SalesMapClustered component
- **Note**: Not run by CI

### `tests/integration/map.debounce-ui.smoke.test.tsx`
- **Status**: Moved to `deprecated/tests/map.debounce-ui.smoke.test.tsx`
- **Reason**: Tests deprecated SalesMapClustered component
- **Note**: Not run by CI

### `tests/integration/map.prefetch-offline.test.tsx`
- **Status**: Moved to `deprecated/tests/map.prefetch-offline.test.tsx`
- **Reason**: Tests deprecated SalesMapClustered component
- **Note**: Not run by CI

### `tests/a11y/map.keyboard.test.tsx`
- **Status**: Moved to `deprecated/tests/map.keyboard.test.tsx`
- **Reason**: Tests deprecated SalesMapClustered component
- **Note**: Not run by CI

## Migration Guide

### From SalesMap to SimpleMap

**Before:**
```tsx
import SalesMap from '@/components/location/SalesMap'

<SalesMap
  sales={sales}
  center={center}
  zoom={zoom}
  onSaleClick={handleSaleClick}
/>
```

**After:**
```tsx
import SimpleMap from '@/components/location/SimpleMap'

<SimpleMap
  center={center}
  zoom={zoom}
  pins={{
    sales: sales.map(s => ({ id: s.id, lat: s.lat, lng: s.lng })),
    selectedId: selectedSaleId,
    onPinClick: (id) => handleSaleClick(sales.find(s => s.id === id)),
    onClusterClick: ({ lat, lng, expandToZoom }) => {
      // Handle cluster expansion
    }
  }}
/>
```

### From SalesMapClustered to SimpleMap

**Before:**
```tsx
import SalesMapClustered from '@/components/location/SalesMapClustered'

<SalesMapClustered
  sales={sales}
  markers={markers}
  center={center}
  zoom={zoom}
  onClusterClick={handleClusterClick}
/>
```

**After:**
```tsx
import SimpleMap from '@/components/location/SimpleMap'

<SimpleMap
  center={center}
  zoom={zoom}
  pins={{
    sales: sales.map(s => ({ id: s.id, lat: s.lat, lng: s.lng })),
    selectedId: null,
    onPinClick: (id) => handlePinClick(id),
    onClusterClick: ({ lat, lng, expandToZoom }) => handleClusterClick({ lat, lng, expandToZoom })
  }}
/>
```

### From Legacy Clustering to Pins Clustering

**Before:**
```tsx
import { buildClusterIndex, getClustersForViewport } from '@/lib/clustering'
```

**After:**
```tsx
import { buildClusterIndex, getClustersForViewport } from '@/lib/pins/clustering'
```

## ESLint Rules

The following ESLint rules have been added to prevent importing deprecated components:

- `no-restricted-imports` for `@/components/location/SalesMap`
- `no-restricted-imports` for `@/components/location/SalesMapClustered`
- `no-restricted-imports` for `@/lib/clustering`
- `no-restricted-imports` for any imports from `deprecated/` folder

## Feature Flags

The clustering system is controlled by a single feature flag:

- `NEXT_PUBLIC_FEATURE_CLUSTERING` (default: `true`)
  - When `true`: Enables clustering in SimpleMap
  - When `false`: Renders plain pins only

## Cleanup Status

✅ **Completed:**
- All deprecated components moved to `deprecated/` folder
- All app code updated to use SimpleMap
- All test files updated or moved to deprecated
- ESLint rules added to prevent regressions
- CSS duplicates removed
- Legacy DOM-based map instance detection removed

## Notes

- Deprecated components are not loaded by the app
- Deprecated tests are not run by CI
- All deprecated items have `@deprecated` headers
- The `deprecated/` folder is ignored by ESLint for import restrictions
- SimpleMap provides full backward compatibility through the pins prop system
