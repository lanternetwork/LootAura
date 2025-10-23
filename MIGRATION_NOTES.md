# Migration Notes: Intent System Removal

## Overview

The intent/arbiter system has been completely removed in favor of a simplified **map-as-source** architecture. This document outlines what was removed and how to add future features without reintroducing complexity.

## What Was Removed

### 1. Intent/Arbiter System
- **Files Removed**: `lib/sales/intent.ts`, `lib/sales/dedupe.ts`
- **Types Removed**: `ControlArbiter`, `AuthorityMode`, `ControlMode`, `FetchContext`
- **State Removed**: `arbiter`, `setAuthority()`, `bumpSeq()`, `seqRef`
- **Logic Removed**: Authority-based fetch suppression, sequence gating

### 2. Complex State Management
- **Removed**: `clusterLock`, `programmaticMoveGuard`, `viewportSeqRef`
- **Removed**: Authority-based query shape computation
- **Removed**: Dual data sources (map vs filters)

### 3. Test Files Removed
- `tests/unit/arbiter.test.ts`
- `tests/unit/arbiterDecisions.test.ts`
- `tests/unit/mapAuthorityQuery.test.ts`
- `tests/stability/arbiter.contract.spec.ts`

### 4. Component Props Removed
- `arbiterMode` and `arbiterAuthority` props from map components
- Authority display logic in `FiltersModal`
- Authority-based move blocking in map components

## What Was Added

### 1. Simplified Data Flow
- **Single Source**: Map viewport is the only data source
- **Bbox Fetching**: All sales fetched using viewport bounds
- **Deduplication**: Simple deduplication by `sale.id`

### 2. Enhanced ZIP Search
- **ZIP+4 Support**: Accepts both 5-digit and ZIP+4 formats
- **Bbox Support**: Uses bounding box for precise map fitting
- **URL Persistence**: ZIP parameter saved to URL
- **Loading States**: Spinner and inline error handling

### 3. Zillow-style Layout
- **Map Left**: Dominant map on the left side
- **List Right**: Scrollable list on the right panel
- **Filters Top**: Single-row filters bar at the top

### 4. Console Cleanup
- **Telemetry Disabled**: Mapbox telemetry turned off
- **CSP Headers**: Content Security Policy configured
- **Manifest Access**: PWA manifest properly accessible

## How to Add Future Features

### ✅ DO: Simple Patterns

#### 1. Map-based Features
```typescript
// Add new map interaction
const handleNewMapFeature = useCallback(() => {
  // Update map view
  setMapView(prev => ({ ...prev, /* changes */ }))
  
  // Trigger fetch for new viewport
  fetchMapSales()
}, [fetchMapSales])
```

#### 2. Filter-based Features
```typescript
// Add new filter
const handleFilterChange = (newFilter: any) => {
  updateFilters(newFilter)
  // Trigger refetch with new filters
  fetchMapSales()
}
```

#### 3. Sales Display Features
```typescript
// Add new sales processing
const processedSales = useMemo(() => {
  return mapSales.map(sale => ({
    ...sale,
    // Add new processing
  }))
}, [mapSales])
```

### ❌ DON'T: Complex Patterns

#### 1. Don't Add Authority Systems
```typescript
// ❌ DON'T DO THIS
const [authority, setAuthority] = useState<'MAP' | 'FILTERS'>('MAP')
if (authority === 'MAP') {
  // Different logic
} else {
  // Other logic
}
```

#### 2. Don't Add Sequence Gating
```typescript
// ❌ DON'T DO THIS
const [seq, setSeq] = useState(0)
const bumpSeq = () => setSeq(prev => prev + 1)
if (responseSeq < currentSeq) {
  // Drop response
}
```

#### 3. Don't Add Dual Data Sources
```typescript
// ❌ DON'T DO THIS
const [mapSales, setMapSales] = useState([])
const [filterSales, setFilterSales] = useState([])
const visibleSales = authority === 'MAP' ? mapSales : filterSales
```

## Migration Checklist

### For Developers
- [ ] Remove any remaining `arbiter` or `authority` references
- [ ] Update components to use map-only data flow
- [ ] Remove authority props from map components
- [ ] Update tests to remove authority assumptions
- [ ] Use `fetchMapSales()` for all data fetching

### For Testing
- [ ] Update integration tests for map-only flow
- [ ] Add tests for ZIP search functionality
- [ ] Add tests for deduplication logic
- [ ] Remove authority-based test assertions

### For Documentation
- [ ] Update API documentation
- [ ] Update component documentation
- [ ] Update architecture diagrams
- [ ] Update deployment guides

## Performance Considerations

### Current Optimizations
1. **Debouncing**: 75ms debounce on map changes
2. **Deduplication**: Prevents duplicate sales
3. **Bbox Fetching**: Only fetches visible sales
4. **Loading States**: User feedback during fetch

### Future Optimizations
1. **Caching**: Cache sales by bbox for faster navigation
2. **Virtualization**: Virtual scrolling for large lists
3. **Prefetching**: Prefetch adjacent areas
4. **Compression**: Compress API responses

## Troubleshooting

### Common Issues

#### 1. Sales Not Appearing
- Check if `fetchMapSales()` is being called
- Verify map bounds are correct
- Check API response format

#### 2. ZIP Search Not Working
- Verify ZIP format validation
- Check geocoding API response
- Ensure bbox is being used for map fitting

#### 3. Performance Issues
- Check for infinite fetch loops
- Verify debouncing is working
- Monitor API call frequency

### Debug Tools
- Use `NEXT_PUBLIC_DEBUG=true` for detailed logging
- Check browser network tab for API calls
- Use React DevTools for state inspection

## Conclusion

The map-as-source architecture provides a simpler, more maintainable foundation for the application. By removing the complex intent/arbiter system, we've eliminated a major source of bugs and made the codebase easier to understand and extend.

When adding new features, always consider the map viewport as the source of truth and avoid reintroducing complex state management patterns.
