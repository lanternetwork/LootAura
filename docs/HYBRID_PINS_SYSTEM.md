# Hybrid Pins System Documentation

## Overview

The Hybrid Pins System combines **location-based grouping** with **visual clustering** to provide an optimal user experience for displaying sales on maps. This system addresses the unique requirements of yard sale applications where multiple sales can occur at the same address.

## Architecture

### Two-Stage Process

```
Stage 1: Location-Based Grouping (Business Logic)
├── Group sales by exact coordinates
├── Create "location groups" with all sales at same address
└── Result: One "location pin" per unique address

Stage 2: Visual Clustering (Supercluster)
├── Apply supercluster to location pins
├── Cluster nearby locations when they overlap visually
└── Result: Clusters of locations, with zoom expansion
```

## Core Components

### 1. Hybrid Clustering Engine (`lib/pins/hybridClustering.ts`)

**Purpose**: Orchestrates the two-stage clustering process

**Key Functions**:
- `groupSalesByLocation()` - Stage 1: Groups sales by coordinates
- `applyVisualClustering()` - Stage 2: Applies supercluster to locations
- `createHybridPins()` - Main function that combines both stages

**Configuration Options**:
```typescript
interface HybridClusteringOptions {
  coordinatePrecision: number      // Decimal places for coordinate matching
  clusterRadius: number           // Visual clustering radius in pixels
  minClusterSize: number          // Minimum locations to form a cluster
  maxZoom: number                // Zoom level where clustering stops
  enableLocationGrouping: boolean // Enable/disable location grouping
  enableVisualClustering: boolean // Enable/disable visual clustering
}
```

### 2. Location Pin Component (`components/location/LocationPin.tsx`)

**Purpose**: Renders individual location pins (one per unique address)

**Features**:
- Small red circular pins (8px)
- Shows total sales count in tooltip
- Click to filter sales list to that location
- Visual selection state

### 3. Hybrid Pins Overlay (`components/location/HybridPinsOverlay.tsx`)

**Purpose**: Renders the complete hybrid pin system

**Features**:
- Handles both clusters and individual locations
- Manages viewport-based clustering
- Provides click handlers for both pin types

### 4. Updated SimpleMap (`components/location/SimpleMap.tsx`)

**Purpose**: Enhanced to support hybrid pins alongside existing pin systems

**New Props**:
```typescript
hybridPins?: HybridPinsProps & { 
  viewport: { bounds: [number, number, number, number]; zoom: number } 
}
```

## Data Flow

### 1. Sales Data Input
```typescript
// Input: Array of sales with coordinates
const sales: Sale[] = [
  { id: '1', lat: 38.2527, lng: -85.7585, address: '123 Main St' },
  { id: '2', lat: 38.2527, lng: -85.7585, address: '123 Main St' },
  { id: '3', lat: 38.2600, lng: -85.7600, address: '456 Oak Ave' }
]
```

### 2. Location Grouping (Stage 1)
```typescript
// Output: Location groups
const locations: LocationGroup[] = [
  {
    id: 'location-0',
    lat: 38.2527,
    lng: -85.7585,
    sales: [sale1, sale2],
    totalSales: 2
  },
  {
    id: 'location-1', 
    lat: 38.2600,
    lng: -85.7600,
    sales: [sale3],
    totalSales: 1
  }
]
```

### 3. Visual Clustering (Stage 2)
```typescript
// Output: Hybrid pins result
const result: HybridPinsResult = {
  type: 'individual', // or 'clustered'
  pins: [
    { type: 'location', id: 'location-0', lat: 38.2527, lng: -85.7585, sales: [...] },
    { type: 'location', id: 'location-1', lat: 38.2600, lng: -85.7600, sales: [...] }
  ],
  locations: [...],
  clusters: undefined
}
```

## User Interactions

### 1. Location Pin Click
- **Action**: Click on a location pin
- **Result**: Sales list filters to show only sales from that location
- **UI**: Header shows "(Location selected)" and "Show All Sales" button appears

### 2. Cluster Click
- **Action**: Click on a cluster
- **Result**: Map zooms in to expand the cluster, showing individual location pins
- **Behavior**: Smooth zoom transition to reveal underlying locations

### 3. Show All Sales
- **Action**: Click "Show All Sales" button
- **Result**: Clears location selection, shows all sales in viewport
- **UI**: Returns to normal state

## Visual Behavior Examples

### Sparse Area (No Clustering)
```
Map View: [Pin A]     [Pin B]     [Pin C]
Sales:    A1, A2      B1          C1, C2, C3
```
- **Result**: 3 individual location pins
- **Interaction**: Click any pin to see sales at that location

### Dense Area (With Clustering)
```
Map View: [Cluster 5]     [Pin D]
Sales:    A1,A2 + B1 + C1  D1,D2
```
- **Result**: 1 cluster (locations A, B, C) + 1 individual pin
- **Interaction**: Click cluster to zoom in, click individual pin to filter

### Zoomed In (Expanded Cluster)
```
Map View: [Pin A] [Pin B] [Pin C] [Pin D]
Sales:    A1,A2   B1     C1     D1,D2
```
- **Result**: 4 individual location pins
- **Interaction**: Click any pin to see sales for that location

## Configuration

### Default Settings
```typescript
const DEFAULT_OPTIONS: HybridClusteringOptions = {
  coordinatePrecision: 6,        // 6 decimal places ≈ 0.1m accuracy
  clusterRadius: 0.5,           // Very tight clustering (0.5px)
  minClusterSize: 2,            // Minimum 2 locations to cluster
  maxZoom: 16,                  // Stop clustering at zoom 16
  enableLocationGrouping: true,  // Always group by coordinates
  enableVisualClustering: true  // Enable visual clustering
}
```

### Feature Flags
```typescript
// Environment variable to disable clustering entirely
NEXT_PUBLIC_FEATURE_CLUSTERING !== 'false'
```

## Performance Considerations

### 1. Location Grouping
- **Complexity**: O(n) where n = number of sales
- **Memory**: Minimal overhead, just coordinate-based grouping
- **CPU**: Very fast, simple coordinate matching

### 2. Visual Clustering
- **Complexity**: O(n log n) where n = number of locations
- **Memory**: Supercluster index for efficient queries
- **CPU**: Only runs when clustering is enabled and viewport changes

### 3. Viewport Optimization
- **Debouncing**: Viewport changes are debounced to prevent excessive recalculations
- **Caching**: Location groups are memoized and only recalculated when sales data changes
- **Lazy Loading**: Clustering only runs when needed

## Comparison with Previous Systems

### Original Supercluster System
- **Purpose**: Visual decluttering only
- **Behavior**: Clusters individual sales by visual proximity
- **Limitation**: Doesn't understand business logic (same address = same location)

### Location-Based Grouping (Previous)
- **Purpose**: Business logic grouping only
- **Behavior**: One pin per unique address, no visual clustering
- **Limitation**: Dense areas show overlapping pins

### Hybrid System (Current)
- **Purpose**: Combines both approaches
- **Behavior**: Groups by address first, then clusters locations visually
- **Advantage**: Best of both worlds - semantic correctness + visual decluttering

## Implementation Details

### Type Definitions
```typescript
interface LocationGroup {
  id: string
  lat: number
  lng: number
  sales: Sale[]
  totalSales: number
}

interface HybridPin {
  type: 'cluster' | 'location'
  id: string
  lat: number
  lng: number
  count?: number        // For clusters
  sales?: Sale[]       // For locations
  expandToZoom?: number // For clusters
}

interface HybridPinsResult {
  type: 'clustered' | 'individual'
  pins: HybridPin[]
  locations: LocationGroup[]
  clusters?: ClusterFeature[]
}
```

### Integration with SalesClient
```typescript
// In SalesClient.tsx
const hybridResult = useMemo(() => {
  if (!currentViewport) return null
  
  return createHybridPins(mapSales, currentViewport, {
    coordinatePrecision: 6,
    clusterRadius: 0.5,
    minClusterSize: 2,
    maxZoom: 16,
    enableLocationGrouping: true,
    enableVisualClustering: true
  })
}, [mapSales, currentViewport])
```

### SimpleMap Integration
```typescript
// In SimpleMap.tsx
<SimpleMap
  hybridPins={{
    sales: mapSales,
    selectedId: selectedPinId,
    onLocationClick: (locationId) => setSelectedPinId(locationId),
    onClusterClick: handleClusterClick,
    viewport: currentViewport
  }}
  onViewportChange={handleViewportChange}
/>
```

## Testing

### Unit Tests
- Test location grouping with various coordinate precisions
- Test visual clustering with different viewport sizes
- Test hybrid system with mixed scenarios

### Integration Tests
- Test pin click interactions
- Test cluster expansion behavior
- Test sales list filtering

### Performance Tests
- Test with large datasets (1000+ sales)
- Test viewport change performance
- Test memory usage with clustering

## Future Enhancements

### 1. Advanced Clustering
- **Hierarchical Clustering**: Multiple zoom levels with different cluster sizes
- **Smart Clustering**: Cluster based on address similarity, not just coordinates
- **Custom Cluster Styles**: Different visual styles for different cluster types

### 2. Enhanced Interactions
- **Cluster Preview**: Hover to see cluster contents
- **Bulk Operations**: Select multiple locations at once
- **Advanced Filtering**: Filter by cluster size, location type, etc.

### 3. Performance Optimizations
- **Web Workers**: Move clustering calculations to background threads
- **Progressive Loading**: Load clusters as user zooms in
- **Smart Caching**: Cache cluster results for common viewports

## Troubleshooting

### Common Issues

1. **Pins Not Appearing**
   - Check coordinate precision settings
   - Verify sales data has valid lat/lng values
   - Check viewport bounds calculation

2. **Clustering Too Aggressive**
   - Increase `clusterRadius` value
   - Increase `minClusterSize` value
   - Check zoom level settings

3. **Performance Issues**
   - Reduce `coordinatePrecision` for faster grouping
   - Increase debounce time for viewport changes
   - Consider disabling clustering for very large datasets

### Debug Logging
```typescript
// Enable debug logging
NEXT_PUBLIC_DEBUG=true

// Console output will show:
// [HYBRID_PINS] Result: { type: 'clustered', pinsCount: 5, locationsCount: 12 }
// [SALES] Showing sales for selected location: { locationId: 'location-0', salesCount: 3 }
```

## Migration Guide

### From Original Supercluster
1. Replace `PinsOverlay` with `HybridPinsOverlay`
2. Update `SimpleMap` props to use `hybridPins` instead of `pins`
3. Update click handlers to use `onLocationClick` instead of `onPinClick`

### From Location-Based Grouping
1. Add viewport tracking for clustering
2. Update pin rendering to handle both clusters and locations
3. Add cluster click handlers for zoom expansion

## Conclusion

The Hybrid Pins System provides an optimal solution for yard sale applications by combining the semantic correctness of location-based grouping with the visual benefits of clustering. This system ensures that users can easily understand the relationship between sales and locations while maintaining good performance and user experience in dense areas.
