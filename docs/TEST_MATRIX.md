# LootAura Test Matrix

**Last updated: 2025-10-13 — Enterprise Documentation Alignment**

This document defines the comprehensive test matrix for validating core behaviors across the UI→Arbiter→API→DB→List pipeline.

## Test Categories

### Filters Test Matrix

| Test Case | Categories | Date Range | Distance | City | Authority | Expected Behavior |
|-----------|------------|------------|----------|------|-----------|-------------------|
| **F1** | Single: `tools` | Past week | 10km | Louisville | MAP | Payload equality, no suppression |
| **F2** | Multi: `tools,furniture` | Past week | 10km | Louisville | MAP | Payload equality, no suppression |
| **F3** | Cleared: `[]` | Past week | 10km | Louisville | MAP | Payload equality, no suppression |
| **F4** | Single: `tools` | Past month | 5km | Nashville | MAP | Payload equality, no suppression |
| **F5** | Multi: `tools,furniture` | Custom range | 20km | Atlanta | MAP | Payload equality, no suppression |
| **F6** | Single: `tools` | Past week | 10km | None | MAP | Payload equality, no suppression |
| **F7** | Multi: `tools,furniture` | Past week | 10km | Louisville | FILTER | No suppression |
| **F8** | Cleared: `[]` | Past week | 10km | Louisville | FILTER | No suppression |

### Authority Cases

| Test Case | Authority | Filter Change | Markers Include Filters | Expected Suppression |
|-----------|-----------|---------------|------------------------|---------------------|
| **A1** | MAP | No | Yes | ✅ Suppress |
| **A2** | MAP | No | No | ❌ Don't suppress |
| **A3** | MAP | Yes | Yes | ❌ Don't suppress |
| **A4** | MAP | Yes | No | ❌ Don't suppress |
| **A5** | FILTER | Any | Any | ❌ Don't suppress |

### URL Deep-link Test Matrix

| Test Case | URL Parameters | Expected Payload | Expected DOM |
|-----------|----------------|------------------|--------------|
| **U1** | `?categories=tools&distance=10&dates=past-week` | `{categories: ['tools'], distance: 10, dateRange: 'past-week'}` | Multi-column grid |
| **U2** | `?categories=tools,furniture&distance=20&dates=custom` | `{categories: ['tools', 'furniture'], distance: 20, dateRange: 'custom'}` | Multi-column grid |
| **U3** | `?distance=10&dates=past-week` | `{categories: [], distance: 10, dateRange: 'past-week'}` | Multi-column grid |
| **U4** | `?categories=tools&distance=10&dates=past-week&city=Louisville` | `{categories: ['tools'], distance: 10, dateRange: 'past-week', city: 'Louisville'}` | Multi-column grid |

## Test Implementation Mapping

### Unit Tests (CI Job: `ci / test-unit`)

| Test Name | File | Description |
|-----------|------|-------------|
| `normalizeCategories` | `tests/unit/categoryNormalizer.test.ts` | CSV↔array conversion |
| `filtersEqual` | `tests/unit/categoryNormalizer.test.ts` | Deep-equal on normalized filters |
| `shouldSuppressList` | `tests/unit/arbiterDecisions.test.ts` | Suppression decision logic |
| `createCategoriesKey` | `tests/unit/categoryNormalizer.test.ts` | Canonical key generation |

### Integration Tests (CI Job: `ci / test-integration`)

| Test Name | File | Description |
|-----------|------|-------------|
| `category-single-multi-clear` | `tests/integration/categoryFilters.test.ts` | Category filter application |
| `url-deep-link` | `tests/integration/categoryFilters.test.ts` | URL parameter parsing |
| `suppression-equality` | `tests/integration/categoryFilters.test.ts` | Suppression decision validation |
| `dom-grid-multi-col` | `tests/integration/gridLayout.integration.test.tsx` | Grid layout verification |
| `id-parity-sample` | `tests/integration/categoryFilters.test.ts` | Marker-list ID consistency |
| `sales-list-rendering` | `tests/integration/sales-list.spec.ts` | Sales list component integration |

### Server Tests

| Test Name | File | Description |
|-----------|------|-------------|
| `handlers-accept-categories-cat` | `tests/unit/categoryNormalizer.test.ts` | Parameter acceptance |
| `predicate-parity-markers-list` | `tests/unit/categoryNormalizer.test.ts` | Predicate consistency |
| `explain-index-usage` | `tests/unit/categoryNormalizer.test.ts` | Database performance |

### E2E Tests

| Test Name | File | Description |
|-----------|------|-------------|
| `complete-filter-workflow` | `tests/e2e/complete-flow.spec.ts` | End-to-end filtering |
| `map-list-sync` | `tests/e2e/complete-flow.spec.ts` | Map-list synchronization |
| `mobile-responsiveness` | `tests/e2e/complete-flow.spec.ts` | Mobile layout validation |

## Expected Results Per Test Case

### F1: Single Category Filter
- **Payload**: `{categories: ['tools'], distance: 10, dateRange: 'past-week', city: 'Louisville'}`
- **Suppression**: No (categories present, filter change)
- **List**: Multi-column grid with tools items
- **DOM**: `[data-panel="list"]` with direct children `[data-card="sale"]`

### F2: Multi Category Filter
- **Payload**: `{categories: ['tools', 'furniture'], distance: 10, dateRange: 'past-week', city: 'Louisville'}`
- **Suppression**: No (categories present, filter change)
- **List**: Multi-column grid with tools and furniture items
- **DOM**: Grid container with responsive columns

### F3: Cleared Categories
- **Payload**: `{categories: [], distance: 10, dateRange: 'past-week', city: 'Louisville'}`
- **Suppression**: No (categories cleared, filter change)
- **List**: Multi-column grid with all items
- **DOM**: Grid container with all sale cards

### A1: MAP Authority, No Filter Change, Markers Include Filters
- **Authority**: MAP
- **Filter Change**: No
- **Markers Include Filters**: Yes
- **Expected**: ✅ Suppress list fetch
- **Reason**: Identical filters, no change, markers will provide data

### A2: MAP Authority, No Filter Change, Markers Don't Include Filters
- **Authority**: MAP
- **Filter Change**: No
- **Markers Include Filters**: No
- **Expected**: ❌ Don't suppress list fetch
- **Reason**: Markers won't provide filtered data

## Test Data Requirements

### Sample Data
- **Louisville Sales**: 50+ sales with various categories
- **Nashville Sales**: 30+ sales with various categories
- **Atlanta Sales**: 40+ sales with various categories
- **Categories**: tools, furniture, electronics, clothing, books, toys
- **Date Ranges**: Past week, past month, custom ranges
- **Distances**: 5km, 10km, 20km, 50km

### Test Users
- **Anonymous**: Can browse and search
- **Authenticated**: Can add sales, favorites, reviews
- **Admin**: Can manage data and view analytics

## Performance Benchmarks

### Response Time Targets
- **API Calls**: < 1s
- **Map Render**: < 700ms
- **List Update**: < 300ms
- **Filter Application**: < 200ms

### Load Testing
- **Concurrent Users**: 100+ simultaneous users
- **Database Queries**: < 100ms p95
- **Memory Usage**: < 512MB per instance
- **CPU Usage**: < 80% under load

## Test Environment Requirements

### Development
- **Database**: Local Supabase instance
- **Maps**: Development Mapbox token
- **Testing**: Jest + Playwright
- **Debug**: `NEXT_PUBLIC_DEBUG=true`

### Staging
- **Database**: Staging Supabase instance
- **Maps**: Staging Mapbox token
- **Testing**: Full test suite
- **Debug**: `NEXT_PUBLIC_DEBUG=false`

### Production
- **Database**: Production Supabase instance
- **Maps**: Production Mapbox token
- **Testing**: Smoke tests only
- **Debug**: `NEXT_PUBLIC_DEBUG=false`

## Test Execution Strategy

### Pre-commit
- **Unit Tests**: All unit tests must pass
- **Linting**: ESLint and Prettier checks
- **Type Checking**: TypeScript validation
- **Build**: Successful build required

### Pre-deploy
- **Integration Tests**: All integration tests must pass
- **E2E Tests**: Critical user flows must pass
- **Performance Tests**: Response time targets must be met
- **Security Tests**: No vulnerabilities detected

### Post-deploy
- **Smoke Tests**: Basic functionality verification
- **Health Checks**: API endpoints responding
- **Monitoring**: Error rates and performance metrics
- **User Feedback**: Monitor for user-reported issues

## Test Maintenance

### Regular Updates
- **Weekly**: Review test results and update as needed
- **Monthly**: Update test data and scenarios
- **Quarterly**: Review and update test matrix
- **Annually**: Complete test strategy review

### Test Data Management
- **Refresh**: Regular refresh of test data
- **Cleanup**: Remove outdated test data
- **Backup**: Regular backup of test databases
- **Restore**: Quick restore capability for testing

---

**This test matrix ensures comprehensive coverage of all critical behaviors and prevents regressions.**
