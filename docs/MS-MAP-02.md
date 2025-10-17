# MS-MAP-02: Interactive Map + Offline Cache

## Overview

This milestone implements interactive Map UX polish and offline caching while preserving current clustering and filters. The implementation adds viewport persistence, prefetching, offline cache with IndexedDB, and graceful fallback UX.

## Features

### 1. State Persistence
- **Viewport State**: Persists lat, lng, zoom to localStorage
- **Filter State**: Persists dateRange, categories, radius to localStorage
- **Version Management**: Clears state on schema/version mismatch
- **TTL**: Automatically expires state after 7 days

### 2. Prefetch Nearby Tiles
- **Adjacent Tile Calculation**: Computes N/E/S/W adjacent tiles
- **Debounced Prefetch**: Uses existing debounce manager for viewport idle
- **Cache Integration**: Stores prefetched data in IndexedDB
- **Deduplication**: Prevents duplicate requests via debounce manager

### 3. Offline Cache (IndexedDB)
- **Dexie Integration**: Lightweight IndexedDB wrapper
- **Tile-based Storage**: Keys by tile ID + filter hash
- **TTL Management**: 7-day cache expiration
- **Automatic Pruning**: Removes old entries on version bump
- **Graceful Fallback**: Serves cached data on network failure

### 4. Graceful Offline UX
- **Offline Banner**: Shows "Offline: showing cached results" when using cache
- **Cached Data Display**: Uses cached markers when network fails
- **Action Disabling**: Disables network-dependent actions with tooltips
- **Network Detection**: Uses navigator.onLine for offline detection

### 5. Feature Flag
- **Environment Variable**: `NEXT_PUBLIC_FLAG_OFFLINE_CACHE` (default: false)
- **Conditional Loading**: Skips Dexie when disabled
- **Persistence Always On**: Viewport/filter persistence works regardless of flag
- **Rollback Safety**: Feature stays dormant when disabled

### 6. Telemetry (Debug Only)
- **Prefetch Events**: `MAP_PREFETCH start|done|skip`
- **Cache Events**: `CACHE hit|miss|write|prune`
- **Offline Events**: `OFFLINE fallback used`
- **Persistence Events**: Viewport save/load logging
- **PII-Free**: No sensitive data in logs

## Implementation Details

### Core Modules

#### `lib/map/viewportPersistence.ts`
- `saveViewportState(viewport, filters)`: Persists state to localStorage
- `loadViewportState()`: Loads persisted state with version check
- `clearViewportState()`: Clears persisted state
- `hasPersistedState()`: Checks for valid persisted state

#### `lib/map/tiles.ts`
- `tileIdForBounds(bounds, zoom)`: Generates deterministic tile IDs
- `adjacentTileIds(tileId)`: Returns N/E/S/W adjacent tiles
- `viewportToTileBounds(viewport, zoom)`: Converts viewport to tile bounds
- `getCurrentTileId(viewport, zoom)`: Gets current tile ID

#### `lib/filters/hash.ts`
- `hashFilters(filters)`: Creates stable hash for filter state
- `filtersEqual(a, b)`: Compares filter states for equality
- `createCacheKey(tileId, filterHash)`: Creates cache key

#### `lib/cache/db.ts`
- `getCachedMarkers(tileId, filterHash)`: Retrieves cached markers
- `putCachedMarkers(tileId, filterHash, markers, ttl)`: Stores markers
- `pruneCache()`: Removes expired entries
- `clearCache()`: Clears all cache data
- `getCacheStats()`: Returns cache statistics

#### `lib/cache/offline.ts`
- `fetchWithCache(key, fetcher, options)`: Network-first with cache fallback
- `isOffline()`: Checks offline status
- `hasCachedData(tileId, filterHash)`: Checks for cached data

#### `lib/flags.ts`
- `isOfflineCacheEnabled()`: Checks feature flag
- `isClusteringEnabled()`: Checks clustering flag
- `isDebugEnabled()`: Checks debug flag

#### `lib/telemetry/map.ts`
- Debug logging for prefetch, cache, and offline events
- PII-free logging with structured data

### Component Updates

#### `components/location/SalesMapClustered.tsx`
- **State Persistence**: Loads persisted state on mount
- **Prefetch Integration**: Triggers adjacent tile prefetch on move/zoom
- **Cache Integration**: Uses fetchWithCache for data requests
- **Offline Banner**: Shows when using cached data
- **Move/Zoom Handlers**: Persist state on viewport changes

#### `components/OfflineBanner.tsx`
- **Visual Indicator**: Shows offline/cached state
- **Marker Count**: Displays number of cached markers
- **Conditional Rendering**: Only shows when using cached data

## Environment Configuration

### Required Environment Variables

```bash
# Feature flag for offline cache (default: false)
NEXT_PUBLIC_FLAG_OFFLINE_CACHE=true

# Debug logging (default: false)
NEXT_PUBLIC_DEBUG=true
```

### Vercel Configuration

```bash
# Enable offline cache
vercel env add NEXT_PUBLIC_FLAG_OFFLINE_CACHE
# Value: true

# Enable debug logging (optional)
vercel env add NEXT_PUBLIC_DEBUG
# Value: true
```

## Testing

### Unit Tests
- `tests/unit/cache.db.test.ts`: IndexedDB cache functionality
- `tests/unit/filters.hash.test.ts`: Filter hashing stability
- `tests/unit/map.tiles.test.ts`: Tile management and adjacent calculation

### Integration Tests
- `tests/integration/map.prefetch-offline.test.tsx`: Prefetch scheduling and offline fallback

### Test Coverage
- ✅ Cache read/write/prune operations
- ✅ Filter hashing consistency
- ✅ Tile ID generation and adjacent calculation
- ✅ Prefetch scheduling with debounce manager
- ✅ Offline fallback behavior
- ✅ Feature flag conditional loading

## Performance Considerations

### Bundle Impact
- **Dexie**: ~15KB gzipped (only loaded when feature enabled)
- **Lazy Loading**: Cache modules only imported when flag enabled
- **Minimal Overhead**: Persistence works regardless of cache flag

### Cache Management
- **TTL**: 7-day expiration for cache entries
- **Pruning**: Automatic cleanup on version bump
- **Size Limits**: No unbounded growth with proper keying

### Network Optimization
- **Prefetch**: Adjacent tiles loaded during idle time
- **Debouncing**: Prevents excessive requests during pan/zoom
- **Deduplication**: Prevents duplicate requests for same tile/filter

## Security & Privacy

### Data Protection
- **No PII**: Cache keys contain no sensitive information
- **Filter Hashing**: Stable hashing without exposing filter values
- **Local Storage**: Only non-sensitive viewport/filter state

### Cache Security
- **Tile-based Keys**: Geographic tile IDs (no user data)
- **Filter Hashes**: Cryptographic hashes of filter state
- **TTL Expiration**: Automatic cleanup of old data

## Rollout Plan

### Phase 1: Feature Flag Off (Default)
- ✅ Viewport/filter persistence enabled
- ❌ Offline cache disabled
- ❌ Prefetch disabled
- ✅ All existing functionality preserved

### Phase 2: Feature Flag On (Controlled Rollout)
- ✅ Viewport/filter persistence enabled
- ✅ Offline cache enabled
- ✅ Prefetch enabled
- ✅ Offline fallback enabled

### Phase 3: Full Rollout
- Set `NEXT_PUBLIC_FLAG_OFFLINE_CACHE=true` by default
- Monitor performance and error rates
- Gradual rollout to 100% of users

## Rollback Plan

### Immediate Rollback
```bash
# Disable feature flag
NEXT_PUBLIC_FLAG_OFFLINE_CACHE=false
```

### Full Rollback
1. Disable feature flag
2. Remove Dexie dependency (optional)
3. Keep persistence module (harmless)
4. Deploy and monitor

### Safety Measures
- **Graceful Degradation**: Feature fails silently when disabled
- **No Breaking Changes**: Existing functionality unaffected
- **Backward Compatibility**: Old cached data ignored on version mismatch

## Monitoring & Observability

### Debug Logging (Development)
```javascript
// Enable debug logging
NEXT_PUBLIC_DEBUG=true

// Example logs
[MAP_PREFETCH] start { tileId: "10-5-3" }
[MAP_PREFETCH] done { tileId: "10-5-3", ms: 150, count: 25 }
[CACHE] hit { keys: 3 }
[CACHE] write { keys: 2 }
[OFFLINE] fallback used { tileId: "10-5-3" }
```

### Production Monitoring
- **Cache Hit Rate**: Monitor cache effectiveness
- **Prefetch Success Rate**: Monitor prefetch performance
- **Offline Usage**: Track offline fallback usage
- **Error Rates**: Monitor cache and prefetch errors

## Acceptance Criteria

### ✅ Persistence
- [x] Map viewport restores on reload (when version matches)
- [x] Filter state restores on reload (when version matches)
- [x] Clearing localStorage invalidates state cleanly
- [x] Version mismatch clears state automatically

### ✅ Prefetch
- [x] Prefetch fires after viewport idle (debounce manager)
- [x] Duplicate prefetches suppressed for same tile/filter
- [x] Prefetched data available instantly when panning
- [x] Adjacent tile calculation works correctly

### ✅ Offline
- [x] Network failure triggers cache consultation
- [x] Cached markers render when cache hit
- [x] Offline banner shows when using cached data
- [x] Network-dependent actions disabled with tooltips

### ✅ Cache
- [x] IndexedDB writes on successful fetch
- [x] Cache reads on network failure
- [x] Automatic pruning runs on version bump
- [x] No unbounded growth with proper keying

### ✅ Security
- [x] No PII in cache keys or logs
- [x] Only non-sensitive marker data cached
- [x] Respects existing session cookie security

### ✅ Performance
- [x] No noticeable lag during pan/zoom
- [x] Cluster engine tests remain green
- [x] No >10% performance regression
- [x] Bundle size impact minimal

## How to Test

### Manual Testing Steps

1. **Enable Feature Flag**
   ```bash
   NEXT_PUBLIC_FLAG_OFFLINE_CACHE=true
   NEXT_PUBLIC_DEBUG=true
   ```

2. **Test Persistence**
   - Pan/zoom the map
   - Refresh the page
   - Verify viewport and filters restore

3. **Test Prefetch**
   - Open browser dev tools
   - Pan the map slowly
   - Verify prefetch logs in console

4. **Test Offline Fallback**
   - Disable network in dev tools
   - Pan the map
   - Verify offline banner appears
   - Verify cached markers display

5. **Test Cache Management**
   - Use the app normally
   - Check IndexedDB in dev tools
   - Verify cache entries are created
   - Verify old entries are pruned

### Automated Testing
```bash
# Run all tests
npm run test

# Run specific test suites
npm run test tests/unit/cache.db.test.ts
npm run test tests/unit/filters.hash.test.ts
npm run test tests/unit/map.tiles.test.ts
npm run test tests/integration/map.prefetch-offline.test.tsx
```

## Troubleshooting

### Common Issues

1. **Cache Not Working**
   - Check `NEXT_PUBLIC_FLAG_OFFLINE_CACHE=true`
   - Verify IndexedDB is supported in browser
   - Check console for Dexie errors

2. **Persistence Not Working**
   - Check localStorage is available
   - Verify version compatibility
   - Check for localStorage quota exceeded

3. **Prefetch Not Triggering**
   - Check debounce manager is working
   - Verify viewport changes are detected
   - Check for JavaScript errors

4. **Offline Banner Not Showing**
   - Check network status detection
   - Verify cache has data
   - Check component rendering

### Debug Commands

```javascript
// Check cache status
localStorage.getItem('yard-sale-map-state')

// Check IndexedDB
// Open browser dev tools > Application > IndexedDB > MapCacheDB

// Check feature flags
console.log('Offline cache enabled:', process.env.NEXT_PUBLIC_FLAG_OFFLINE_CACHE === 'true')
console.log('Debug enabled:', process.env.NEXT_PUBLIC_DEBUG === 'true')
```

## Future Enhancements

### Potential Improvements
- **Service Worker**: Background sync for offline actions
- **Push Notifications**: Notify when back online
- **Advanced Prefetching**: ML-based prefetch prediction
- **Cache Compression**: Reduce storage footprint
- **Analytics**: Track cache effectiveness and user behavior

### Performance Optimizations
- **Web Workers**: Move cache operations off main thread
- **Streaming**: Stream large datasets
- **Compression**: Compress cached data
- **CDN Integration**: Hybrid cache strategy

## Conclusion

This implementation provides a robust foundation for offline map functionality while maintaining performance and security. The feature flag allows for controlled rollout and easy rollback if needed. The modular design ensures that each component can be tested and maintained independently.
