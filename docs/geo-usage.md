# Nominatim Geocoding Integration Inventory

**Last Updated**: 2024-12-19  
**Status**: Active integration for forward geocoding (address → coordinates) and ZIP code lookup

---

## Environment Variables

### `NOMINATIM_APP_EMAIL`
- **Type**: Optional (SERVER-ONLY)
- **Default**: `'admin@lootaura.com'` (ZIP route) or `'noreply@yardsalefinder.com'` (geocode helper)
- **Purpose**: Email for Nominatim API politeness (required by OSM usage policy)
- **Location**: 
  - `lib/geocode.ts` (line 43)
  - `app/api/geocoding/zip/route.ts` (line 66)
- **Validation**: Email format validated in `lib/env.ts` (Zod schema)
- **Documentation**: Listed in `env.example` (line 69) and `docs/PRODUCTION_ENV.md`

**Note**: Two different defaults exist in codebase - should be standardized to single default.

---

## API Routes

### 1. `GET /api/geocoding/zip?zip={zipCode}`
**File**: `app/api/geocoding/zip/route.ts`

**Purpose**: ZIP code to coordinates lookup (with fallback chain)

**Query Parameters**:
- `zip` (required): ZIP code string (normalized to 5 digits)

**Response Format**:
```json
{
  "ok": true,
  "zip": "40201",
  "lat": 38.2512,
  "lng": -85.7494,
  "city": "Louisville",
  "state": "KY",
  "source": "local" | "hardcoded" | "nominatim" | "cache"
}
```

**Lookup Chain** (in order):
1. **In-memory cache** (60s TTL)
2. **Local database** (`lootaura_v2.zipcodes` table)
3. **Hardcoded fallback** (common ZIPs like Louisville, major cities)
4. **Nominatim API** (final fallback)

**Nominatim Endpoint Used**:
- `https://nominatim.openstreetmap.org/search?postalcode={zip}&country=US&format=json&limit=1&email={email}`

**Rate Limiting**:
- **Nominatim**: 1 request per second (enforced via `NOMINATIM_DELAY = 1000ms`)
- **API Route**: `withRateLimit` wrapper with `GEO_ZIP_SHORT` (10 req/min) and `GEO_ZIP_HOURLY` (300 req/hour) policies

**Caching**:
- **In-memory cache**: 60 second TTL per ZIP code
- **HTTP Cache-Control**: `public, max-age=86400` (24 hours) for successful responses
- **Cache-Control**: `public, max-age=60` (1 minute) for cached responses

**Optional Writeback**: If `ENABLE_ZIP_WRITEBACK=true`, successful Nominatim results are written back to `lootaura_v2.zipcodes` table.

---

## Helper Functions

### `geocodeAddress(address: string): Promise<GeocodeResult | null>`
**File**: `lib/geocode.ts`

**Purpose**: Forward geocoding (address string → coordinates)

**Parameters**:
- `address` (string): Full address or address fragment

**Returns**:
```typescript
interface GeocodeResult {
  lat: number
  lng: number
  formatted_address: string
  city?: string
  state?: string
  zip?: string
}
```

**Nominatim Endpoint Used**:
- `https://nominatim.openstreetmap.org/search?format=json&q={encoded_address}&email={email}&limit=1`

**Caching**:
- **In-memory cache**: `Map<string, GeocodeResult>` keyed by `address.toLowerCase()`
- **No expiration**: Cache persists for lifetime of process (TODO: add TTL or Redis)
- **Cache clearing**: `clearGeocodeCache()` function available

**Usage Tracking**:
- Calls `usageLogs.incGeocodeCall()` on client-side (browser)

**Usage Locations**:
- `components/location/AddressAutocomplete.tsx` (line 184): Fallback geocoding when Google Places API unavailable
- `components/AddSaleForm.tsx` (line 32): Address geocoding for sale creation

**Note**: No User-Agent header set (should be added for OSM politeness policy compliance).

---

### `clearGeocodeCache(): void`
**File**: `lib/geocode.ts` (line 66)

**Purpose**: Clear in-memory geocode cache (useful for testing)

---

## Rate Limiting & Caching Details

### Nominatim Rate Limiting
**Location**: `app/api/geocoding/zip/route.ts`

**Implementation**:
- **Per-process rate limiting**: `lastNominatimCall` timestamp + `NOMINATIM_DELAY = 1000ms`
- **Enforcement**: `delay()` function ensures minimum 1 second between calls
- **Scope**: Per-server instance (not shared across Vercel instances)

**Limitations**:
- ⚠️ **Not distributed**: Each Vercel serverless function maintains its own `lastNominatimCall` counter
- ⚠️ **No global coordination**: Multiple instances can make simultaneous requests
- ✅ **Better than nothing**: Reduces burst load on Nominatim

### API Route Rate Limiting
**Location**: `app/api/geocoding/zip/route.ts` (line 387)

**Policies Applied**:
- `GEO_ZIP_SHORT`: 10 requests per 60 seconds per IP
- `GEO_ZIP_HOURLY`: 300 requests per 3600 seconds per IP

**Implementation**: `withRateLimit` wrapper using Upstash Redis (if configured)

### Caching Strategy

**1. In-Memory Cache (ZIP Route)**
- **Type**: `Map<string, { data: any; expires: number }>`
- **TTL**: 60 seconds
- **Scope**: Per-process (cleared on serverless function restart)
- **Key**: Normalized ZIP code

**2. In-Memory Cache (Geocode Helper)**
- **Type**: `Map<string, GeocodeResult>`
- **TTL**: None (persists for lifetime of process)
- **Scope**: Per-process
- **Key**: Lowercase address string

**3. Database Cache (ZIP Route)**
- **Table**: `lootaura_v2.zipcodes`
- **Columns**: `zip`, `lat`, `lng`, `city`, `state`
- **Lookup**: First checked before Nominatim fallback

**4. HTTP Cache Headers**
- **Successful responses**: `Cache-Control: public, max-age=86400` (24 hours)
- **Cached responses**: `Cache-Control: public, max-age=60` (1 minute)

---

## Attribution UI

### Current Status
❌ **No OpenStreetMap/Nominatim attribution displayed in UI**

**OSM Usage Policy Requirements**:
- Must display attribution: "© OpenStreetMap contributors"
- Must link to: `https://www.openstreetmap.org/copyright`
- Should be visible on pages using Nominatim data

**Current Implementation**:
- Map components (`SimpleMap.tsx`, deprecated `SalesMap.tsx`) have `attributionControl={false}`
- No footer or attribution text in UI components
- No attribution in sale detail pages or address autocomplete

**Recommendation**: Add attribution component or footer linking to OSM copyright page.

---

## Reverse Geocoding

### Current Status
❌ **No reverse geocoding (coordinates → address) implemented**

**Potential Use Cases**:
- Display address when clicking map pin
- Show readable address for sale coordinates
- User location display

**Nominatim Reverse Endpoint** (not used):
- `https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&email={email}`

---

## Test Coverage

### Unit Tests
**File**: `tests/unit/geocode.fallback.test.ts`

**Coverage**:
- ✅ Forward geocoding with Nominatim
- ✅ Null handling on invalid addresses
- ✅ Rate limiting (graceful handling)
- ✅ Header validation (implicit via result validation)
- ✅ Caching behavior
- ✅ Malformed response handling
- ✅ Network error handling

**Mock**: `tests/utils/mocks.ts` provides `mockNominatimFetch()` for test environment

### E2E Tests
**File**: `tests/e2e/add-sale.spec.ts`

**Coverage**:
- ✅ Geocoding failure graceful handling (line 149)

**Mock**: Playwright route interception for Nominatim requests

---

## Known Issues & TODOs

### Issues
1. **Dual Defaults**: `NOMINATIM_APP_EMAIL` has two different defaults:
   - `'admin@lootaura.com'` in ZIP route
   - `'noreply@yardsalefinder.com'` in geocode helper
   - **Fix**: Standardize to single default

2. **Missing User-Agent**: `geocodeAddress()` doesn't set User-Agent header (required by OSM usage policy)

3. **No Attribution**: Missing OSM attribution in UI (violates usage policy)

4. **Per-Process Rate Limiting**: ZIP route rate limiting is per-process, not distributed (can be bypassed by multiple instances)

5. **No Cache TTL**: `geocodeAddress()` cache has no expiration (can grow unbounded)

### Recommendations
1. **Standardize Email Default**: Use single default email across all Nominatim calls
2. **Add User-Agent**: Set `User-Agent` header in `geocodeAddress()` (mirror ZIP route)
3. **Add Attribution**: Create footer component with OSM attribution link
4. **Distributed Rate Limiting**: Move Nominatim rate limiting to Redis for multi-instance coordination
5. **Cache TTL**: Add expiration to `geocodeAddress()` cache or move to Redis
6. **Reverse Geocoding**: Add reverse geocoding helper for map pin clicks
7. **Error Handling**: Add retry logic for transient Nominatim failures

---

## Usage Statistics

**No tracking implemented** for Nominatim API usage.

**Potential Metrics**:
- Number of Nominatim requests per day
- Cache hit rate
- Error rate
- Average response time

**Note**: `usageLogs.incGeocodeCall()` exists but only increments counter, doesn't track source (Google vs Nominatim).

---

## Dependencies

- **No external packages**: Uses native `fetch()` API
- **Environment**: Node.js serverless functions (Vercel)
- **Optional**: Upstash Redis for distributed rate limiting (if configured)

---

## Related Files

- `lib/geocode.ts` - Forward geocoding helper
- `app/api/geocoding/zip/route.ts` - ZIP lookup API route
- `components/location/AddressAutocomplete.tsx` - Address input with Nominatim fallback
- `components/AddSaleForm.tsx` - Sale creation form using geocoding
- `lib/rateLimit/policies.ts` - Rate limiting policy definitions
- `tests/unit/geocode.fallback.test.ts` - Unit tests
- `tests/utils/mocks.ts` - Test mocks for Nominatim

