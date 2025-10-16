# LootAura Protocol Invariants

**Last updated: 2025-10-13 — Enterprise Documentation Alignment**

This document defines the authoritative contracts and invariants that must be maintained across the UI→Arbiter→API→DB→List pipeline to prevent regressions.

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

## Suppression Rule

### MAP Authority Suppression Logic
Under MAP authority, suppress `/api/sales` **only if** markers payload will include an **identical normalized filter set** (at minimum: categories, date range, distance, city).

**Critical**: "Empty == empty" must NOT hide user-initiated filter updates if markers lack the filter.

### Suppression Decision Matrix
| Authority | Filter Change | Markers Include Filters | Suppress List |
|-----------|---------------|-------------------------|---------------|
| MAP | No | Yes | ✅ Yes |
| MAP | No | No | ❌ No |
| MAP | Yes | Yes | ❌ No |
| MAP | Yes | No | ❌ No |
| FILTER | Any | Any | ❌ No |

## Single Source of Truth

### Database Relations
- **Primary Source**: `public.items_v2` for both markers and list
- **Consistency**: Both endpoints read from the same relation/view
- **Documentation**: Any superseding relations must be documented

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
