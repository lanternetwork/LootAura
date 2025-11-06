'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import CloudinaryUploadWidget from '@/components/upload/CloudinaryUploadWidget'
import { CATEGORIES, type CategoryDef, getCategoryByValue } from '@/lib/data/categories'
import type { CategoryValue } from '@/lib/types'

// Generate stable UUID for new items
function generateItemId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `item-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
}

interface ItemFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (item: {
    id: string
    name: string
    price?: number
    description?: string
    image_url?: string
    category: CategoryValue
  }) => void
  initialItem?: {
    id: string
    name: string
    price?: number
    description?: string
    image_url?: string
    category?: CategoryValue
  }
}

export default function ItemFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialItem
}: ItemFormModalProps) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState<string>('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined)
  const [category, setCategory] = useState<CategoryValue | ''>('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const modalRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Reset form when modal opens - only reset when opening, not on every initialItem change
  const previousIsOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen && !previousIsOpenRef.current) {
      // Modal just opened - reset form
      if (initialItem) {
        setName(initialItem.name || '')
        setPrice(initialItem.price?.toString() || '')
        setDescription(initialItem.description || '')
        setImageUrl(initialItem.image_url)
        // Validate category - if invalid, set to empty and show helper
        const categoryValue = initialItem.category
        if (categoryValue && getCategoryByValue(categoryValue)) {
          setCategory(categoryValue)
        } else {
          setCategory('')
          // Show helper for invalid categories
          if (categoryValue) {
            setErrors({ category: 'Please choose a valid category to continue' })
          }
        }
      } else {
        setName('')
        setPrice('')
        setDescription('')
        setImageUrl(undefined)
        setCategory('')
      }
      setErrors({})
      // Focus name input after a brief delay to ensure modal is rendered
      setTimeout(() => {
        nameInputRef.current?.focus()
      }, 100)
    }
    previousIsOpenRef.current = isOpen
  }, [isOpen, initialItem])

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    // Lock body scroll
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // Handle outside click - stable callback
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  // Stable image upload handler - buffers locally
  const handleImageUpload = useCallback((urls: string[]) => {
    setImageUrl(urls[0])
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    const newErrors: Record<string, string> = {}
    const trimmedName = name.trim()
    
    if (!trimmedName) {
      newErrors.name = 'Item name is required'
    }

    if (!category) {
      newErrors.category = 'Category is required'
    }

    if (price && (isNaN(parseFloat(price)) || parseFloat(price) < 0)) {
      newErrors.price = 'Price must be a number greater than or equal to 0'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    // Submit - use stable ID from initialItem or generate new one
    const item = {
      id: initialItem?.id || generateItemId(),
      name: trimmedName,
      price: price ? parseFloat(price) : undefined,
      description: description.trim() || undefined,
      image_url: imageUrl,
      category: category as CategoryValue,
    }

    onSubmit(item)
    onClose()
  }, [name, price, description, imageUrl, category, initialItem, onSubmit, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-form-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 id="item-form-title" className="text-xl font-semibold text-gray-900">
            {initialItem ? 'Edit Item' : 'Add Item'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Item Name */}
          <div>
            <label htmlFor="item-name" className="block text-sm font-medium text-gray-700 mb-1">
              Item Name *
            </label>
            <input
              ref={nameInputRef}
              id="item-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name) {
                  setErrors(prev => {
                    const next = { ...prev }
                    delete next.name
                    return next
                  })
                }
              }}
              placeholder="e.g., Vintage Coffee Table"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              required
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Price and Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="item-price" className="block text-sm font-medium text-gray-700 mb-1">
                Price (Optional)
              </label>
              <input
                id="item-price"
                type="number"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value)
                  if (errors.price) {
                    setErrors(prev => {
                      const next = { ...prev }
                      delete next.price
                      return next
                    })
                  }
                }}
                placeholder="0.00"
                min="0"
                step="0.01"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] ${
                  errors.price ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.price && (
                <p className="mt-1 text-sm text-red-600">{errors.price}</p>
              )}
            </div>

            <div>
              <label htmlFor="item-category" className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                id="item-category"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as CategoryValue | '')
                  if (errors.category) {
                    setErrors(prev => {
                      const next = { ...prev }
                      delete next.category
                      return next
                    })
                  }
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] ${
                  errors.category ? 'border-red-300' : 'border-gray-300'
                }`}
                required
                aria-label="Select category"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.icon ? `${cat.icon} ${cat.label}` : cat.label}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-sm text-red-600">{errors.category}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="item-description" className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the item's condition, age, etc."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Item Photo (Optional)
            </label>
            {imageUrl ? (
              <div className="space-y-2">
                <div className="relative inline-block">
                  <img
                    src={imageUrl}
                    alt={name || 'Item'}
                    className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl(undefined)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    aria-label="Remove image"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <CloudinaryUploadWidget
                  onUpload={handleImageUpload}
                  maxFiles={1}
                />
              </div>
            ) : (
              <CloudinaryUploadWidget
                onUpload={handleImageUpload}
                maxFiles={1}
              />
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 btn-accent min-h-[44px]"
            >
              {initialItem ? 'Update Item' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

