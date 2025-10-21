'use client'

import { X } from 'lucide-react'

type CategoryChipsProps = {
  selectedCategories: string[]
  onCategoriesChange: (categories: string[]) => void
  availableCategories?: string[]
}

const DEFAULT_CATEGORIES = [
  'Furniture',
  'Electronics',
  'Clothing',
  'Books',
  'Toys',
  'Tools',
  'Sports',
  'Home & Garden',
  'Antiques',
  'Collectibles'
]

export function CategoryChips({ 
  selectedCategories, 
  onCategoriesChange, 
  availableCategories = DEFAULT_CATEGORIES 
}: CategoryChipsProps) {
  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category))
    } else {
      onCategoriesChange([...selectedCategories, category])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {availableCategories.map((category) => {
        const isSelected = selectedCategories.includes(category)
        return (
          <button
            key={category}
            onClick={() => handleCategoryToggle(category)}
            className={`
              inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors
              ${isSelected 
                ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
              }
            `}
          >
            {category}
            {isSelected && (
              <X className="h-3 w-3" />
            )}
          </button>
        )
      })}
    </div>
  )
}
