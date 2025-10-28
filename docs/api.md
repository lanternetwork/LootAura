# API Documentation

**Last updated: 2025-01-27 — Map-Centric Architecture**

This document provides comprehensive documentation for all LootAura API endpoints, including request/response schemas, authentication requirements, and usage examples.

## 🔐 Authentication

### Environment Variables

All API endpoints require proper environment configuration:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE=your-service-role-key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your-mapbox-token
```

### Rate Limiting

- **API Calls**: Rate limited by Supabase
- **Geocoding**: Rate limited by external services
- **Mapbox**: Token-based rate limiting

## 📍 Sales API

### GET `/api/sales`

Fetch sales within a specified viewport bounds.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `north` | number | Yes | Northern boundary latitude |
| `south` | number | Yes | Southern boundary latitude |
| `east` | number | Yes | Eastern boundary longitude |
| `west` | number | Yes | Western boundary longitude |
| `dateRange` | string | No | Date filter: `today`, `weekend`, `next_weekend`, `any` |
| `categories` | string | No | Comma-separated category list |
| `limit` | number | No | Maximum results (default: 200) |

#### Example Request

```bash
GET /api/sales?north=38.3&south=38.1&east=-85.6&west=-85.8&dateRange=any&categories=Furniture,Electronics&limit=200
```

#### Response Schema

```typescript
interface SalesResponse {
  ok: boolean
  data: Sale[]
  dataCount: number
  center: {
    lat: number
    lng: number
  }
  distanceKm: number
  degraded?: boolean
  totalSalesCount: number
}

interface Sale {
  id: string
  title: string
  description?: string
  lat: number
  lng: number
  city: string
  state: string
  zip?: string
  startDate: string
  endDate: string
  categories: string[]
  items?: SaleItem[]
  distance_km?: number
  distance_m?: number
}
```

#### Example Response

```json
{
  "ok": true,
  "data": [
    {
      "id": "sale_123",
      "title": "Estate Sale - Antique Furniture",
      "description": "Large estate sale with antique furniture and collectibles",
      "lat": 38.2380249,
      "lng": -85.7246945,
      "city": "Louisville",
      "state": "KY",
      "zip": "40204",
      "startDate": "2025-01-28",
      "endDate": "2025-01-29",
      "categories": ["Furniture", "Antiques"],
      "distance_km": 2.5,
      "distance_m": 2500
    }
  ],
  "dataCount": 1,
  "center": {
    "lat": 38.2,
    "lng": -85.7
  },
  "distanceKm": 1000,
  "totalSalesCount": 1
}
```

#### Error Responses

```json
{
  "ok": false,
  "error": "Invalid bbox: north must be greater than south"
}
```

## 🗺️ Geocoding API

### GET `/api/geocoding/zip`

Geocode ZIP codes to coordinates with bounding box support.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `zip` | string | Yes | 5-digit ZIP code or ZIP+4 format |

#### Example Request

```bash
GET /api/geocoding/zip?zip=40204
```

#### Response Schema

```typescript
interface ZipGeocodingResponse {
  ok: boolean
  lat: number
  lng: number
  city: string
  state: string
  zip: string
  bbox?: [number, number, number, number] // [west, south, east, north]
}
```

#### Example Response

```json
{
  "ok": true,
  "lat": 38.2380249,
  "lng": -85.7246945,
  "city": "Louisville",
  "state": "KY",
  "zip": "40204",
  "bbox": [-85.81601835253933, 38.178945033182316, -85.6333706474614, 38.29705680137101]
}
```

#### Error Responses

```json
{
  "ok": false,
  "error": "Invalid ZIP code format"
}
```

## 🔧 Admin API

### POST `/api/admin/seed/mock`

Seed the database with mock sales data.

#### Headers

```
Authorization: Bearer <SEED_TOKEN>
```

#### Example Request

```bash
POST /api/admin/seed/mock
Authorization: Bearer your-seed-token
```

#### Response Schema

```typescript
interface SeedResponse {
  inserted: number
  skipped: number
  itemsInserted: number
}
```

#### Example Response

```json
{
  "inserted": 25,
  "skipped": 0,
  "itemsInserted": 150
}
```

### POST `/api/admin/seed/zipcodes`

Seed the database with US ZIP code data.

#### Headers

```
Authorization: Bearer <SEED_TOKEN>
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dryRun` | boolean | No | Preview counts without writing data |

#### Example Request

```bash
POST /api/admin/seed/zipcodes?dryRun=true
Authorization: Bearer your-seed-token
```

#### Response Schema

```typescript
interface ZipcodeSeedResponse {
  totalZipcodes: number
  inserted: number
  skipped: number
  dryRun: boolean
}
```

#### Example Response

```json
{
  "totalZipcodes": 41968,
  "inserted": 41968,
  "skipped": 0,
  "dryRun": false
}
```

## 🔍 Lookup API

### GET `/api/lookup-sale`

Look up sale information by sale ID.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Sale ID to lookup |

#### Example Request

```bash
GET /api/lookup-sale?id=sale_123
```

#### Response Schema

```typescript
interface SaleLookupResponse {
  ok: boolean
  sale?: Sale
  error?: string
}
```

#### Example Response

```json
{
  "ok": true,
  "sale": {
    "id": "sale_123",
    "title": "Estate Sale - Antique Furniture",
    "description": "Large estate sale with antique furniture and collectibles",
    "lat": 38.2380249,
    "lng": -85.7246945,
    "city": "Louisville",
    "state": "KY",
    "zip": "40204",
    "startDate": "2025-01-28",
    "endDate": "2025-01-29",
    "categories": ["Furniture", "Antiques"],
    "items": [
      {
        "id": "item_1",
        "title": "Antique Oak Table",
        "description": "Beautiful antique oak dining table",
        "category": "Furniture",
        "price": 150
      }
    ]
  }
}
```

## 🏥 Health Check API

### GET `/api/health`

Check system health and status.

#### Example Request

```bash
GET /api/health
```

#### Response Schema

```typescript
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  services: {
    database: 'up' | 'down'
    mapbox: 'up' | 'down'
    redis?: 'up' | 'down'
  }
  version: string
}
```

#### Example Response

```json
{
  "status": "healthy",
  "timestamp": "2025-01-27T10:30:00Z",
  "services": {
    "database": "up",
    "mapbox": "up",
    "redis": "up"
  },
  "version": "1.0.0"
}
```

## 📊 Data Types

### SaleItem

```typescript
interface SaleItem {
  id: string
  title: string
  description?: string
  category: string
  price?: number
  condition?: string
  images?: string[]
}
```

### Category

```typescript
interface Category {
  id: string
  label: string
  priority: number
}
```

### MapViewState

```typescript
interface MapViewState {
  center: {
    lat: number
    lng: number
  }
  bounds: {
    west: number
    south: number
    east: number
    north: number
  }
  zoom: number
}
```

## 🚨 Error Handling

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 400 | Bad Request | Check parameter format and values |
| 401 | Unauthorized | Verify authentication credentials |
| 403 | Forbidden | Check user permissions |
| 404 | Not Found | Verify endpoint URL and parameters |
| 429 | Too Many Requests | Implement rate limiting |
| 500 | Internal Server Error | Check server logs and configuration |

### Error Response Format

```typescript
interface ErrorResponse {
  ok: false
  error: string
  code?: string
  details?: any
}
```

## 🔄 Map-Centric Architecture Notes

### Single Fetch Path

The API follows a map-centric architecture with only 2 entry points:

1. **Viewport Changes**: Triggered by map movements, zoom changes, ZIP search
2. **Filter Changes**: Triggered by category/date filter changes

### Distance Handling

- **Distance Parameter**: Deprecated, ignored by API
- **Zoom-Based**: Distance filtering handled by map zoom level
- **Viewport Bounds**: All filtering based on map viewport bounds

### Performance Considerations

- **Bbox Filtering**: All queries use viewport bounds for efficiency
- **Limit Cap**: Maximum 200 results per request
- **Debouncing**: Client-side debouncing for viewport changes
- **Caching**: CDN caching for API responses

## 📚 Related Documentation

- [Architecture Overview](architecture.md)
- [Map-Centric Architecture](map-centric-architecture.md)
- [Environment Configuration](environment-configuration.md)
- [Debug Guide](debug-guide.md)
