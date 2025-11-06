'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SaleInput } from '@/lib/data'
import CloudinaryUploadWidget from '@/components/upload/CloudinaryUploadWidget'
import ImageThumbnailGrid from '@/components/upload/ImageThumbnailGrid'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { containsUnsavory } from '@/lib/filters/profanity'
import AddressAutocomplete from '@/components/location/AddressAutocomplete'
import TimePicker30 from '@/components/TimePicker30'
import ItemFormModal from '@/components/sales/ItemFormModal'
import ItemCard from '@/components/sales/ItemCard'
import Toast from '@/components/sales/Toast'

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

export default function SellWizardClient({ initialData, isEdit: _isEdit = false, saleId: _saleId, userLat, userLng }: { initialData?: Partial<SaleInput>; isEdit?: boolean; saleId?: string; userLat?: number; userLng?: number }) {
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
    duration_hours: initialData?.duration_hours || 4, // Default 4 hours
    tags: initialData?.tags || [],
    pricing_mode: initialData?.pricing_mode || 'negotiable',
    status: initialData?.status || 'draft'
  })
  const [photos, setPhotos] = useState<string[]>([])
  const [items, setItems] = useState<Array<{ id: string; name: string; price?: number; description?: string; image_url?: string; category?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [_errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const normalizeTimeToNearest30 = useCallback((value: string | undefined | null): string | undefined => {
    if (!value || typeof value !== 'string' || !value.includes(':')) return value || undefined
    const parts = value.split(':')
    const hRaw = parts[0]
    const mRaw = parts[1]
    const h0 = Math.max(0, Math.min(23, parseInt(hRaw, 10) || 0))
    const m0 = Math.max(0, Math.min(59, parseInt(mRaw, 10) || 0))
    let snapped = Math.round(m0 / 30) * 30 // round to nearest 0 or 30
    let h = h0
    if (snapped === 60) { // carry over
      snapped = 0
      h = (h + 1) % 24
    }
    return `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`
  }, [])

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
          const nextForm = { ...(draft.formData || {}) }
          if (nextForm.time_start) {
            nextForm.time_start = normalizeTimeToNearest30(nextForm.time_start)
          }
          setFormData(nextForm)
          setPhotos(draft.photos || [])
          // Ensure items have IDs when loading from draft
          const loadedItems = (draft.items || []).map((item: any) => ({
            ...item,
            id: item.id || `item-${Date.now()}-${Math.random()}`
          }))
          setItems(loadedItems)
          setCurrentStep(draft.currentStep || 0)
        } catch (error) {
          console.error('Error loading draft:', error)
        }
      }
    }
  }, [initialData])

  const handleInputChange = (field: keyof SaleInput, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Snap start time to 30-minute increments (nearest 00/30 with carry)
      if (field === 'time_start' && typeof value === 'string' && value.includes(':')) {
        updated.time_start = normalizeTimeToNearest30(value)
      }
      
      // Calculate end date/time when duration, start date, or start time changes
      if (field === 'duration_hours' || field === 'date_start' || field === 'time_start') {
        const dateStart = updated.date_start || prev.date_start
        const timeStart = updated.time_start || prev.time_start
        const durationHours = updated.duration_hours || prev.duration_hours || 4
        
        if (dateStart && timeStart && durationHours) {
          // Validate duration doesn't exceed 24 hours
          const maxDuration = 24
          const actualDuration = Math.min(durationHours, maxDuration)
          
          // Calculate end time
          const startDateTime = new Date(`${dateStart}T${timeStart}`)
          const endDateTime = new Date(startDateTime.getTime() + actualDuration * 60 * 60 * 1000)
          
          // Format end date (YYYY-MM-DD)
          const endDate = endDateTime.toISOString().split('T')[0]
          // Format end time (HH:MM)
          const endTime = endDateTime.toTimeString().split(' ')[0].substring(0, 5)
          
          updated.date_end = endDate
          updated.time_end = endTime
        }
      }
      
      return updated
    })
  }

  const validateDetails = (): Record<string, string> => {
    const nextErrors: Record<string, string> = {}
    if (!formData.title) nextErrors.title = 'Title is required'
    if (!formData.address || formData.address.trim().length < 5) {
      nextErrors.address = 'Address is required (minimum 5 characters)'
    }
    if (!formData.city || formData.city.trim().length < 2) {
      nextErrors.city = 'City is required (minimum 2 characters)'
    }
    if (!formData.state || formData.state.trim().length < 2) {
      nextErrors.state = 'State is required (minimum 2 characters)'
    }
    if (formData.zip_code && !/^\d{5}(-\d{4})?$/.test(formData.zip_code)) {
      nextErrors.zip_code = 'ZIP code must be 5 digits or 5+4 format'
    }
    if (!formData.lat || !formData.lng) {
      nextErrors.address = 'Please enter a complete address (street, city, state) and leave the field to get location coordinates'
    }
    if (!formData.date_start) nextErrors.date_start = 'Start date is required'
    if (!formData.time_start) nextErrors.time_start = 'Start time is required'
    
    // Validate duration
    const durationHours = formData.duration_hours || 4
    if (durationHours > 24) {
      nextErrors.duration_hours = 'Sale cannot last more than 24 hours'
    }
    if (durationHours <= 0) {
      nextErrors.duration_hours = 'Duration must be greater than 0'
    }
    
    // Unsavory language checks (client-side guard; server also validates)
    const unsavoryFields: Array<[keyof SaleInput, string | undefined]> = [
      ['title', formData.title],
      ['description', formData.description],
      ['address', formData.address],
      ['city', formData.city],
      ['state', formData.state],
    ]
    for (const [key, value] of unsavoryFields) {
      const res = containsUnsavory(value || '')
      if (!res.ok) nextErrors[key as string] = 'Please remove inappropriate language'
    }
    return nextErrors
  }

  const handleNext = () => {
    // Require core fields on the Details step before advancing
    if (currentStep === 0) {
      const nextErrors = validateDetails()
      setErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) {
        return
      }
    }
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
    const nextErrors = validateDetails()
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
    // Ensure time_start is normalized just before submit (covers pasted/loaded values)
    if (formData.time_start) {
      const snapped = normalizeTimeToNearest30(formData.time_start)
      if (snapped !== formData.time_start) {
        setFormData(prev => ({ ...prev, time_start: snapped }))
      }
    }
    try {
      // Prepare sale data with cover image
      // Remove duration_hours from payload (it's only used for client-side calculation)
      const { duration_hours: _duration_hours, ...restFormData } = formData
      const saleData = {
        ...restFormData,
        cover_image_url: photos.length > 0 ? photos[0] : undefined,
        images: photos.length > 1 ? photos.slice(1) : undefined
      }

      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(saleData),
      })

      if (response.ok) {
        const result = await response.json()
        const sale = result.sale || result
        // Clear draft after successful submission
        localStorage.removeItem('sale_draft')
        router.push(`/sales/${sale.id}`)
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create sale' }))
        console.error('Failed to create sale:', errorData)
        setSubmitError(errorData.error || errorData.details || 'Failed to create sale')
      }
    } catch (error) {
      console.error('Error creating sale:', error)
      setSubmitError(error instanceof Error ? error.message : 'Failed to create sale')
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

  const handleAddItem = useCallback((item: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: string }) => {
    setItems(prev => {
      if (prev.length >= 50) return prev
      return [...prev, item]
    })
  }, [])

  const handleUpdateItem = useCallback((updated: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: string }) => {
    setItems(prev => {
      const next = prev.slice()
      const i = next.findIndex(it => it.id === updated.id)
      if (i !== -1) {
        next[i] = { ...next[i], ...updated }
      }
      return next
    })
  }, [])

  const handleRemoveItem = useCallback((id: string) => {
    setItems(prev => prev.filter(it => it.id !== id))
  }, [])

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <DetailsStep formData={formData} onChange={handleInputChange} errors={_errors} userLat={userLat} userLng={userLng} />
      case 1:
        return <PhotosStep photos={photos} onUpload={handlePhotoUpload} onRemove={handleRemovePhoto} onReorder={handleReorderPhotos} onSetCover={handleSetCover} />
      case 2:
        return <ItemsStep items={items} onAdd={handleAddItem} onUpdate={handleUpdateItem} onRemove={handleRemoveItem} />
      case 3:
        return <ReviewStep formData={formData} photos={photos} items={items} onPublish={handleSubmit} loading={loading} submitError={submitError} />
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
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  {index + 1}
                </div>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    index < currentStep ? 'bg-[var(--accent-primary)]' : 'bg-gray-200'
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
      <div className="bg-white rounded-lg shadow-sm p-8 mb-24">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between">
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
            className="inline-flex items-center px-6 py-3 btn-accent min-h-[44px]"
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
    </div>
  )
}

// Step Components
function DetailsStep({ formData, onChange, errors, userLat, userLng }: { formData: Partial<SaleInput>, onChange: (field: keyof SaleInput, value: any) => void, errors?: Record<string, string>, userLat?: number, userLng?: number }) {
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
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
          required
        />
        {errors?.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title}</p>
        )}
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
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
            required
          />
        {errors?.date_start && (
          <p className="mt-1 text-sm text-red-600">{errors.date_start}</p>
        )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Time *
          </label>
          <TimePicker30
            value={formData.time_start || ''}
            onChange={(t) => onChange('time_start', t)}
            required
          />
          {errors?.time_start && (
            <p className="mt-1 text-sm text-red-600">{errors.time_start}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Duration (Hours) *
        </label>
        <input
          type="number"
          min="1"
          max="24"
          step="0.5"
          value={formData.duration_hours || 4}
          onChange={(e) => {
            const raw = (e.currentTarget as HTMLInputElement).valueAsNumber
            const hours = Number.isFinite(raw) ? raw : 4
            const clamped = Math.max(1, Math.min(24, hours))
            onChange('duration_hours', clamped)
          }}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
          required
        />
        <p className="mt-1 text-xs text-gray-500">
          Sale duration (1-24 hours). End time is calculated automatically.
        </p>
        {errors?.duration_hours && (
          <p className="mt-1 text-sm text-red-600">{errors.duration_hours}</p>
        )}
        {formData.date_end && formData.time_end && (
          <p className="mt-1 text-sm text-gray-600">
            Ends: {new Date(`${formData.date_end}T${formData.time_end}`).toLocaleString()}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Address *
        </label>
        <AddressAutocomplete
          value={formData.address || ''}
          onChange={(address) => onChange('address', address)}
          onPlaceSelected={(place) => {
            onChange('address', place.address)
            onChange('city', place.city)
            onChange('state', place.state)
            onChange('zip_code', place.zip)
            onChange('lat', place.lat)
            onChange('lng', place.lng)
          }}
          placeholder="Start typing your address..."
          userLat={userLat}
          userLng={userLng}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
          error={errors?.address}
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
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
            required
            minLength={2}
            pattern="[A-Za-z\s]+"
            title="City name (letters only)"
          />
        {errors?.city && (
          <p className="mt-1 text-sm text-red-600">{errors.city}</p>
        )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            State *
          </label>
          <input
            type="text"
            value={formData.state || ''}
            onChange={(e) => onChange('state', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="State (e.g., KY)"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
            minLength={2}
            maxLength={2}
            pattern="[A-Z]{2}"
            title="Two-letter state code (e.g., KY, CA)"
          />
        {errors?.state && (
          <p className="mt-1 text-sm text-red-600">{errors.state}</p>
        )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ZIP Code
          </label>
          <input
            type="text"
            value={formData.zip_code || ''}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 5)
              onChange('zip_code', value)
            }}
            placeholder="ZIP Code (5 digits)"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            pattern="\d{5}"
            title="5-digit ZIP code"
          />
        {errors?.zip_code && (
          <p className="mt-1 text-sm text-red-600">{errors.zip_code}</p>
        )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Pricing Policy
        </label>
        <select
          value={formData.pricing_mode || 'negotiable'}
          onChange={(e) => onChange('pricing_mode', e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
        >
          <option value="negotiable">Prices negotiable</option>
          <option value="firm">Prices as marked / Firm</option>
          <option value="best_offer">Best offer</option>
          <option value="ask">Prices not set / Ask seller</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Let buyers know your pricing expectations
        </p>
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
                className="rounded border-gray-300 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
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
  items: Array<{ id: string; name: string; price?: number; description?: string; image_url?: string; category?: string }>,
  onAdd: (item: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: string }) => void,
  onUpdate: (item: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: string }) => void,
  onRemove: (id: string) => void
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const MAX_ITEMS = 50

  const handleOpenModal = useCallback(() => {
    if (items.length >= MAX_ITEMS) {
      setToastMessage('Item limit reached (50)')
      setShowToast(true)
      return
    }
    setEditingItemId(null)
    setIsModalOpen(true)
  }, [items.length])

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingItemId(null)
    // Return focus to +Add Item button
    setTimeout(() => {
      addButtonRef.current?.focus()
    }, 100)
  }, [])

  const handleSubmit = useCallback((item: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: string }) => {
    if (editingItemId && item.id === editingItemId) {
      onUpdate(item)
    } else {
      onAdd(item)
    }
    setIsModalOpen(false)
    setEditingItemId(null)
    // Return focus to +Add Item button
    setTimeout(() => {
      addButtonRef.current?.focus()
    }, 100)
  }, [editingItemId, onAdd, onUpdate])

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Items for Sale</h3>
            {items.length > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {items.length} {items.length === 1 ? 'item' : 'items'} added
              </p>
            )}
          </div>
          <button
            ref={addButtonRef}
            onClick={handleOpenModal}
            disabled={items.length >= MAX_ITEMS}
            className="inline-flex items-center px-4 py-2 btn-accent min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Add item"
          >
            <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Item
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p>No items added yet. Click "Add Item" to get started.</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[calc(100vh-300px)] pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onDelete={() => onRemove(item.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <ItemFormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialItem={editingItemId ? items.find(it => it.id === editingItemId) : undefined}
      />

      <Toast
        message={toastMessage || ''}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </>
  )
}

function ReviewStep({ formData, photos, items, onPublish, loading, submitError }: {
  formData: Partial<SaleInput>,
  photos: string[],
  items: Array<{ id?: string; name: string; price?: number; description?: string }>,
  onPublish: () => void,
  loading: boolean,
  submitError?: string | null
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
              {items.map((item) => (
                <div key={item.id || `review-item-${item.name}`} className="text-sm text-gray-600">
                  <strong>{item.name}</strong>
                  {item.price && ` - $${item.price}`}
                  {item.description && <div className="text-xs text-gray-500">{item.description}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex">
          <svg className="w-5 h-5 text-purple-400 mr-3 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="font-medium text-purple-800">Ready to publish?</h4>
            <p className="text-sm text-purple-700 mt-1">
              Your sale will be visible to buyers in your area. You can edit it later from your account.
            </p>
          </div>
        </div>
      </div>
      
      <div className="mt-6 mb-6">
        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {submitError}
          </div>
        )}
        <button
          onClick={onPublish}
          disabled={loading}
          className="w-full inline-flex items-center justify-center px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] text-lg"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
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
      </div>
    </div>
  )
}
