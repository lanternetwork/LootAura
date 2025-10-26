# LootAura Protocol Invariants

**Last updated: 2025-01-27 — Map-Centric Architecture**

This document defines the authoritative contracts and invariants that must be maintained across the map-centric architecture to prevent regressions.

## Parameter Canonicalization

### Categories Parameter
- **Canonical Key**: `categories` (CSV on URL; array in code)
- **Legacy Support**: `cat` accepted read-only; never emitted in new requests
- **Normalization**: All arrays sorted + deduplicated before comparison
- **Format**: `?categories=tools,furniture` → `['tools', 'furniture']` → sorted, deduped

### URL Parameter Standards
- **Primary**: `categories`, `distance`, `dateRange`, `city`
- **Legacy**: `cat` (read-only, never emitted)
- **Consistency**: Same parameter names used in both markers and list requests

## Map-Centric Architecture Invariants

### Single Fetch Path
Only **2 entry points** to `fetchMapSales`:
1. **`handleViewportChange`** (debounced, 300ms) - for map movements, zoom changes, ZIP search
2. **`handleFiltersChange`** (immediate) - for category changes, date range changes

**Critical**: No other code paths should call `fetchMapSales` directly.

### Distance-to-Zoom Mapping
Distance slider controls map zoom instead of API filtering:
- **2 mi** → **z14** (very close)
- **5 mi** → **z12** (close) 
- **10 mi** → **z10** (medium)
- **25 mi** → **z8** (far)

**Critical**: Distance parameter is deprecated and ignored by API.

### Viewport-Based Filtering
All data fetching uses map viewport bounds (`north`, `south`, `east`, `west`) instead of distance-based filtering.

**Critical**: No server-side distance filtering when using viewport bounds.

## Single Source of Truth

### Map Viewport as Source
- **Primary Source**: Map viewport bounds determine visible sales
- **Consistency**: Both map pins and list read from same data source
- **Synchronization**: Map and list always show same sales

### Database Relations
- **Primary Source**: `lootaura_v2.sales_v2` for sales data
- **Consistency**: All endpoints read from the same relation
- **Documentation**: Any schema changes must be documented

### Category Predicate Model
Choose ONE predicate model based on schema:

#### Single Category Column
```sql
-- For: category TEXT/ENUM
WHERE category = ANY($1::text[])
```

#### Array Category Column  
```sql
-- For: categories TEXT[] (requires GIN index)
WHERE categories && $1::text[]
```

**Rule**: Use the predicate that matches your actual schema. Do not mix models.

## DOM/Layout Invariants

### List Container Structure
- **Container**: Always present with `data-panel="list"`
- **Children**: Cards are direct children of grid container
- **Grid Classes**: Applied to container, not intermediate wrappers
- **Ancestor**: Must have `min-w-0` to prevent grid overflow
- **No Wrappers**: No intermediate divs between grid and cards

### Grid Layout Requirements
```html
<div data-panel="list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
  <article data-card="sale">...</article>
  <article data-card="sale">...</article>
</div>
```

## Debug Discipline

### Single Debug Flag
- **Flag**: `NEXT_PUBLIC_DEBUG` (boolean)
- **Policy**: All logs behind this flag; no additional flags allowed
- **PII**: No personally identifiable information in logs
- **Toggle**: Single on/off switch for all debug features

### Debug Logging Standards
```typescript
if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
  console.log('[DEBUG] message', { sanitizedData })
}
```

## ID Parity Requirement

### Marker-List Consistency
A subset of marker IDs must be discoverable in the list mapping after each update.

**Verification**:
```typescript
// After markers update
const markerIds = markers.map(m => m.id)
const listIds = listItems.map(item => item.id)
const intersection = markerIds.filter(id => listIds.includes(id))
// intersection.length should be > 0 when data exists
```

## Performance Invariants

### Database Response Times
- **Auth/Profile Operations**: p95 ≤ 50ms
- **Visible Sales Load**: p95 ≤ 300ms
- **Category Filtering**: p95 ≤ 200ms

### UI Response Times
- **Map Render**: < 700ms
- **List Update**: < 300ms
- **Filter Application**: < 200ms

## Error Handling Invariants

### Graceful Degradation
- **Network Failures**: Show cached data with offline indicator
- **Filter Errors**: Fall back to showing all results
- **Map Failures**: Show list-only view
- **Database Errors**: Display user-friendly error message

### Error Logging
- **Client**: Log to console (debug mode only)
- **Server**: Log to structured logging system
- **No PII**: Never log user data, emails, or personal information

## Security Invariants

### RLS Policies
- **Public Read**: Sales data readable by anonymous users
- **Owner Write**: Only sale owners can modify their sales
- **Profile Access**: Users can only access their own profiles

### Input Validation
- **Categories**: Must be from predefined list
- **Distance**: Must be between 1-160 km
- **Dates**: Must be valid date ranges
- **Coordinates**: Must be valid lat/lng pairs

## Testing Requirements

### Unit Tests
- Parameter normalization functions
- Filter equality comparisons
- Suppression decision logic
- DOM structure validation

### Integration Tests
- End-to-end filter application
- Marker-list ID parity
- Grid layout verification
- URL deep-linking

### E2E Tests
- Complete user workflows
- Cross-browser compatibility
- Mobile responsiveness
- Performance benchmarks

## Migration Safety

### Schema Changes
- **Backward Compatibility**: Maintain old column names during transition
- **Data Migration**: Verify all data migrated correctly
- **Index Updates**: Ensure performance indexes are updated
- **RLS Updates**: Update policies to match new schema

### Rollback Plan
- **Database**: Ability to rollback schema changes
- **Code**: Feature flags to disable new functionality
- **Deployment**: Quick rollback to previous version

## Monitoring Requirements

### Key Metrics
- **Error Rate**: < 1%
- **Response Time**: < 1s for API calls
- **Uptime**: > 99.5%
- **User Satisfaction**: Monitor user feedback

### Alerting
- **Critical Errors**: Immediate alert
- **Performance Degradation**: Alert if > 2s response time
- **High Error Rate**: Alert if > 5% error rate
- **Database Issues**: Alert on connection failures

---

**Violation of these invariants constitutes a regression and must be fixed immediately.**
