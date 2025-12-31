# Data Functions

This directory contains data access functions for the LootAura application using Supabase with schema-qualified table names.

## Overview

The data functions provide a clean abstraction layer over Supabase operations, with:
- **Schema-qualified table names** using `NEXT_PUBLIC_SUPABASE_SCHEMA`
- **Zod validation** for all inputs
- **TypeScript types** for all return values
- **Error handling** with proper error messages
- **Authentication** checks for user operations

## Functions

### Sales Functions

#### `getSales(params?)`
Get a list of published sales with optional filtering.

**Parameters:**
- `city?: string` - Filter by city
- `distanceKm?: number` - Distance filter (requires lat/lng)
- `lat?: number` - Latitude for distance filtering
- `lng?: number` - Longitude for distance filtering
- `dateRange?: { start: string, end: string }` - Date range filter
- `categories?: string[]` - Filter by sale categories/tags
- `limit?: number` - Maximum number of results (default: 50)
- `offset?: number` - Pagination offset (default: 0)

**Returns:** `Promise<Sale[]>`

#### `getSaleById(id: string)`
Get a specific sale by ID.

**Parameters:**
- `id: string` - Sale ID

**Returns:** `Promise<Sale | null>`

#### `createSale(input: SaleInput)`
Create a new sale.

**Parameters:**
- `input: SaleInput` - Sale data

**Returns:** `Promise<Sale>`

#### `updateSale(id: string, input: Partial<SaleInput>)`
Update an existing sale.

**Parameters:**
- `id: string` - Sale ID
- `input: Partial<SaleInput>` - Updated sale data

**Returns:** `Promise<Sale>`

#### `deleteSale(id: string)`
Delete a sale.

**Parameters:**
- `id: string` - Sale ID

**Returns:** `Promise<void>`

### Items Functions

#### `listItems(saleId: string)`
Get all items for a specific sale.

**Parameters:**
- `saleId: string` - Sale ID

**Returns:** `Promise<Item[]>`

#### `createItem(saleId: string, input: ItemInput)`
Create a new item for a sale.

**Parameters:**
- `saleId: string` - Sale ID
- `input: ItemInput` - Item data

**Returns:** `Promise<Item>`

### Favorites Functions

#### `toggleFavorite(saleId: string)`
Toggle favorite status for a sale.

**Parameters:**
- `saleId: string` - Sale ID

**Returns:** `Promise<{ is_favorited: boolean }>`

## Server Actions

Server actions are available in `./actions.ts` for use in forms and client components:

- `createSaleAction(input)` - Create sale with revalidation
- `updateSaleAction(id, input)` - Update sale with revalidation
- `deleteSaleAction(id)` - Delete sale with redirect
- `createItemAction(saleId, input)` - Create item with revalidation
- `toggleFavoriteAction(saleId)` - Toggle favorite with revalidation

## Types

### Sale
```typescript
type Sale = {
  id: string
  owner_id: string
  title: string
  description?: string
  address?: string
  city: string
  state: string
  zip_code?: string
  lat?: number
  lng?: number
  date_start: string
  time_start: string
  date_end?: string
  time_end?: string
  price?: number
  tags?: string[]
  status: 'draft' | 'published' | 'archived' | 'active'
  privacy_mode: 'exact' | 'block_until_24h'
  is_featured: boolean
  created_at: string
  updated_at: string
}
```

### Item
```typescript
type Item = {
  id: string
  sale_id: string
  name: string
  description?: string
  price?: number
  category?: string
  condition?: string
  images: string[]
  is_sold: boolean
  created_at: string
  updated_at: string
}
```

## Usage Examples

### Basic Usage
```typescript
import { getSales, createSale, type Sale } from '@/lib/data'

// Get all sales
const sales = await getSales()

// Get sales in a specific city
const citySales = await getSales({ city: 'Louisville' })

// Create a new sale
const newSale = await createSale({
  title: 'Amazing Yard Sale',
  city: 'Louisville',
  state: 'KY',
  date_start: '2024-01-06',
  time_start: '08:00',
  status: 'published'
})
```

### Advanced Filtering
```typescript
// Get sales within 25km of a location
const nearbySales = await getSales({
  lat: 38.2527,
  lng: -85.7585,
  distanceKm: 25
})

// Get sales in a date range with specific categories
const weekendSales = await getSales({
  dateRange: {
    start: '2024-01-06',
    end: '2024-01-07'
  },
  categories: ['Furniture', 'Electronics']
})
```

### Server Actions
```typescript
import { createSaleAction } from '@/lib/data/actions'

// In a form action
export async function handleSubmit(formData: FormData) {
  const result = await createSaleAction({
    title: formData.get('title') as string,
    city: formData.get('city') as string,
    // ... other fields
  })
  
  if (result.success) {
    // Handle success
  } else {
    // Handle error
    console.error(result.error)
  }
}
```

## Error Handling

All functions include proper error handling:

```typescript
try {
  const sale = await getSaleById('some-id')
  if (!sale) {
    console.log('Sale not found')
    return
  }
  // Use sale
} catch (error) {
  console.error('Error fetching sale:', error)
  // Handle error
}
```

## Schema Configuration

The functions automatically use the correct schema based on the `NEXT_PUBLIC_SUPABASE_SCHEMA` environment variable:

- If set to `lootaura_v2`: Uses `lootaura_v2.sales`, `lootaura_v2.items`, etc.
- If not set or set to `public`: Uses `sales`, `items`, etc.

## Authentication

All write operations (create, update, delete) require authentication and verify user ownership where appropriate.

## Validation

All inputs are validated using Zod schemas before database operations, ensuring data integrity and proper error messages.
