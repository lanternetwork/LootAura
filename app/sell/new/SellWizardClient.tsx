'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SaleInput } from '@/lib/data'
import CloudinaryUploadWidget from '@/components/upload/CloudinaryUploadWidget'
import ImageThumbnailGrid from '@/components/upload/ImageThumbnailGrid'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

interface WizardStep {
  id: string
  title: string
  description: string
}

const WIZARD_STEPS: WizardStep[] = [
  {
    id: 'details',
    title: 'Sale Details',
    description: 'Basic information about your sale'
  },
  {
    id: 'photos',
    title: 'Photos',
    description: 'Add photos to showcase your items'
  },
  {
    id: 'items',
    title: 'Items',
    description: 'List the items you\'re selling'
  },
  {
    id: 'review',
    title: 'Review',
    description: 'Review and publish your sale'
  }
]

export default function SellWizardClient({ initialData, isEdit: _isEdit = false, saleId: _saleId }: { initialData?: Partial<SaleInput>; isEdit?: boolean; saleId?: string }) {
  const router = useRouter()
  const supabase = createSupabaseBrowserClient()
  const [currentStep, setCurrentStep] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [formData, setFormData] = useState<Partial<SaleInput>>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    address: initialData?.address || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    zip_code: initialData?.zip_code || '',
    date_start: initialData?.date_start || '',
    time_start: initialData?.time_start || '',
    date_end: initialData?.date_end || '',
    time_end: initialData?.time_end || '',
    price: initialData?.price,
    tags: initialData?.tags || [],
    status: initialData?.status || 'draft'
  })
  const [photos, setPhotos] = useState<string[]>([])
  const [items, setItems] = useState<Array<{ name: string; price?: number; description?: string; image_url?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [_errors, setErrors] = useState<Record<string, string>>({})

  // Check authentication status
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    checkUser()
  }, [supabase.auth])

  // Save draft to localStorage whenever form data changes
  useEffect(() => {
    // Ensure body scroll is unlocked on mount (in case a previous modal left it locked)
    if (typeof document !== 'undefined') {
      document.body.style.overflow = ''
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = ''
      }
    }
  }, [])

  // Save draft to localStorage whenever form data changes
  useEffect(() => {
    const draftData = {
      formData,
      photos,
      items,
      currentStep
    }
    localStorage.setItem('sale_draft', JSON.stringify(draftData))
  }, [formData, photos, items, currentStep])

  // Load draft from localStorage on mount
  useEffect(() => {
    if (!initialData) {
      const savedDraft = localStorage.getItem('sale_draft')
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft)
          setFormData(draft.formData || {})
          setPhotos(draft.photos || [])
          setItems(draft.items || [])
          setCurrentStep(draft.currentStep || 0)
        } catch (error) {
          console.error('Error loading draft:', error)
        }
      }
    }
  }, [initialData])

  const handleInputChange = (field: keyof SaleInput, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleNext = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    // Client-side required validation
    const nextErrors: Record<string, string> = {}
    if (!formData.title) nextErrors.title = 'Title is required'
    if (!formData.address) nextErrors.address = 'Address is required'
    if (!formData.city) nextErrors.city = 'City is required'
    if (!formData.state) nextErrors.state = 'State is required'
    if (!formData.date_start) nextErrors.date_start = 'Start date is required'
    if (!formData.time_start) nextErrors.time_start = 'Start time is required'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }
    // Check if user is authenticated
    if (!user) {
      // Save current draft and redirect to auth
      const draftData = {
        formData,
        photos,
        items,
        currentStep
      }
      localStorage.setItem('sale_draft', JSON.stringify(draftData))
      
      // Redirect to auth with return URL
      const returnUrl = encodeURIComponent(window.location.pathname)
      router.push(`/auth/signin?redirectTo=${returnUrl}`)
      return
    }

    setLoading(true)
    try {
      // Prepare sale data with cover image
      const saleData = {
        ...formData,
        cover_image_url: photos.length > 0 ? photos[0] : undefined
      }

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saleData),
      })

      if (response.ok) {
        const { sale } = await response.json()
        // Clear draft after successful submission
        localStorage.removeItem('sale_draft')
        router.push(`/sales/${sale.id}`)
      } else {
        console.error('Failed to create sale')
      }
    } catch (error) {
      console.error('Error creating sale:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePhotoUpload = (urls: string[]) => {
    setPhotos(prev => [...prev, ...urls])
  }

  const handleReorderPhotos = (fromIndex: number, toIndex: number) => {
    setPhotos(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleSetCover = (index: number) => {
    setPhotos(prev => {
      if (index <= 0 || index >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(index, 1)
      next.unshift(moved)
      return next
    })
  }

  const handleRemovePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  const handleAddItem = () => {
    setItems(prev => [...prev, { name: '', price: undefined, description: '' }])
  }

  const handleUpdateItem = (index: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    ))
  }

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <DetailsStep formData={formData} onChange={handleInputChange} />
      case 1:
        return <PhotosStep photos={photos} onUpload={handlePhotoUpload} onRemove={handleRemovePhoto} onReorder={handleReorderPhotos} onSetCover={handleSetCover} />
      case 2:
        return <ItemsStep items={items} onAdd={handleAddItem} onUpdate={handleUpdateItem} onRemove={handleRemoveItem} />
      case 3:
        return <ReviewStep formData={formData} photos={photos} items={items} />
      default:
        return null
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">List Your Sale</h1>
        <p className="text-gray-600">Create a listing to reach more buyers in your area</p>
        <p className="text-sm text-gray-500 mt-2">You can fill this out without an account. We'll ask you to sign in when you submit.</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex justify-center">
          <div className="flex space-x-4">
            {WIZARD_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  index <= currentStep
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="text-center mt-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {WIZARD_STEPS[currentStep].title}
          </h2>
          <p className="text-gray-600">
            {WIZARD_STEPS[currentStep].description}
          </p>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-sm p-8">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className="inline-flex items-center px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>

        {currentStep < WIZARD_STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
          >
            Next
            <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Publishing...
              </>
            ) : (
              <>
                Publish Sale
                <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// Step Components
function DetailsStep({ formData, onChange }: { formData: Partial<SaleInput>, onChange: (field: keyof SaleInput, value: any) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sale Title *
        </label>
        <input
          type="text"
          value={formData.title || ''}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="e.g., Huge Yard Sale with Antiques"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description
        </label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Describe your sale and what items you're selling..."
          rows={4}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Date *
          </label>
          <input
            type="date"
            value={formData.date_start || ''}
            onChange={(e) => onChange('date_start', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Time *
          </label>
          <input
            type="time"
            value={formData.time_start || ''}
            onChange={(e) => onChange('time_start', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Date (Optional)
          </label>
          <input
            type="date"
            value={formData.date_end || ''}
            onChange={(e) => onChange('date_end', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Time (Optional)
          </label>
          <input
            type="time"
            value={formData.time_end || ''}
            onChange={(e) => onChange('time_end', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Address *
        </label>
        <input
          type="text"
          value={formData.address || ''}
          onChange={(e) => onChange('address', e.target.value)}
          placeholder="Street address"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            City *
          </label>
          <input
            type="text"
            value={formData.city || ''}
            onChange={(e) => onChange('city', e.target.value)}
            placeholder="City"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            State *
          </label>
          <input
            type="text"
            value={formData.state || ''}
            onChange={(e) => onChange('state', e.target.value)}
            placeholder="State"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ZIP Code
          </label>
          <input
            type="text"
            value={formData.zip_code || ''}
            onChange={(e) => onChange('zip_code', e.target.value)}
            placeholder="ZIP Code"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Starting Price (Optional)
        </label>
        <input
          type="number"
          value={formData.price || ''}
          onChange={(e) => onChange('price', e.target.value ? parseFloat(e.target.value) : undefined)}
          placeholder="0.00"
          min="0"
          step="0.01"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <p className="text-sm text-gray-500 mt-1">Leave blank if items are free</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Categories
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            'Furniture', 'Electronics', 'Clothing', 'Toys',
            'Books', 'Tools', 'Kitchen', 'Sports',
            'Garden', 'Art', 'Collectibles', 'Miscellaneous'
          ].map((category) => (
            <label key={category} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.tags?.includes(category) || false}
                onChange={(e) => {
                  const currentTags = formData.tags || []
                  if (e.target.checked) {
                    onChange('tags', [...currentTags, category])
                  } else {
                    onChange('tags', currentTags.filter(tag => tag !== category))
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{category}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function PhotosStep({ photos, onUpload, onRemove, onReorder, onSetCover }: { 
  photos: string[], 
  onUpload: (urls: string[]) => void,
  onRemove: (index: number) => void,
  onReorder?: (fromIndex: number, toIndex: number) => void,
  onSetCover?: (index: number) => void,
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Photos (Optional)
        </label>
        <p className="text-sm text-gray-500 mb-4">
          Add photos to showcase your items. You can upload up to 10 photos.
        </p>
        
        <CloudinaryUploadWidget 
          onUpload={onUpload}
          maxFiles={10 - photos.length}
          className="mb-6"
        />
      </div>

      {photos.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Uploaded Photos ({photos.length}/10)
          </h3>
          <ImageThumbnailGrid 
            images={photos}
            onRemove={onRemove}
            onReorder={onReorder}
            onSetCover={onSetCover}
            maxImages={10}
          />
        </div>
      )}
    </div>
  )
}

function ItemsStep({ items, onAdd, onUpdate, onRemove }: {
  items: Array<{ name: string; price?: number; description?: string; image_url?: string }>,
  onAdd: () => void,
  onUpdate: (index: number, field: string, value: any) => void,
  onRemove: (index: number) => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Items for Sale</h3>
        <button
          onClick={onAdd}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p>No items added yet. Click "Add Item" to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-medium text-gray-900">Item {index + 1}</h4>
                <button
                  onClick={() => onRemove(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Name *
                  </label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => onUpdate(index, 'name', e.target.value)}
                    placeholder="e.g., Vintage Coffee Table"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price (Optional)
                  </label>
                  <input
                    type="number"
                    value={item.price || ''}
                    onChange={(e) => onUpdate(index, 'price', e.target.value ? parseFloat(e.target.value) : undefined)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (Optional)
                </label>
                <textarea
                  value={item.description || ''}
                  onChange={(e) => onUpdate(index, 'description', e.target.value)}
                  placeholder="Describe the item's condition, age, etc."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Item Image Upload */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Item Photo (Optional)
                </label>
                <CloudinaryUploadWidget 
                  onUpload={(urls) => onUpdate(index, 'image_url', urls[0])}
                  maxFiles={1}
                  className="mb-3"
                />
                {item.image_url && (
                  <div className="mt-2">
                    <div className="relative inline-block">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        onClick={() => onUpdate(index, 'image_url', undefined)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewStep({ formData, photos, items }: {
  formData: Partial<SaleInput>,
  photos: string[],
  items: Array<{ name: string; price?: number; description?: string }>
}) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':')
    const hour = parseInt(hours)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-900">Review Your Sale</h3>
      
      <div className="bg-gray-50 rounded-lg p-6 space-y-4">
        <div>
          <h4 className="font-medium text-gray-900">Sale Information</h4>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <p><strong>Title:</strong> {formData.title}</p>
            {formData.description && <p><strong>Description:</strong> {formData.description}</p>}
            <p><strong>Date:</strong> {formData.date_start && formatDate(formData.date_start)} at {formData.time_start && formatTime(formData.time_start)}</p>
            {formData.date_end && <p><strong>Ends:</strong> {formatDate(formData.date_end)} at {formData.time_end && formatTime(formData.time_end)}</p>}
            <p><strong>Location:</strong> {formData.address}, {formData.city}, {formData.state}</p>
            {formData.price && <p><strong>Starting Price:</strong> ${formData.price}</p>}
            {formData.tags && formData.tags.length > 0 && (
              <p><strong>Categories:</strong> {formData.tags.join(', ')}</p>
            )}
          </div>
        </div>

        {photos.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-900">Photos ({photos.length})</h4>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {photos.map((photo, index) => (
                <img
                  key={index}
                  src={photo}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-20 object-cover rounded"
                />
              ))}
            </div>
          </div>
        )}

        {items.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-900">Items ({items.length})</h4>
            <div className="mt-2 space-y-2">
              {items.map((item, index) => (
                <div key={index} className="text-sm text-gray-600">
                  <strong>{item.name}</strong>
                  {item.price && ` - $${item.price}`}
                  {item.description && <div className="text-xs text-gray-500">{item.description}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-blue-400 mr-3 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="font-medium text-blue-800">Ready to publish?</h4>
            <p className="text-sm text-blue-700 mt-1">
              Your sale will be visible to buyers in your area. You can edit it later from your account.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
