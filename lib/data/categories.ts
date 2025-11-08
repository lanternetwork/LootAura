/**
 * Shared category definitions - single source of truth for all category values
 * Used by map filters, item forms, and category displays
 */

export interface CategoryDef {
  value: string
  label: string
  icon?: string
}

export const CATEGORIES: readonly CategoryDef[] = [
  { value: 'tools', label: 'Tools', icon: '🔧' },
  { value: 'toys', label: 'Toys', icon: '🧸' },
  { value: 'furniture', label: 'Furniture', icon: '🪑' },
  { value: 'electronics', label: 'Electronics', icon: '📱' },
  { value: 'clothing', label: 'Clothing', icon: '👕' },
  { value: 'books', label: 'Books', icon: '📚' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
  { value: 'home', label: 'Home & Garden', icon: '🏠' },
  { value: 'automotive', label: 'Automotive', icon: '🚗' },
  { value: 'collectibles', label: 'Collectibles', icon: '🎯' },
  { value: 'antiques', label: 'Antiques', icon: '🏺' },
  { value: 'misc', label: 'Miscellaneous', icon: '📦' }
] as const

export const CATEGORY_VALUES = CATEGORIES.map(c => c.value) as readonly string[]

/**
 * Get category definition by value
 */
export function getCategoryByValue(value: string): CategoryDef | undefined {
  return CATEGORIES.find(c => c.value === value)
}

/**
 * Get category label by value
 */
export function getCategoryLabel(value: string): string {
  return getCategoryByValue(value)?.label || value
}

/**
 * Get category icon by value
 */
export function getCategoryIcon(value: string): string | undefined {
  return getCategoryByValue(value)?.icon
}
