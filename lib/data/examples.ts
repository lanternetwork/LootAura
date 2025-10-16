/**
 * Examples of how to use the data functions
 * This file demonstrates proper usage patterns
 */

import { 
  getSales, 
  getSaleById, 
  createSale, 
  updateSale, 
  deleteSale, 
  listItems, 
  createItem, 
  toggleFavorite,
  // type Item,
  // type GetSalesParams
} from './sales'
// import { Sale } from '@/lib/types'

// Example: Get sales with filters
export async function getSalesExample() {
  try {
    // Get all published sales
    const allSales = await getSales()
    
    // Get sales in a specific city
    const citySales = await getSales({ 
      city: 'Louisville',
      distanceKm: 25,
      limit: 50,
      offset: 0
    })
    
    // Get sales within 25km of a location
    const nearbySales = await getSales({
      lat: 38.2527,
      lng: -85.7585,
      distanceKm: 25,
      limit: 50,
      offset: 0
    })
    
    // Get sales in a date range
    const weekendSales = await getSales({
      dateRange: 'weekend',
      distanceKm: 25,
      limit: 50,
      offset: 0
    })
    
    // Get sales with specific categories
    const furnitureSales = await getSales({
      categories: ['Furniture', 'Electronics'],
      distanceKm: 25,
      limit: 50,
      offset: 0
    })
    
    // Combined filters
    const filteredSales = await getSales({
      city: 'Louisville',
      categories: ['Furniture'],
      dateRange: 'weekend',
      distanceKm: 25,
      limit: 20,
      offset: 0
    })
    
    return {
      allSales,
      citySales,
      nearbySales,
      weekendSales,
      furnitureSales,
      filteredSales
    }
  } catch (error) {
    console.error('Error in getSalesExample:', error)
    throw error
  }
}

// Example: Get a specific sale
export async function getSaleExample(id: string) {
  try {
    const sale = await getSaleById(id)
    
    if (!sale) {
      throw new Error('Sale not found')
    }
    
    return sale
  } catch (error) {
    console.error('Error in getSaleExample:', error)
    throw error
  }
}

// Example: Create a new sale
export async function createSaleExample() {
  try {
    const newSale = await createSale({
      title: 'Amazing Yard Sale - Everything Must Go!',
      description: 'Moving sale with furniture, electronics, and more',
      address: '123 Main St',
      city: 'Louisville',
      state: 'KY',
      zip_code: '40202',
      date_start: '2024-01-06',
      time_start: '08:00',
      date_end: '2024-01-06',
      time_end: '14:00',
      price: 0, // Free
      tags: ['Furniture', 'Electronics', 'Clothing'],
      status: 'published',
      privacy_mode: 'exact',
      is_featured: false
    })
    
    return newSale
  } catch (error) {
    console.error('Error in createSaleExample:', error)
    throw error
  }
}

// Example: Update a sale
export async function updateSaleExample(id: string) {
  try {
    const updatedSale = await updateSale(id, {
      title: 'Updated Yard Sale Title',
      description: 'Updated description',
      price: 50,
      tags: ['Furniture', 'Tools']
    })
    
    return updatedSale
  } catch (error) {
    console.error('Error in updateSaleExample:', error)
    throw error
  }
}

// Example: Delete a sale
export async function deleteSaleExample(id: string) {
  try {
    await deleteSale(id)
    return { success: true }
  } catch (error) {
    console.error('Error in deleteSaleExample:', error)
    throw error
  }
}

// Example: List items for a sale
export async function listItemsExample(saleId: string) {
  try {
    const items = await listItems(saleId)
    return items
  } catch (error) {
    console.error('Error in listItemsExample:', error)
    throw error
  }
}

// Example: Create an item
export async function createItemExample(saleId: string) {
  try {
    const newItem = await createItem(saleId, {
      name: 'Vintage Coffee Table',
      description: 'Beautiful wooden coffee table in excellent condition',
      price: 75,
      category: 'Furniture',
      condition: 'Excellent',
      images: ['https://example.com/image1.jpg'],
      is_sold: false
    })
    
    return newItem
  } catch (error) {
    console.error('Error in createItemExample:', error)
    throw error
  }
}

// Example: Toggle favorite
export async function toggleFavoriteExample(saleId: string) {
  try {
    const result = await toggleFavorite(saleId)
    return result
  } catch (error) {
    console.error('Error in toggleFavoriteExample:', error)
    throw error
  }
}

// Example: Complex query with multiple filters
export async function complexQueryExample() {
  try {
    // Get sales in Louisville within 10km of downtown
    // that are happening this weekend
    // and have furniture or electronics
    const sales = await getSales({
      city: 'Louisville',
      lat: 38.2527,
      lng: -85.7585,
      distanceKm: 10,
      dateRange: 'weekend',
      categories: ['Furniture', 'Electronics'],
      limit: 20,
      offset: 0
    })
    
    return sales
  } catch (error) {
    console.error('Error in complexQueryExample:', error)
    throw error
  }
}

// Example: Error handling patterns
export async function errorHandlingExample() {
  try {
    // This will throw an error if the sale doesn't exist
    const sale = await getSaleById('non-existent-id')
    
    if (!sale) {
      console.log('Sale not found')
      return null
    }
    
    return sale
  } catch (error) {
    if (error instanceof Error) {
      console.error('Specific error:', error.message)
    } else {
      console.error('Unknown error:', error)
    }
    throw error
  }
}
