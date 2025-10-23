# Architecture Documentation

## Map-as-Source Architecture

This application uses a **map-as-source** architecture where the map viewport is the single source of truth for what sales are displayed in the list.

### Core Principles

1. **Single Source of Truth**: The map viewport determines what sales are visible
2. **No Authority Conflicts**: No arbiter/authority system to manage competing data sources
3. **Bbox-based Fetching**: All sales data is fetched using map viewport bounds
4. **Deduplication**: Sales are deduplicated by `sale.id` to prevent duplicates

### Data Flow

```
User Interaction → Map Viewport Change → Bbox Fetch → Deduplication → List Update
```

1. **User Interaction**: User pans/zooms map or searches by ZIP
2. **Map Viewport Change**: Map bounds are updated
3. **Bbox Fetch**: `/api/sales/markers` called with viewport bounds
4. **Deduplication**: Sales deduplicated by ID
5. **List Update**: List displays deduplicated sales from map

### Key Components

#### SalesClient (`app/sales/SalesClient.tsx`)
- **State**: `mapView`, `mapSales`, `visibleSales`
- **Fetch**: `fetchMapSales()` - bbox-based viewport fetching
- **Deduplication**: `deduplicateSales()` - removes duplicates by sale ID
- **Layout**: Zillow-style with map left, list right, filters top

#### Map Components
- **SalesMap**: Basic map component
- **SalesMapClustered**: Clustered map with supercluster
- **No Authority Props**: Removed arbiter/authority system

#### ZIP Search (`components/location/ZipInput.tsx`)
- **Validation**: Supports 5-digit and ZIP+4 formats
- **Bbox Support**: Uses bounding box for precise map fitting
- **URL Persistence**: Updates URL with ZIP parameter
- **Loading States**: Shows spinner during lookup

### API Endpoints

#### `/api/sales/markers`
- **Method**: GET
- **Parameters**: `minLng`, `minLat`, `maxLng`, `maxLat`, `dateRange`, `categories`
- **Response**: `{ ok: boolean, data: Sale[] }`
- **Purpose**: Fetch sales within viewport bounds

#### `/api/geocoding/zip`
- **Method**: GET
- **Parameters**: `zip` (5-digit or ZIP+4)
- **Response**: `{ ok: boolean, lat: number, lng: number, city: string, state: string, bbox?: [number, number, number, number] }`
- **Purpose**: Geocode ZIP codes to coordinates

### State Management

#### Map View State
```typescript
interface MapViewState {
  center: { lat: number; lng: number }
  bounds: { west: number; south: number; east: number; north: number }
  zoom: number
}
```

#### Sales State
- `mapSales`: Raw sales from map viewport
- `visibleSales`: Deduplicated sales for display
- `loading`: Fetch state
- `mapUpdating`: Map interaction state

### Performance Optimizations

1. **Debouncing**: 75ms debounce on map view changes
2. **Deduplication**: Prevents duplicate sales in list
3. **Bbox Fetching**: Only fetches sales within visible area
4. **Loading States**: Shows skeletons during fetch

### Error Handling

1. **API Validation**: Validates response shape before processing
2. **ZIP Validation**: Regex validation for ZIP format
3. **Fallback States**: Empty states when no sales found
4. **Error Boundaries**: Catches JavaScript errors

### Testing Strategy

#### Unit Tests
- `zip-search.test.ts`: ZIP validation and format support
- `map-only-flow.test.ts`: Map-only data flow assertions
- `deduplication.test.ts`: Sales deduplication logic

#### Integration Tests
- Map viewport changes trigger fetches
- ZIP search updates map and list
- Filter changes trigger refetch

#### E2E Tests
- Complete user flows
- Map and list synchronization
- ZIP search with URL persistence

### Migration from Intent System

The previous intent/arbiter system has been removed. Key changes:

1. **No Authority Logic**: Removed `arbiter.authority` checks
2. **No Sequence Gating**: Removed `seq` and `bumpSeq` logic
3. **No Dual Sources**: Only map viewport as data source
4. **Simplified State**: Removed complex state management

### Future Considerations

1. **Caching**: Consider caching sales data by bbox
2. **Virtualization**: For large lists, implement virtual scrolling
3. **Offline Support**: Cache sales for offline viewing
4. **Real-time Updates**: WebSocket updates for live sales
