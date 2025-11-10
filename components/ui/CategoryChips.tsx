'use client'

interface CategoryChipsProps {
  categories: string[]
  maxVisible?: number
}

/**
 * CategoryChips component - displays categories as chips/badges
 * Shows up to maxVisible chips, then "+N" for remaining
 */
export default function CategoryChips({ categories, maxVisible = 10 }: CategoryChipsProps) {
  if (!categories || categories.length === 0) {
    return null
  }

  const visibleCategories = categories.slice(0, maxVisible)
  const remainingCount = categories.length - maxVisible

  return (
    <div className="flex flex-wrap gap-2">
      {visibleCategories.map((category, index) => (
        <span
          key={index}
          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
        >
          {category}
        </span>
      ))}
      {remainingCount > 0 && (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-600">
          +{remainingCount}
        </span>
      )}
    </div>
  )
}

