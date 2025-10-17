# MS-MAP-01: Client-Side Clustering for Map Markers

## Overview

This milestone implements fast, accessible client-side clustering for map markers to improve performance and user experience when displaying large numbers of sales on the map.

## Design

### Clustering Engine

- **Library**: Supercluster (lean, fast, deterministic)
- **Configuration**: Conservative settings for optimal performance
  - Radius: 50px
  - Max Zoom: 16 (no clustering above zoom 16)
  - Min Points: 2 (minimum points to form cluster)
  - Extent: 512 (tile extent)
  - Node Size: 64 (tree structure optimization)

### Cluster Marker Component

- **Visual Design**: Blue circular badges with white text
- **Size Tiers**: Small (2-9), Medium (10-49), Large (50+)
- **Accessibility**: Keyboard focusable, ARIA labels, high contrast
- **Interaction**: Click/Enter to zoom to cluster bounds

### Debounced Fetch System

- **Debounce**: ≤1 request per 300ms
- **Cancellation**: AbortController for stale requests
- **Prefetch**: 15% viewport padding to reduce thrash
- **Payload Limits**: 200KB p95, automatic degradation if exceeded

## Performance Targets

### SLOs (Service Level Objectives)

- **First Interactive Map Paint**: ≤3.0s on mid-tier device
- **Cluster Recompute**: ≤75ms p95 for ≤5k points in viewport
- **Pan/Zoom Frame Time**: ≤8ms median, no long tasks >50ms
- **Visible Sales Query**: ≤300ms p95 for typical viewport & filters
- **Memory Peak**: ≤300MB in stress test
- **Network**: ≤1 markers request per 300ms of panning
- **Markers Payload**: ≤200KB p95
- **Bundle Increase**: ≤5KB gzip

### Measurement

- **Cluster Build Time**: Measured in `buildClusterIndex()`
- **Viewport Query Time**: Measured in `getClustersForViewport()`
- **Bundle Size**: CI guard prevents exceeding 5KB increase
- **Memory Usage**: Monitored in performance tests

## Feature Flag

### Configuration

```bash
# Enable clustering (default: true)
NEXT_PUBLIC_FEATURE_CLUSTERING=true

# Disable clustering (fallback to individual markers)
NEXT_PUBLIC_FEATURE_CLUSTERING=false
```

### Rollback

1. Set `NEXT_PUBLIC_FEATURE_CLUSTERING=false`
2. Deploy to disable clustering
3. Revert code changes if needed

## Implementation

### Core Files

- `lib/clustering.ts` - Clustering engine and utilities
- `lib/debouncedFetch.ts` - Debounced fetch with cancellation
- `components/location/ClusterMarker.tsx` - Cluster marker component
- `components/location/SalesMapClustered.tsx` - Enhanced map with clustering
- `app/api/sales/markers/route.ts` - Markers API (unchanged)

### Integration Points

- **Arbiter Authority**: Maintains map authority vs filters parity
- **Viewport Changes**: Updates clusters on pan/zoom
- **Filter Changes**: Rebuilds cluster index when filters change
- **List Parity**: Ensures list and map show same filtered dataset

## Accessibility

### Keyboard Navigation

- **Tab**: Focus cluster markers
- **Enter/Space**: Zoom to cluster bounds
- **Escape**: Close any open popups

### Screen Reader Support

- **ARIA Labels**: "Cluster of N sales. Press Enter to zoom in."
- **Semantic Structure**: Proper button roles and focus management
- **High Contrast**: Blue background, white text, white border

### Visual Design

- **Size Tiers**: Visual hierarchy based on cluster size
- **Hover States**: Enhanced visibility on interaction
- **Focus Indicators**: Clear focus rings for keyboard navigation

## Testing Matrix

### Unit Tests

- **Cluster Engine**: `tests/unit/cluster.engine.test.ts`
  - Index building and viewport queries
  - Stable results for same inputs
  - Edge cases and error handling
  - Feature flag behavior

### Integration Tests

- **Map Clusters Flow**: `tests/integration/map.clusters-flow.test.tsx`
  - Cluster rendering and interaction
  - Viewport change handling
  - Fallback to individual markers
  - Arbiter authority maintenance

- **Debounce & Cancel**: `tests/integration/map.debounce-cancel.test.ts`
  - Request debouncing and cancellation
  - Rapid pan/zoom handling
  - Error handling and timeouts

### Accessibility Tests

- **Cluster A11y**: `tests/a11y/map.cluster-a11y.test.tsx`
  - Keyboard navigation
  - Screen reader support
  - Focus management
  - ARIA attributes

### Performance Tests

- **Cluster Recompute**: `tests/perf/cluster.recompute.benchmark.test.ts`
  - 5k points within 75ms p95
  - Memory efficiency
  - Scalability testing
  - Consistency across runs

### Bundle Size Tests

- **Bundle Guard**: `tests/build/bundle-size.guard.test.ts`
  - 5KB increase limit
  - Tree-shaking verification
  - Production optimization
  - Dependency analysis

## Debug Logging

### Debug-Gated Logs

```typescript
// Only when NEXT_PUBLIC_DEBUG=true
console.log('[CLUSTER] Index built', {
  event: 'cluster-build',
  points: points.length,
  clusters: clusters.length,
  ms: Math.round(buildTime)
})

console.log('[CLUSTER] Viewport query', {
  event: 'cluster-viewport',
  returned: results.length,
  ms: Math.round(viewportTime)
})

console.log('[FETCH] Markers fetched', {
  event: 'viewport-fetch',
  url: url.split('?')[0],
  items: data.length,
  ms: performance.now()
})
```

### No PII Policy

- **Coordinates**: Only public map positions (no user locations)
- **No User Data**: No emails, names, or personal information
- **Compact Format**: Minimal logging for performance monitoring

## Rollback Plan

### Immediate Rollback

1. Set `NEXT_PUBLIC_FEATURE_CLUSTERING=false`
2. Deploy configuration change
3. Verify fallback to individual markers

### Code Rollback

1. Revert clustering-related commits
2. Remove clustering dependencies
3. Restore original SalesMap component
4. Run full test suite

### Data Rollback

- **No Database Changes**: Clustering is client-side only
- **No API Changes**: Markers API remains unchanged
- **No Migration Required**: Feature is additive

## Manual Validation

### PR Preview Testing

1. **Load Dense Metro**: Navigate to area with many sales
2. **Pan/Zoom Quickly**: Verify smooth performance
3. **Cluster Interaction**: Click clusters to zoom
4. **Keyboard Navigation**: Tab through clusters
5. **Screen Reader**: Test with screen reader
6. **Feature Toggle**: Test with clustering disabled

### Performance Validation

1. **First Paint**: Measure initial map load time
2. **Cluster Performance**: Monitor cluster build/query times
3. **Memory Usage**: Check memory consumption
4. **Network Requests**: Verify debouncing works
5. **Bundle Size**: Confirm ≤5KB increase

## Success Criteria

- [ ] All tests pass (unit, integration, perf, a11y)
- [ ] CI remains green (lint, typecheck, build)
- [ ] Performance targets met (75ms p95, 5KB bundle)
- [ ] Accessibility requirements satisfied
- [ ] Feature flag works (enable/disable)
- [ ] Manual validation successful
- [ ] Documentation complete

## Future Enhancements

### Potential Improvements

- **Dynamic Clustering**: Adjust cluster radius based on zoom
- **Category Clustering**: Separate clusters by category
- **Cluster Styling**: Custom cluster appearance
- **Animation**: Smooth cluster transitions
- **Offline Support**: Cache cluster data

### Monitoring

- **Performance Metrics**: Track cluster build/query times
- **User Experience**: Monitor interaction patterns
- **Error Rates**: Track clustering failures
- **Bundle Size**: Monitor size increases

## Troubleshooting

### Common Issues

1. **Clusters Not Appearing**: Check feature flag and point count
2. **Performance Issues**: Verify cluster options and point count
3. **Accessibility Problems**: Check ARIA attributes and keyboard handling
4. **Bundle Size Exceeded**: Review dependencies and tree-shaking

### Debug Steps

1. Enable `NEXT_PUBLIC_DEBUG=true`
2. Check console logs for cluster events
3. Verify feature flag setting
4. Test with different point counts
5. Check network requests and timing

### Support

- **Documentation**: This file and inline comments
- **Tests**: Comprehensive test coverage
- **Logs**: Debug-gated performance logs
- **Fallback**: Individual markers when clustering disabled
