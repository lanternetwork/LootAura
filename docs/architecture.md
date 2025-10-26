# Architecture Documentation

**Last updated: 2025-01-27 — Map-Centric Architecture**

## Map-Centric Architecture

This application uses a **map-centric** architecture where the map viewport is the single source of truth for what sales are displayed in the list.

### Core Principles

1. **Single Source of Truth**: The map viewport determines what sales are visible
2. **Single Fetch Path**: Only 2 entry points to fetchMapSales (viewport changes, filter changes)
3. **Distance-to-Zoom Mapping**: Distance slider controls map zoom instead of API filtering
4. **Bbox-based Fetching**: All sales data is fetched using map viewport bounds
5. **Deduplication**: Sales are deduplicated by `sale.id` to prevent duplicates

### Data Flow

```
User Action → Map Viewport Change → Single API Fetch → Display Results
```

**Entry Points:**
1. **Distance Slider** → Map Zoom Change → Viewport Change → Fetch
2. **ZIP Search** → Map Center/Bounds Change → Viewport Change → Fetch  
3. **Category/Date Filters** → Direct Fetch with Current Bounds
4. **Map Movement** → Viewport Change → Debounced Fetch

**Single Fetch Path:**
- **handleViewportChange** (debounced, 300ms) - for map movements, zoom changes, ZIP search
- **handleFiltersChange** (immediate) - for category changes, date range changes

### Key Components

#### SalesClient (`app/sales/SalesClient.tsx`)
- **State**: `mapView`, `mapSales`, `visibleSales`
- **Fetch**: `fetchMapSales()` - bbox-based viewport fetching
- **Deduplication**: `deduplicateSales()` - removes duplicates by sale ID
- **Distance-to-Zoom**: `distanceToZoom()` - maps distance values to zoom levels
- **Layout**: Zillow-style with map left, list right, filters top

#### Map Components
- **SimpleMap**: Main map component with hybrid clustering
- **LocationPin**: Individual sale location pins
- **PinMarker**: Legacy pin component (deprecated)
- **CustomPin**: Custom DOM-based pin component

#### ZIP Search (`components/location/ZipInput.tsx`)
- **Validation**: Supports 5-digit and ZIP+4 formats
- **Bbox Support**: Uses bounding box for precise map fitting
- **URL Persistence**: Updates URL with ZIP parameter
- **Loading States**: Shows spinner during lookup

### API Endpoints

#### `/api/sales`
- **Method**: GET
- **Parameters**: `north`, `south`, `east`, `west`, `dateRange`, `categories`, `limit`
- **Response**: `{ ok: boolean, data: Sale[], dataCount: number }`
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

### Distance-to-Zoom Mapping

The distance slider controls map zoom instead of API filtering:

```typescript
const distanceToZoom = (distance: number): number => {
  switch (distance) {
    case 2: return 14  // Very close - high zoom
    case 5: return 12  // Close - medium-high zoom
    case 10: return 10 // Medium - medium zoom
    case 25: return 8  // Far - low zoom
    default: return 10 // Default to medium zoom
  }
}
```

**Benefits:**
- **Map-centric**: Zoom level determines visible area
- **Performance**: No server-side distance filtering
- **UX**: Intuitive zoom-based search area control

### Future Considerations

1. **Caching**: Consider caching sales data by bbox
2. **Virtualization**: For large lists, implement virtual scrolling
3. **Offline Support**: Cache sales for offline viewing
4. **Real-time Updates**: WebSocket updates for live sales
