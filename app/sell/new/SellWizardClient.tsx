'use client'

import { useState, useEffect, useCallback, useRef, startTransition, useMemo, useReducer } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isDebugEnabled } from '@/lib/debug'
import { SaleInput } from '@/lib/data'
import ImageUploadCard from '@/components/sales/ImageUploadCard'
import ImageThumbnailGrid from '@/components/upload/ImageThumbnailGrid'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { validateLocationStep, validateDetailsStep, validateItemsStep } from '@/lib/validation/wizardSteps'
import { computePublishability, type DraftRecord } from '@/lib/drafts/computePublishability'
import AddressAutocomplete from '@/components/location/AddressAutocomplete'
import TimePicker30 from '@/components/TimePicker30'
import ItemFormModal from '@/components/sales/ItemFormModal'
import ItemCard from '@/components/sales/ItemCard'
import Toast from '@/components/sales/Toast'
import ConfirmationModal from '@/components/sales/ConfirmationModal'
import type { CategoryValue } from '@/lib/types'
import { getDraftKey, saveLocalDraft, loadLocalDraft, clearLocalDraft, hasLocalDraft } from '@/lib/draft/localDraft'
import { saveDraftServer, getLatestDraftServer, getDraftByKeyServer, deleteDraftServer, publishDraftServer } from '@/lib/draft/draftClient'
import type { SaleDraftPayload } from '@/lib/validation/saleDraft'
import { getCsrfHeaders } from '@/lib/csrf-client'


interface WizardStep {
  id: string
  title: string
  description: string
}

// Single source of truth for step indexes
const STEPS = {
  DETAILS: 0,
  PHOTOS: 1,
  ITEMS: 2,
  PROMOTION: 3,
  REVIEW: 4
} as const

// WIZARD_STEPS is computed based on promotionsEnabled to conditionally include promotion step
// This function returns the steps array with promotion included if enabled
function getWizardSteps(promotionsEnabled: boolean): WizardStep[] {
  const baseSteps: WizardStep[] = [
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
    }
  ]

  if (promotionsEnabled) {
    baseSteps.push({
      id: 'promotion',
      title: 'Promote Your Sale',
      description: 'Get more visibility with promotion'
    })
  }

  baseSteps.push({
    id: 'review',
    title: 'Review',
    description: 'Review and publish your sale'
  })

  return baseSteps
}

// Wizard state type
type WizardState = {
  currentStep: number
  formData: Partial<SaleInput>
  photos: string[]
  items: Array<{ id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue }>
  wantsPromotion: boolean
  loading: boolean
  errors: Record<string, string>
  submitError: string | null
}

// Wizard actions
type WizardAction =
  | { type: 'RESUME_DRAFT'; payload: { formData?: Partial<SaleInput>; photos?: string[]; items?: Array<{ id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue }>; wantsPromotion?: boolean; currentStep?: number } }
  | { type: 'SET_STEP'; step: number }
  | { type: 'UPDATE_FORM'; field: keyof SaleInput; value: any }
  | { type: 'SET_FORM_DATA'; formData: Partial<SaleInput> }
  | { type: 'ADDRESS_SELECTED'; fields: { address?: string; city?: string; state?: string; zip_code?: string; lat?: number; lng?: number } }
  | { type: 'SET_PHOTOS'; photos: string[] }
  | { type: 'SET_ITEMS'; items: Array<{ id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue }> }
  | { type: 'ADD_ITEM'; item: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue } }
  | { type: 'UPDATE_ITEM'; item: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue } }
  | { type: 'REMOVE_ITEM'; id: string }
  | { type: 'TOGGLE_PROMOTION'; value: boolean }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERRORS'; errors: Record<string, string> }
  | { type: 'SET_SUBMIT_ERROR'; error: string | null }

// Initial wizard state
const initialWizardState: WizardState = {
  currentStep: 0,
  formData: {},
  photos: [],
  items: [],
  wantsPromotion: false,
  loading: false,
  errors: {},
  submitError: null,
}

// Wizard reducer
function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'RESUME_DRAFT':
      return {
        ...state,
        ...(action.payload.formData !== undefined && { formData: action.payload.formData }),
        ...(action.payload.photos !== undefined && { photos: action.payload.photos }),
        ...(action.payload.items !== undefined && { items: action.payload.items }),
        ...(action.payload.wantsPromotion !== undefined && { wantsPromotion: action.payload.wantsPromotion }),
        ...(action.payload.currentStep !== undefined && { currentStep: action.payload.currentStep }),
      }
    case 'SET_STEP':
      return { ...state, currentStep: action.step }
    case 'UPDATE_FORM':
      // Update a single form field (for manual typing)
      return { ...state, formData: { ...state.formData, [action.field]: action.value } }
    case 'ADDRESS_SELECTED':
      // Atomic update of all address fields from autocomplete selection
      // This is the authoritative source for address fields
      return {
        ...state,
        formData: {
          ...state.formData,
          ...action.fields
        }
      }
    case 'SET_FORM_DATA':
      // Merge new formData into existing formData instead of replacing it
      // This prevents derived field calculations from overwriting address fields
      return {
        ...state,
        formData: {
          ...state.formData,
          ...action.formData
        }
      }
    case 'SET_PHOTOS':
      return { ...state, photos: action.photos }
    case 'SET_ITEMS':
      return { ...state, items: action.items }
    case 'ADD_ITEM':
      return { ...state, items: [...state.items, action.item] }
    case 'UPDATE_ITEM':
      return {
        ...state,
        items: state.items.map(item => item.id === action.item.id ? action.item : item)
      }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(item => item.id !== action.id) }
    case 'TOGGLE_PROMOTION':
      // Promotion toggle only updates state - does not trigger validation or saves
      // Validation is handled by publishability check before toggle is enabled
      return { ...state, wantsPromotion: action.value }
    case 'SET_LOADING':
      return { ...state, loading: action.loading }
    case 'SET_ERRORS':
      return { ...state, errors: action.errors }
    case 'SET_SUBMIT_ERROR':
      return { ...state, submitError: action.error }
    default:
      return state
  }
}

export default function SellWizardClient({
  initialData,
  isEdit: _isEdit = false,
  saleId: _saleId,
  userLat,
  userLng,
  promotionsEnabled: promotionsEnabledProp,
  paymentsEnabled: _paymentsEnabledProp,
}: {
  initialData?: Partial<SaleInput>
  isEdit?: boolean
  saleId?: string
  userLat?: number
  userLng?: number
  promotionsEnabled?: boolean
  paymentsEnabled?: boolean
}) {
  // Preserve server-provided prop value - only default if truly undefined (hydration safety)
  // This ensures server-computed value is never overridden by client defaults
  const promotionsEnabled = promotionsEnabledProp ?? false

  // Defensive assertion: log warning if prop is undefined (indicates prop passing issue)
  if (isDebugEnabled && promotionsEnabledProp === undefined) {
    console.warn('[SELL_WIZARD] promotionsEnabled prop is undefined - server prop may not have been passed correctly')
  }

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createSupabaseBrowserClient()
  const [user, setUser] = useState<any>(null)
  
  // Extract resumeParam from searchParams outside useEffect to stabilize dependency array
  const resumeParam = searchParams.get('resume')
  // Normalize tags to ensure it's always an array
  // Also normalize case to match checkbox format (capitalize first letter)
  // Memoize to prevent useEffect from running on every render
  const normalizeTags = useCallback((tags: any): string[] => {
    const categoryList = [
      'Furniture', 'Electronics', 'Clothing', 'Toys',
      'Books', 'Tools', 'Kitchen', 'Sports',
      'Garden', 'Art', 'Collectibles', 'Miscellaneous'
    ]
    
    let tagArray: string[] = []
    if (Array.isArray(tags)) {
      tagArray = tags.filter(Boolean) // Remove any falsy values
    } else if (tags && typeof tags === 'string') {
      tagArray = [tags]
    }
    
    // Normalize tags to match checkbox format (case-insensitive match)
    return tagArray.map(tag => {
      const trimmed = tag.trim()
      // Find matching category from the list (case-insensitive)
      const matched = categoryList.find(cat => cat.toLowerCase() === trimmed.toLowerCase())
      return matched || trimmed // Use matched format, or keep original if no match
    }).filter(Boolean)
  }, [])
  
  // Initialize wizard state from initialData if provided
  const [wizardState, dispatch] = useReducer(wizardReducer, initialWizardState, (initialState) => {
    const initialDateStart = initialData?.date_start || ''
    let initialDateEnd = initialData?.date_end || ''
    let initialTimeEnd = initialData?.time_end || ''
    
    // Backward compatibility: if date_end missing, default to date_start
    if (!initialDateEnd && initialDateStart) {
      initialDateEnd = initialDateStart
      // If time_end also missing, default to time_start
      if (!initialTimeEnd && initialData?.time_start) {
        initialTimeEnd = initialData.time_start
      }
    }
    
    return {
      ...initialState,
      formData: {
        title: initialData?.title || '',
        description: initialData?.description || '',
        address: initialData?.address || '',
        city: initialData?.city || '',
        state: initialData?.state || '',
        zip_code: initialData?.zip_code || '',
        lat: initialData?.lat,
        lng: initialData?.lng,
        date_start: initialDateStart,
        time_start: initialData?.time_start || '09:00',
        date_end: initialDateEnd,
        time_end: initialTimeEnd,
        duration_hours: initialData?.duration_hours || 4, // Keep for backward compat, but not used
        tags: normalizeTags(initialData?.tags),
        pricing_mode: initialData?.pricing_mode || 'negotiable',
        status: initialData?.status || 'draft'
      }
    }
  })
  
  // Extract wizard state for easier access
  const { currentStep, formData, photos, items, wantsPromotion, loading, errors, submitError } = wizardState

  // Compute publishability for current draft state
  // This determines if promotion can be enabled
  const publishability = useMemo(() => {
    const draftRecord: DraftRecord = {
      payload: {
        formData: {
          title: formData.title,
          description: formData.description,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zip_code,
          lat: formData.lat,
          lng: formData.lng,
          date_start: formData.date_start,
          time_start: formData.time_start,
          date_end: formData.date_end,
          time_end: formData.time_end,
          duration_hours: formData.duration_hours,
          tags: formData.tags,
          pricing_mode: formData.pricing_mode,
        },
        photos: photos || [],
        items: (items || []).map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          description: item.description,
          image_url: item.image_url,
          category: item.category,
        })),
        currentStep,
        wantsPromotion,
      }
    }
    return computePublishability(draftRecord)
  }, [formData, photos, items, currentStep, wantsPromotion])
  
  // Compute wizard steps based on promotionsEnabled (promotion step is conditional)
  const WIZARD_STEPS = useMemo(() => getWizardSteps(promotionsEnabled), [promotionsEnabled])
  
  // Helper to map step constant to WIZARD_STEPS index
  const getStepIndex = useCallback((stepConstant: number): number => {
    if (stepConstant === STEPS.DETAILS) return 0
    if (stepConstant === STEPS.PHOTOS) return 1
    if (stepConstant === STEPS.ITEMS) return 2
    if (stepConstant === STEPS.PROMOTION) {
      // Promotion is at index 3 if enabled, otherwise doesn't exist
      return promotionsEnabled ? 3 : -1
    }
    if (stepConstant === STEPS.REVIEW) {
      // Review is at index 3 if promotions disabled, index 4 if enabled
      return promotionsEnabled ? 4 : 3
    }
    return 0
  }, [promotionsEnabled])

  // Non-wizard state (UI state, auth state, etc.)
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false)
  const [createdSaleId, setCreatedSaleId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const hasResumedRef = useRef(false)
  const draftKeyRef = useRef<string | null>(null)
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isPublishingRef = useRef<boolean>(false) // Flag to prevent autosave during/after publish
  const isRestoringDraftRef = useRef<boolean>(false) // Flag to prevent autosave during draft restoration
  const lastServerSaveRef = useRef<number>(0)
  const isNavigatingRef = useRef(false)
  const lastSavedPayloadRef = useRef<string | null>(null) // Track last saved normalized payload (JSON string)

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

  // Check if minimum viable data exists (category + location valid)
  // Drafts are only created once this returns true
  const hasMinimumViableData = useCallback((): boolean => {
    // Category required: at least one tag
    const hasCategory = !!(formData.tags && Array.isArray(formData.tags) && formData.tags.length > 0)
    
    // Location required: address, city, state, lat, lng all present and valid
    const hasAddress = !!(formData.address && typeof formData.address === 'string' && formData.address.trim().length >= 5)
    const hasCity = !!(formData.city && typeof formData.city === 'string' && formData.city.trim().length >= 2)
    const hasState = !!(formData.state && typeof formData.state === 'string' && formData.state.trim().length >= 2)
    const hasLat = typeof formData.lat === 'number' && !isNaN(formData.lat) && formData.lat >= -90 && formData.lat <= 90
    const hasLng = typeof formData.lng === 'number' && !isNaN(formData.lng) && formData.lng >= -180 && formData.lng <= 180
    
    const hasLocation = hasAddress && hasCity && hasState && hasLat && hasLng
    
    return hasCategory && hasLocation
  }, [formData.tags, formData.address, formData.city, formData.state, formData.lat, formData.lng])

  // Helper to build draft payload (defined early so it can be used in useEffects)
  const buildDraftPayload = useCallback((): SaleDraftPayload => {
    return {
      formData: {
        title: formData.title,
        description: formData.description,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        lat: formData.lat,
        lng: formData.lng,
        date_start: formData.date_start,
        time_start: formData.time_start,
        date_end: formData.date_end,
        time_end: formData.time_end,
        duration_hours: formData.duration_hours,
        tags: formData.tags,
        pricing_mode: formData.pricing_mode,
      },
      photos: photos || [],
      items: (items || []).map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        description: item.description,
        image_url: item.image_url,
        category: item.category,
      })),
      currentStep,
      wantsPromotion,
    }
  }, [formData, photos, items, currentStep, wantsPromotion])

  // Normalize draft payload for comparison (trim strings, stable array ordering, canonical values)
  const normalizeDraftPayload = useCallback((payload: SaleDraftPayload): SaleDraftPayload => {
    // Normalize formData strings (trim whitespace)
    const normalizedFormData = {
      ...payload.formData,
      title: payload.formData.title?.trim() || '',
      description: payload.formData.description?.trim() || '',
      address: payload.formData.address?.trim() || '',
      city: payload.formData.city?.trim() || '',
      state: payload.formData.state?.trim() || '',
      zip_code: payload.formData.zip_code?.trim() || '',
      date_start: payload.formData.date_start?.trim() || '',
      time_start: payload.formData.time_start?.trim() || '',
      date_end: payload.formData.date_end?.trim() || '',
      time_end: payload.formData.time_end?.trim() || '',
      // Tags: sort for stable ordering, trim each tag
      tags: (payload.formData.tags || [])
        .map(tag => tag?.trim())
        .filter(Boolean)
        .sort(), // Stable ordering
      pricing_mode: payload.formData.pricing_mode || 'negotiable',
    }

    // Photos: stable ordering (sort by URL)
    const normalizedPhotos = [...(payload.photos || [])]
      .filter(Boolean)
      .sort() // Stable ordering

    // Items: stable ordering (sort by id), normalize item fields
    const normalizedItems = [...(payload.items || [])]
      .map(item => ({
        id: item.id || '',
        name: (item.name || '').trim(),
        price: item.price,
        description: (item.description || '').trim(),
        image_url: (item.image_url || '').trim(),
        category: item.category,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)) // Stable ordering by id

    return {
      formData: normalizedFormData,
      photos: normalizedPhotos,
      items: normalizedItems,
      currentStep: payload.currentStep,
      wantsPromotion: payload.wantsPromotion || false,
    }
  }, [])

  // Check if current step is valid (no validation errors)
  const isCurrentStepValid = useCallback((): boolean => {
    // If there are any errors, step is invalid
    if (errors && Object.keys(errors).length > 0) {
      return false
    }

    // Validate based on current step
    if (currentStep === STEPS.DETAILS) {
      // Details step: validate location and details
      const locationResult = validateLocationStep({
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        lat: formData.lat,
        lng: formData.lng,
      })
      const detailsResult = validateDetailsStep({
        title: formData.title,
        description: formData.description,
        date_start: formData.date_start,
        time_start: formData.time_start || '09:00',
        date_end: formData.date_end,
        time_end: formData.time_end,
        pricing_mode: formData.pricing_mode,
        tags: formData.tags,
      })
      return locationResult.isValid && detailsResult.isValid
    } else if (currentStep === STEPS.ITEMS) {
      // Items step: validate items
      const itemsResult = validateItemsStep({ items })
      return itemsResult.isValid
    }

    // Other steps (PHOTOS, PROMOTION, REVIEW) are always valid (no validation required)
    return true
  }, [currentStep, formData, items, errors])

  // Check if payload has meaningfully changed (normalized comparison)
  // Promotion toggle does not trigger saves - only changes to form data, photos, or items do
  const hasMeaningfulChange = useCallback((payload: SaleDraftPayload): boolean => {
    // If no last saved payload, this is a meaningful change
    if (!lastSavedPayloadRef.current) {
      return true
    }

    // Normalize both payloads
    const normalizedCurrent = normalizeDraftPayload(payload)
    const normalizedLast = JSON.parse(lastSavedPayloadRef.current)

    // Compare normalized payloads, but exclude wantsPromotion from comparison
    // This ensures promotion toggle does not trigger saves
    const currentWithoutPromotion = { ...normalizedCurrent, wantsPromotion: undefined }
    const lastWithoutPromotion = { ...normalizedLast, wantsPromotion: undefined }

    // Only return true if there's a change other than wantsPromotion
    return JSON.stringify(currentWithoutPromotion) !== JSON.stringify(lastWithoutPromotion)
  }, [normalizeDraftPayload])

  // Check authentication status
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (isDebugEnabled) {
        console.log('[SELL_WIZARD] Auth check:', { hasUser: !!user, userId: user?.id })
      }
      setUser(user)
    }
    checkUser()

    // Listen for auth state changes (e.g., after login)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (isDebugEnabled) {
        console.log('[SELL_WIZARD] Auth state change:', { event, hasUser: !!session?.user, userId: session?.user?.id })
      }
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  // Save local draft to server when user signs in mid-wizard
  // Only if minimum viable data exists
  useEffect(() => {
    if (user && draftKeyRef.current && hasLocalDraft() && hasMinimumViableData()) {
      const payload = buildDraftPayload()
      saveDraftServer(payload, draftKeyRef.current).catch(() => {
        // Silent fail - already saved locally
      })
    }
  }, [user, buildDraftPayload, hasMinimumViableData])

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

  // Initialize draft key only when minimum viable data exists
  // This prevents creating empty drafts
  useEffect(() => {
    // Don't create draft key if minimum viable data doesn't exist
    if (!hasMinimumViableData()) {
      // Clear any existing draft key if data becomes invalid
      if (draftKeyRef.current) {
        draftKeyRef.current = null
        // Also clear from localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('draft:sale:key')
        }
      }
      return
    }
    
    // Only create draft key when minimum viable data exists
    if (!draftKeyRef.current) {
      draftKeyRef.current = getDraftKey()
    }
  }, [hasMinimumViableData])

  // Debounced autosave (local + server)
  // Only saves when:
  // 1. Minimum viable data exists (category + location valid)
  // 2. Current step is valid (no validation errors)
  // 3. Normalized payload differs from last saved payload (meaningful change)
  useEffect(() => {
    // Don't autosave if we're publishing or have already published
    if (isPublishingRef.current) {
      return
    }
    
    // Don't autosave if we're currently restoring a draft (prevents creating new version on open)
    if (isRestoringDraftRef.current) {
      return
    }
    
    // CRITICAL: Only autosave when minimum viable data exists
    // This prevents creating empty drafts
    if (!hasMinimumViableData()) {
      // Clear save status if data becomes invalid
      if (saveStatus !== 'idle') {
        setSaveStatus('idle')
      }
      return
    }

    // CRITICAL: Only autosave when current step is valid
    // This prevents saving invalid states
    if (!isCurrentStepValid()) {
      // Don't save invalid states
      return
    }
    
    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current)
    }

    // Set new timeout for debounced save (1.5s)
    // This prevents saving during typing
    autosaveTimeoutRef.current = setTimeout(() => {
      // Double-check we're not publishing before saving
      if (isPublishingRef.current) {
        return
      }
      
      // Double-check minimum viable data still exists
      if (!hasMinimumViableData()) {
        return
      }

      // Double-check current step is still valid
      if (!isCurrentStepValid()) {
        return
      }
      
      const payload = buildDraftPayload()
      
      // CRITICAL: Only save if payload has meaningfully changed (normalized comparison)
      // This prevents unnecessary saves when values haven't actually changed
      if (!hasMeaningfulChange(payload)) {
        // No meaningful change, skip save
        return
      }
      
      // Only save locally if draft key exists (created when minimum viable data exists)
      if (draftKeyRef.current) {
        saveLocalDraft(payload)
        // Update last saved payload reference (store normalized version)
        const normalized = normalizeDraftPayload(payload)
        lastSavedPayloadRef.current = JSON.stringify(normalized)
        setSaveStatus('saved')
      }

      // Save to server if authenticated and draft key exists (throttle to max 1x per 10s)
      if (user && draftKeyRef.current && !isPublishingRef.current) {
        const now = Date.now()
        const timeSinceLastSave = now - lastServerSaveRef.current
        
        if (timeSinceLastSave >= 10000) {
          setSaveStatus('saving')
          saveDraftServer(payload, draftKeyRef.current)
            .then((result) => {
              // Check again before updating state
              if (isPublishingRef.current) {
                return
              }
              if (result.ok) {
                lastServerSaveRef.current = Date.now()
                setSaveStatus('saved')
              } else {
                setSaveStatus('error')
                // Don't show error toast for autosave failures - just log
                if (isDebugEnabled) {
                  console.warn('[SELL_WIZARD] Autosave to server failed:', result.error)
                }
              }
            })
            .catch((error) => {
              if (isPublishingRef.current) {
                return
              }
              setSaveStatus('error')
              console.error('[SELL_WIZARD] Autosave error:', error)
            })
        }
      }
    }, 1500)

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current)
      }
    }
  }, [formData, photos, items, currentStep, user, buildDraftPayload, hasMinimumViableData, isCurrentStepValid, hasMeaningfulChange, normalizeDraftPayload, saveStatus])

  // Save on beforeunload (only if minimum viable data exists and meaningful change)
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Only save if minimum viable data exists and draft key exists
      if (!hasMinimumViableData() || !draftKeyRef.current) {
        return
      }
      
      const payload = buildDraftPayload()
      
      // Only save if payload has meaningfully changed
      if (!hasMeaningfulChange(payload)) {
        return
      }
      
      saveLocalDraft(payload)
      if (user && draftKeyRef.current) {
        // Fire and forget - don't wait for response
        saveDraftServer(payload, draftKeyRef.current).catch(() => {})
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [buildDraftPayload, user, hasMinimumViableData, hasMeaningfulChange])


  // Ensure tags are properly set when initialData is provided (edit mode)
  // This runs on mount and whenever initialData.tags changes
  // Only run when initialData actually changes, not on every render
  useEffect(() => {
    // Only update tags from initialData if we're in edit mode or if formData.tags is empty
    // This prevents overwriting user selections during sale creation
    if (!_isEdit && formData.tags && formData.tags.length > 0) {
      // User has already selected tags, don't overwrite
      return
    }
    
    // Only process if initialData has tags
    if (!initialData?.tags) {
      return
    }
    
    const tagsFromInitialData = initialData.tags
    const normalized = normalizeTags(tagsFromInitialData)
      if (isDebugEnabled) {
        console.log('[SELL_WIZARD] Tags useEffect:', {
        initialDataTags: tagsFromInitialData,
        normalized,
        currentFormDataTags: formData.tags,
        isEdit: _isEdit
      })
    }
    // Only update tags from initialData if provided (for edit mode)
    // Only update if tags are different to avoid unnecessary re-renders
    const currentTags = formData.tags || []
    const currentSorted = [...currentTags].sort()
    const normalizedSorted = [...normalized].sort()
    if (JSON.stringify(currentSorted) !== JSON.stringify(normalizedSorted)) {
      if (isDebugEnabled) {
        console.log('[SELL_WIZARD] Updating formData.tags:', normalized)
      }
      dispatch({ type: 'SET_FORM_DATA', formData: { ...formData, tags: normalized } })
    }
  }, [initialData?.tags, _isEdit, normalizeTags]) // normalizeTags is now memoized, so it's stable

  // Resume draft on mount (priority: server > local)
  useEffect(() => {
    if (initialData || hasResumedRef.current) return
    
    // Don't run if user is not yet loaded (wait for auth to complete)
    // This ensures we can fetch server drafts when user becomes available
    if (user === undefined) return

    // Set flag synchronously to prevent multiple concurrent runs (fixes React error #418/#422)
    // This prevents the effect from running again if user state changes before async completes
    hasResumedRef.current = true

    const resumeDraft = async () => {
      const resume = resumeParam
      const isPromotionResume = resume === 'promotion'
      const isReviewResume = resume === 'review'
      
      let draftToRestore: SaleDraftPayload | null = null
      let source: 'server' | 'local' | null = null
      let restoredDraftKey: string | null = null

      // Priority 1: If authenticated, try server draft
      if (user) {
        // Check if a specific draft_key was provided in sessionStorage (from dashboard "Continue" button)
        const specificDraftKey = typeof window !== 'undefined' ? sessionStorage.getItem('draft:key') : null
        
        if (specificDraftKey) {
          // Load the specific draft by key
          const serverResult = await getDraftByKeyServer(specificDraftKey)
          if (serverResult.ok && serverResult.data?.payload) {
            draftToRestore = serverResult.data.payload
            restoredDraftKey = serverResult.data.draft_key
            source = 'server'
            if (isDebugEnabled) {
              console.log('[SELL_WIZARD] Found specific server draft by key:', specificDraftKey)
            }
            // Clear the sessionStorage key after using it
            sessionStorage.removeItem('draft:key')
          }
        }
        
        // If no specific draft was found, try latest draft
        if (!draftToRestore) {
          const serverResult = await getLatestDraftServer()
          if (serverResult.ok && serverResult.data?.payload) {
            draftToRestore = serverResult.data.payload
            source = 'server'
            if (isDebugEnabled) {
              console.log('[SELL_WIZARD] Found latest server draft')
            }
          }
        }
      }

      // Priority 2: If no server draft, try local draft
      if (!draftToRestore) {
        const localDraft = loadLocalDraft()
        if (localDraft) {
          draftToRestore = localDraft
          source = 'local'
          if (isDebugEnabled) {
            console.log('[SELL_WIZARD] Found local draft')
          }
        }
      }

      // Priority 3: Backward compatibility - check old localStorage format
      if (!draftToRestore) {
        const oldDraft = localStorage.getItem('sale_draft')
        if (oldDraft) {
          try {
            const parsed = JSON.parse(oldDraft)
            if (parsed && typeof parsed === 'object') {
              // Convert old format to new format
              draftToRestore = {
                formData: parsed.formData || {},
                photos: parsed.photos || [],
                items: (parsed.items || []).map((item: any) => ({
                  id: item.id || `item-${Date.now()}-${Math.random()}`,
                  name: item.name || '',
                  price: item.price,
                  description: item.description,
                  image_url: item.image_url,
                  category: item.category,
                })),
                currentStep: parsed.currentStep || 0,
                wantsPromotion: parsed.wantsPromotion || false,
              }
              source = 'local'
              if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                console.log('[SELL_WIZARD] Found old format draft')
              }
            }
          } catch (error) {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.error('[SELL_WIZARD] Error parsing old draft:', error)
            }
          }
        }
      }

        // Restore draft if found
        if (draftToRestore) {
          // hasResumedRef.current already set synchronously above to prevent concurrent runs
          isRestoringDraftRef.current = true // Prevent autosave during restoration
          
          // Set draftKeyRef to the restored draft's key (critical: prevents creating new draft on autosave)
          if (restoredDraftKey) {
            draftKeyRef.current = restoredDraftKey
            // Also update localStorage to persist the draft key
            if (typeof window !== 'undefined') {
              localStorage.setItem('draft:key', restoredDraftKey)
            }
          } else if (source === 'server' && typeof window !== 'undefined') {
            // If we got a server draft but no explicit key, try to get it from localStorage
            const storedKey = localStorage.getItem('draft:key')
            if (storedKey) {
              draftKeyRef.current = storedKey
            }
          }
          
          // ATOMIC RESUME STATE UPDATE: Apply all state changes in a single batch
          // This prevents React errors #418/#422 by ensuring all updates happen in one render pass
          // Critical state (formData, photos, items, wantsPromotion, currentStep) is applied synchronously
          // Non-critical state (toast messages) is wrapped in startTransition
          
          // Prepare all state updates
          const nextForm = draftToRestore.formData ? (() => {
            const form = { ...draftToRestore.formData }
            if (form.time_start) {
              form.time_start = normalizeTimeToNearest30(form.time_start) || form.time_start
            }
            if (form.time_end) {
              form.time_end = normalizeTimeToNearest30(form.time_end) || form.time_end
            }
            
            // Handle backward compatibility: migrate duration_hours to date_end if needed
            if (!form.date_end || form.date_end === '') {
              if (form.date_start) {
                // If duration_hours exists, calculate end date once (migration)
                if (form.duration_hours && form.time_start) {
                  const startDateTime = new Date(`${form.date_start}T${form.time_start}`)
                  const durationHours = Math.min(form.duration_hours, 8) // Cap at 8 hours for migration
                  const endDateTime = new Date(startDateTime.getTime() + durationHours * 60 * 60 * 1000)
                  form.date_end = endDateTime.toISOString().split('T')[0]
                  form.time_end = endDateTime.toTimeString().split(' ')[0].substring(0, 5)
                } else {
                  // Default to start date
                  form.date_end = form.date_start
                  if (!form.time_end && form.time_start) {
                    // Default end time to start time if not set
                    form.time_end = form.time_start
                  }
                }
              }
            } else if (!form.time_end && form.time_start) {
              // If date_end exists but time_end doesn't, default to start time
              form.time_end = form.time_start
            }
            
            return form as Partial<SaleInput>
          })() : undefined

          const nextPhotos = draftToRestore.photos || undefined

          const nextItems = draftToRestore.items ? draftToRestore.items.map(item => ({
            id: item.id || `item-${Date.now()}-${Math.random()}`,
            name: item.name,
            price: item.price,
            description: item.description,
            image_url: item.image_url,
            category: item.category,
          })) : undefined

          const nextWantsPromotion = draftToRestore.wantsPromotion !== undefined ? draftToRestore.wantsPromotion : undefined

          // Determine target step: resume param takes precedence, then draft's saved step
          const nextStep = isPromotionResume
            ? STEPS.PROMOTION
            : isReviewResume
            ? STEPS.REVIEW
            : (draftToRestore.currentStep !== undefined ? draftToRestore.currentStep : undefined)

          const nextToastMessage = isPromotionResume
            ? 'Draft restored. Ready to promote your sale.'
            : isReviewResume
            ? 'Draft restored. Ready to review your sale.'
            : (draftToRestore.currentStep !== undefined ? `Draft restored${source === 'server' ? ' from cloud' : ''}` : undefined)

          // ATOMIC RESUME: Dispatch single RESUME_DRAFT action to set all wizard state atomically
          // This prevents React errors #418/#422 by ensuring all updates happen in one reducer call
          dispatch({
            type: 'RESUME_DRAFT',
            payload: {
              ...(nextForm && { formData: nextForm }),
              ...(nextPhotos !== undefined && { photos: nextPhotos }),
              ...(nextItems !== undefined && { items: nextItems }),
              ...(nextWantsPromotion !== undefined && { wantsPromotion: nextWantsPromotion }),
              ...(nextStep !== undefined && { currentStep: nextStep }),
            }
          })

          // Update last saved payload reference to prevent immediate autosave after resume
          // This ensures we don't save the same draft immediately after restoring it
          const restoredPayload: SaleDraftPayload = {
            formData: nextForm || {},
            photos: nextPhotos || [],
            items: nextItems || [],
            currentStep: nextStep !== undefined ? nextStep : 0,
            wantsPromotion: nextWantsPromotion || false,
          }
          const normalizedRestored = normalizeDraftPayload(restoredPayload)
          lastSavedPayloadRef.current = JSON.stringify(normalizedRestored)

          // Apply non-critical toast updates in a transition to avoid blocking render
          if (nextToastMessage) {
            startTransition(() => {
              setToastMessage(nextToastMessage)
              setShowToast(true)
            })
          }

          // If user is authenticated and we restored local draft, save to server
          if (user && source === 'local' && draftKeyRef.current) {
            saveDraftServer(draftToRestore, draftKeyRef.current).catch(() => {
              // Silent fail - already saved locally
            })
          }
          
          // Clear restoration flag after autosave debounce period (2s to be safe)
          // This allows state to settle before autosave can trigger
          setTimeout(() => {
            isRestoringDraftRef.current = false
          }, 2000)
        } else if (isPromotionResume) {
          // Draft not found but resume=promotion - still go to Promotion step
          dispatch({ type: 'SET_STEP', step: STEPS.PROMOTION })
          setToastMessage('Draft not found; please promote your sale.')
          setShowToast(true)
        } else if (isReviewResume) {
          // Draft not found but resume=review - still go to Review step
          dispatch({ type: 'SET_STEP', step: STEPS.REVIEW })
          setToastMessage('Draft not found; please review details.')
          setShowToast(true)
        }

      // Clear sessionStorage keys after resume
      if (isPromotionResume || isReviewResume) {
        sessionStorage.removeItem('auth:postLoginRedirect')
        sessionStorage.removeItem('draft:returnStep')
      }
    }

    resumeDraft()
  }, [initialData, user, normalizeTimeToNearest30, resumeParam])

  const handleInputChange = (field: keyof SaleInput, value: any) => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SELL_WIZARD] handleInputChange called:', { field, value, currentFormData: formData })
    }
    
    // For address field, use UPDATE_FORM to update only the address field
    // This is for manual typing - autocomplete uses ADDRESS_SELECTED instead
    if (field === 'address') {
      dispatch({ 
        type: 'UPDATE_FORM', 
        field, 
        value
      })
      return
    }
    
    // Calculate updated formData for other fields
    const updated = { ...formData, [field]: value }

    // Snap start time to 30-minute increments (nearest 00/30 with carry)
    if (field === 'time_start' && typeof value === 'string' && value.includes(':')) {
      updated.time_start = normalizeTimeToNearest30(value)
    }

    // Snap end time to 30-minute increments (nearest 00/30 with carry)
    if (field === 'time_end' && typeof value === 'string' && value.includes(':')) {
      updated.time_end = normalizeTimeToNearest30(value)
    }
    
    // Handle start date changes: update end date appropriately
    if (field === 'date_start') {
      const newDateStart = value
      const currentDateEnd = updated.date_end || formData.date_end
      const previousDateStart = formData.date_start
      
      if (newDateStart) {
        // If no end date exists → set end date = start date
        if (!currentDateEnd || currentDateEnd === '') {
          updated.date_end = newDateStart
        }
        // If end date equals previous start date → move it to new start date
        else if (currentDateEnd === previousDateStart) {
          updated.date_end = newDateStart
        }
        // If end date is after previous start date → preserve it, clamp if necessary
        else if (currentDateEnd && previousDateStart) {
          const endDate = new Date(currentDateEnd)
          const startDate = new Date(newDateStart)
          const maxEndDate = new Date(startDate)
          maxEndDate.setDate(maxEndDate.getDate() + 2)
          
          // Clamp to allowed range if necessary
          if (endDate < startDate) {
            updated.date_end = newDateStart
          } else if (endDate > maxEndDate) {
            updated.date_end = maxEndDate.toISOString().split('T')[0]
          }
          // Otherwise preserve the end date
        }
      }
    }
    
    // Validate end date range when end date changes
    if (field === 'date_end') {
      const newDateEnd = value
      const dateStart = updated.date_start || formData.date_start
      
      if (newDateEnd && dateStart) {
        const endDate = new Date(newDateEnd)
        const startDate = new Date(dateStart)
        const maxEndDate = new Date(startDate)
        maxEndDate.setDate(maxEndDate.getDate() + 2)
        
        // Clamp to allowed range
        if (endDate < startDate) {
          updated.date_end = dateStart
        } else if (endDate > maxEndDate) {
          updated.date_end = maxEndDate.toISOString().split('T')[0]
        }
      }
    }
    
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SELL_WIZARD] FormData updated:', { field, value, updated })
    }
    
    // Dispatch single update with all calculated fields
    dispatch({ type: 'SET_FORM_DATA', formData: updated })
  }

  // Handler for autocomplete place selection - updates all address fields atomically
  // This is the authoritative source for address fields - no onChange is called after this
  const handlePlaceSelected = (place: { address?: string; city?: string; state?: string; zip?: string; lat?: number; lng?: number }) => {
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[SELL_WIZARD] handlePlaceSelected called:', { place })
    }
    
    dispatch({
      type: 'ADDRESS_SELECTED',
      fields: {
        address: place.address || '',
        city: place.city || '',
        state: place.state || '',
        zip_code: place.zip || '',
        lat: place.lat,
        lng: place.lng,
      }
    })
  }

  const handlePrevious = useCallback(() => {
    // Skip promotion step if disabled when going back from review
    let prevStep = currentStep - 1
    
    // If going back from REVIEW and promotions disabled, skip PROMOTION
    if (currentStep === STEPS.REVIEW && prevStep === STEPS.PROMOTION && !promotionsEnabled) {
      prevStep = STEPS.ITEMS
    }
    
    // If going back from PROMOTION, go to ITEMS
    if (currentStep === STEPS.PROMOTION) {
      prevStep = STEPS.ITEMS
    }
    
    if (prevStep >= STEPS.DETAILS) {
      dispatch({ type: 'SET_STEP', step: prevStep })
    }
  }, [currentStep, promotionsEnabled])

  const handleNext = async () => {
    // Guard against duplicate clicks
    if (isNavigatingRef.current) return
    isNavigatingRef.current = true

    try {
      // Validate current step before advancing
      let stepErrors: Record<string, string> = {}

      if (currentStep === STEPS.DETAILS) {
        // Ensure time_start has default value before validation
        // If missing, set default and use it for validation
        let timeStartForValidation = formData.time_start
        if (!timeStartForValidation || !timeStartForValidation.includes(':')) {
          timeStartForValidation = '09:00'
          // Update formData with default time (side effect, but needed for consistency)
          dispatch({ type: 'UPDATE_FORM', field: 'time_start', value: timeStartForValidation })
        }
        
        // Details step contains both location and details fields
        // Validate both before allowing advance
        const locationResult = validateLocationStep({
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip_code: formData.zip_code,
          lat: formData.lat,
          lng: formData.lng,
        })
        
        const detailsResult = validateDetailsStep({
          title: formData.title,
          description: formData.description,
          date_start: formData.date_start,
          time_start: timeStartForValidation,
          date_end: formData.date_end,
          time_end: formData.time_end,
          pricing_mode: formData.pricing_mode,
          tags: formData.tags,
        })
        
        // Merge errors from both validators
        stepErrors = { ...locationResult.errors, ...detailsResult.errors }
        
        // If validation fails, set errors and prevent advance
        if (!locationResult.isValid || !detailsResult.isValid) {
          dispatch({ type: 'SET_ERRORS', errors: stepErrors })
          isNavigatingRef.current = false
          return
        }
      } else if (currentStep === STEPS.ITEMS) {
        // Validate items step before advancing
        const itemsResult = validateItemsStep({ items })
        
        if (!itemsResult.isValid) {
          stepErrors = itemsResult.errors
          dispatch({ type: 'SET_ERRORS', errors: stepErrors })
          isNavigatingRef.current = false
          return
        }
      }
      
      // Clear errors if validation passed
      if (Object.keys(stepErrors).length === 0) {
        dispatch({ type: 'SET_ERRORS', errors: {} })
      }

      // Build and save draft before advancing (only if minimum viable data exists)
      // This ensures drafts are only created when category + location are valid
      if (hasMinimumViableData()) {
        const payload = buildDraftPayload()
        
        // Save to localStorage first (await to ensure it's written)
        // Only save if draft key exists (created when minimum viable data exists)
        if (draftKeyRef.current) {
          try {
            saveLocalDraft(payload)
          } catch (error) {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.error('[SELL_WIZARD] Error saving local draft:', error)
            }
            // Continue anyway - don't block navigation
          }
        }
      }

      // Auth gate: Items (2) → Promotion (3) or Review (4)
      // Check auth state synchronously to ensure we have the latest value
      if (currentStep === STEPS.ITEMS) {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SELL_WIZARD] Auth gate check:', { currentStep, hasUser: !!currentUser, userId: currentUser?.id })
        }
        
        if (!currentUser) {
          // Determine resume target: promotion if enabled, otherwise review
          const resumeTarget = promotionsEnabled ? 'promotion' : 'review'
          const resumeUrl = `/sell/new?resume=${resumeTarget}`
          
          // Set redirect keys
          sessionStorage.setItem('auth:postLoginRedirect', resumeUrl)
          sessionStorage.setItem('draft:returnStep', resumeTarget)
          
          // Update user state
          setUser(null)
          
          // Redirect to login (encode redirectTo to preserve query params)
          const redirectUrl = encodeURIComponent(resumeUrl)
          router.push(`/auth/signin?redirectTo=${redirectUrl}`)
          isNavigatingRef.current = false
          return // Don't advance step
        } else {
          // Update user state if it was null
          if (!user) {
            setUser(currentUser)
          }
        }
      }

      // Fire-and-forget server save (throttled, non-blocking)
      // Only save if minimum viable data exists
      if (hasMinimumViableData()) {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        if (currentUser && draftKeyRef.current) {
          const payload = buildDraftPayload()
          const now = Date.now()
          if (now - lastServerSaveRef.current > 10000) {
            lastServerSaveRef.current = now
            saveDraftServer(payload, draftKeyRef.current).catch(() => {
              // Silent fail - already saved locally
            })
          }
        }
      }

      // Normal navigation - skip promotion step if disabled
      let nextStep = currentStep + 1
      
      // If moving from ITEMS to PROMOTION but promotions are disabled, skip to REVIEW
      if (currentStep === STEPS.ITEMS && nextStep === STEPS.PROMOTION && !promotionsEnabled) {
        nextStep = STEPS.REVIEW
      }
      
      // If moving from PROMOTION, always go to REVIEW
      if (currentStep === STEPS.PROMOTION) {
        nextStep = STEPS.REVIEW
      }
      
      // Only advance if there's a valid next step
      if (nextStep <= STEPS.REVIEW) {
        dispatch({ type: 'SET_STEP', step: nextStep })
      }
    } finally {
      // Reset navigation guard after a short delay
      setTimeout(() => {
        isNavigatingRef.current = false
      }, 500)
    }
  }

  // Helper to build sale payload (for direct publish without draft)
  const buildSalePayload = useCallback(() => {
    // Ensure time_start is normalized
    let normalizedTimeStart = formData.time_start
    if (normalizedTimeStart) {
      normalizedTimeStart = normalizeTimeToNearest30(normalizedTimeStart) || normalizedTimeStart
    }

    // Prepare sale data with cover image
    const { duration_hours: _duration_hours, ...restFormData } = formData
    const saleData = {
      ...restFormData,
      time_start: normalizedTimeStart,
      cover_image_url: photos.length > 0 ? photos[0] : undefined,
      images: photos.length > 1 ? photos.slice(1) : undefined,
      status: 'published' as const
    }

    return {
      saleData,
      items: items.map(item => ({
        name: item.name,
        price: item.price,
        description: item.description,
        category: item.category,
        image_url: item.image_url
      }))
    }
  }, [formData, photos, items, normalizeTimeToNearest30])

  // Helper to create items for a sale
  const createItemsForSale = useCallback(async (saleId: string, itemsToCreate: Array<{ name: string; price?: number; description?: string; category?: CategoryValue; image_url?: string }>) => {
    if (itemsToCreate.length === 0) return

    const itemPromises = itemsToCreate.map(async (item, index) => {
      try {
        const response = await fetch('/api/items_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getCsrfHeaders(),
          },
          credentials: 'include',
          body: JSON.stringify({
            sale_id: saleId,
            title: item.name,
            description: item.description,
            price: item.price,
            category: item.category,
            image_url: item.image_url
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error || `Failed to create item (${response.status})`
          console.error('[SELL_WIZARD] Item creation HTTP error:', {
            itemIndex: index,
            itemName: item.name,
            status: response.status,
            error: errorData,
          })
          throw new Error(`${item.name}: ${errorMessage}`)
        }

        const result = await response.json()
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SELL_WIZARD] Item created successfully:', {
            itemId: result.item?.id,
            itemName: item.name,
          })
        }
        return result
      } catch (error) {
        console.error('[SELL_WIZARD] Item creation failed:', {
          itemIndex: index,
          itemName: item.name,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })

    // Wait for all items to be created, throw if any fail
    try {
      await Promise.all(itemPromises)
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[SELL_WIZARD] All items created successfully:', {
          total: itemsToCreate.length,
          saleId,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create items'
      console.error('[SELL_WIZARD] Item creation failed:', errorMessage)
      throw new Error(`Failed to create some items: ${errorMessage}`)
    }
  }, [])

  // Helper to map error codes/messages to user-facing messages
  const toUserFacingSubmitError = useCallback(({ error, code, details }: { error?: string; code?: string; details?: string }): string => {
    if (code === 'account_locked' || error === 'account_locked') {
      return 'This account has been locked. Please contact support if you believe this is an error.'
    }
    if (error === 'rate_limited' || code === 'RATE_LIMITED') {
      return 'Too many attempts. Please wait a moment and try again.'
    }
    if (code === 'PERMISSION_DENIED') {
      return 'We couldn\'t publish this sale due to a permission issue. Please refresh and try again.'
    }
    return error || details || 'An unexpected error occurred. Please try again.'
  }, [])

  // Helper to submit sale payload (used by both handleSubmit and auto-resume)
  const submitSalePayload = useCallback(async (payload: { saleData: any; items: any[] }) => {
    dispatch({ type: 'SET_LOADING', loading: true })
    dispatch({ type: 'SET_SUBMIT_ERROR', error: null })

    try {
      const response = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify(payload.saleData),
      })

      const result = await response.json()

      if (response.status === 401) {
        // Save draft to sessionStorage
        sessionStorage.setItem('draft:sale:new', JSON.stringify(payload))
        sessionStorage.setItem('auth:postLoginRedirect', '/sell/new?resume=review')
        sessionStorage.setItem('draft:returnStep', 'review')
        
        // Redirect to login (encode redirectTo to preserve query params)
        const redirectUrl = encodeURIComponent('/sell/new?resume=review')
        router.push(`/auth/signin?redirectTo=${redirectUrl}`)
        dispatch({ type: 'SET_LOADING', loading: false })
        return
      }

      if (!response.ok) {
        const errorData = result || { error: 'Failed to create sale' }
        
        // Debug-only structured logging
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          const { logger } = await import('@/lib/log')
          logger.error('Sale creation failed', new Error('Sale creation failed'), {
            component: 'sellWizard',
            operation: 'submitSalePayload',
            status: response.status,
            statusText: response.statusText,
            code: errorData.code,
            error: errorData.error,
            hasDetails: !!errorData.details,
            path: typeof window !== 'undefined' ? window.location.pathname : undefined,
          })
        }
        
        const errorMessage = toUserFacingSubmitError({
          error: errorData.error,
          code: errorData.code,
          details: errorData.details
        }) || `Failed to create sale (${response.status})`
        dispatch({ type: 'SET_SUBMIT_ERROR', error: errorMessage })
        dispatch({ type: 'SET_LOADING', loading: false })
        return
      }

      // API returns { ok: true, sale: {...} } or { sale: {...} }
      const sale = result.sale || result
      if (!sale || !sale.id) {
        console.error('Invalid sale response:', result)
        dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Invalid response from server' })
        dispatch({ type: 'SET_LOADING', loading: false })
        return
      }
      const saleId = sale.id

      // Create items for the sale
      if (payload.items && payload.items.length > 0) {
        try {
          await createItemsForSale(saleId, payload.items)
          // Delay to ensure database view and RLS policies are updated before redirect
          // This helps prevent race conditions where the sale detail page loads before items are visible
          // Increased delay to account for view refresh and RLS policy evaluation timing
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (error) {
          // If items fail to create, show error but still allow user to view the sale
          // The sale was created successfully, so we don't want to fail the entire operation
          const errorMessage = error instanceof Error ? error.message : 'Failed to create some items'
          console.error('[SELL_WIZARD] Item creation error (sale was created):', errorMessage)
          dispatch({ type: 'SET_SUBMIT_ERROR', error: `Sale created successfully, but some items failed to save: ${errorMessage}. You can add items later from the sale detail page.` })
          // Still show the confirmation modal so user can view the sale
        }
      }

      // Clear draft keys and sessionStorage
      clearLocalDraft()
      sessionStorage.removeItem('auth:postLoginRedirect')
      sessionStorage.removeItem('draft:returnStep')
      
      // Delete server-side draft if it exists
      if (draftKeyRef.current && user) {
        await deleteDraftServer(draftKeyRef.current).catch((error) => {
          // Log error but don't fail the sale creation
          console.warn('[SELL_WIZARD] Failed to delete server draft:', error)
        })
      }
      
      // Clear draft key ref - a new one will be generated when needed
      // clearLocalDraft() already removed the key from localStorage,
      // so getDraftKey() will generate a new one on next access
      draftKeyRef.current = null

      // Dispatch sales:mutated event with sale location so SalesClient can refetch if needed
      if (typeof window !== 'undefined' && sale.lat && sale.lng) {
        window.dispatchEvent(new CustomEvent('sales:mutated', {
          detail: {
            type: 'create',
            id: saleId,
            lat: sale.lat,
            lng: sale.lng
          }
        }))
      }

      // Show confirmation modal
      setCreatedSaleId(saleId)
      setConfirmationModalOpen(true)
    } catch (error) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.error('Error creating sale:', error)
      }
      dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Something went wrong while creating your sale. Please try again.' })
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false })
    }
  }, [router, createItemsForSale, toUserFacingSubmitError])

  // Auto-resume after login (resume=1 param)
  // If user returns after login and has a draft, auto-publish it
  useEffect(() => {
    const resume = searchParams.get('resume')
    if (resume === '1' && user && !hasResumedRef.current && draftKeyRef.current && hasLocalDraft()) {
      hasResumedRef.current = true
      
      // Validate before auto-publishing
      const locationValidation = validateLocationStep({
        address: formData.address,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code,
        lat: formData.lat,
        lng: formData.lng,
      })
      const detailsValidation = validateDetailsStep({
        title: formData.title,
        description: formData.description,
        date_start: formData.date_start,
        time_start: formData.time_start,
        date_end: formData.date_end,
        time_end: formData.time_end,
        pricing_mode: formData.pricing_mode,
        tags: formData.tags,
      })
      if (!locationValidation.isValid || !detailsValidation.isValid) {
        // Don't auto-publish if validation fails - let user fix it
        setToastMessage('Please complete all required fields before publishing')
        setShowToast(true)
        hasResumedRef.current = false
        return
      }

      // Auto-publish the draft
      dispatch({ type: 'SET_LOADING', loading: true })
      
      // Store draft key in local variable (TypeScript type narrowing)
      const draftKeyToPublish = draftKeyRef.current
      if (!draftKeyToPublish) {
        dispatch({ type: 'SET_LOADING', loading: false })
        return
      }
      
      // CRITICAL: Save current draft payload (including wantsPromotion) before publishing
      const currentPayload = buildDraftPayload()
      saveDraftServer(currentPayload, draftKeyToPublish)
        .then(() => {
          // After save completes, publish the draft
          return publishDraftServer(draftKeyToPublish)
        })
        .catch((error) => {
          // If save fails, log warning but continue with publish anyway
          console.warn('[SELL_WIZARD] Failed to save draft to server before auto-publish:', error)
          // Continue with publish - might already exist on server
          return publishDraftServer(draftKeyToPublish)
        })
        .then((result) => {
          if (result.ok && result.data && 'saleId' in result.data) {
            clearLocalDraft()
            const saleData = result.data as { saleId: string }
            setCreatedSaleId(saleData.saleId)
            setConfirmationModalOpen(true)
          } else {
            setToastMessage(result.error || 'Failed to publish sale. Please try again.')
            setShowToast(true)
            hasResumedRef.current = false // Allow retry
          }
        })
        .catch((error) => {
          console.error('[SELL_WIZARD] Error auto-publishing draft:', error)
          setToastMessage('Failed to publish sale. Please try again.')
          setShowToast(true)
          hasResumedRef.current = false // Allow retry
        })
        .finally(() => {
          dispatch({ type: 'SET_LOADING', loading: false })
        })
    }
  }, [searchParams, user, formData, buildDraftPayload, dispatch, setToastMessage, setShowToast, setCreatedSaleId, setConfirmationModalOpen])

  const handleSubmit = async () => {
    const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true'
    if (DEBUG) {
      console.log('[SELL_WIZARD] handleSubmit called', { 
        currentStep, 
        hasDraftKey: !!draftKeyRef.current,
        hasLocalDraft: hasLocalDraft(),
        formData: {
          title: formData.title,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          lat: formData.lat,
          lng: formData.lng,
          date_start: formData.date_start,
          time_start: formData.time_start,
        }
      })
    }
    
    // Client-side required validation
    const locationValidation = validateLocationStep({
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zip_code: formData.zip_code,
      lat: formData.lat,
      lng: formData.lng,
    })
    const detailsValidation = validateDetailsStep({
      title: formData.title,
      description: formData.description,
      date_start: formData.date_start,
      time_start: formData.time_start,
      date_end: formData.date_end,
      time_end: formData.time_end,
      pricing_mode: formData.pricing_mode,
      tags: formData.tags,
    })
    const nextErrors = { ...locationValidation.errors, ...detailsValidation.errors }
    if (DEBUG) {
      console.log('[SELL_WIZARD] Validation errors:', nextErrors)
    }
    dispatch({ type: 'SET_ERRORS', errors: nextErrors })
    if (!locationValidation.isValid || !detailsValidation.isValid) {
      if (DEBUG) {
        console.log('[SELL_WIZARD] Validation failed, preventing submit')
      }
      return
    }
    
    if (DEBUG) {
      console.log('[SELL_WIZARD] Validation passed, proceeding with submit')
    }

    // Check if user is authenticated
    if (!user) {
      // Build draft payload and save locally
      const draftPayload = buildDraftPayload()
      saveLocalDraft(draftPayload)
      sessionStorage.setItem('auth:postLoginRedirect', '/sell/new?resume=review')
      sessionStorage.setItem('draft:returnStep', 'review')
      
      // Redirect to login (encode redirectTo to preserve query params)
      const redirectUrl = encodeURIComponent('/sell/new?resume=review')
      router.push(`/auth/signin?redirectTo=${redirectUrl}`)
      return
    }

    // User is authenticated - try to publish draft if exists, else create directly
    if (draftKeyRef.current && hasLocalDraft()) {
      // CRITICAL: If promotion is enabled, validate user profile is ready before publish
      if (wantsPromotion === true) {
        if (!user || !user.id) {
          dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Your account is not ready. Please refresh the page and try again.' })
          return
        }
        
        if (!draftKeyRef.current) {
          dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Draft is missing. Please refresh the page and try again.' })
          return
        }
      }
      
      // First, ensure draft is saved to server (in case it's only local)
      const localPayload = buildDraftPayload()
      try {
        await saveDraftServer(localPayload, draftKeyRef.current)
      } catch (error) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.warn('[SELL_WIZARD] Failed to save draft to server before publish:', error)
        }
        // Continue anyway - might already exist on server
      }

      // Publish draft (transactional)
      dispatch({ type: 'SET_LOADING', loading: true })
      dispatch({ type: 'SET_SUBMIT_ERROR', error: null })
      
      // Store draft key before clearing it (we need it for the publish call)
      const draftKeyToPublish = draftKeyRef.current
      
      // Clear any pending autosave and prevent future autosaves
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
      isPublishingRef.current = true
      // Clear draftKeyRef immediately to prevent autosave from saving
      // (even if a pending timeout executes, it won't have a draftKey to save to)
      draftKeyRef.current = null

      try {
        const result = await publishDraftServer(draftKeyToPublish)
        
        // Debug-only verification logs for promotion/checkout invariants
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[VERIFY_PROMOTION] Publish response received:', {
            ok: result.ok,
            code: result.code,
            hasData: !!result.data,
            dataKeys: result.data ? Object.keys(result.data) : [],
            requiresPayment: result.data && 'requiresPayment' in result.data ? result.data.requiresPayment : undefined,
            hasDraftKey: result.data && 'draftKey' in result.data ? !!result.data.draftKey : undefined,
            hasSaleId: result.data && 'saleId' in result.data ? !!result.data.saleId : undefined,
            wantsPromotion,
            timestamp: new Date().toISOString()
          })
        }
        
        if (!result.ok) {
          if (result.code === 'AUTH_REQUIRED') {
            // Should not happen since we checked user, but handle gracefully
            const redirectUrl = encodeURIComponent('/sell/new?resume=review')
            router.push(`/auth/signin?redirectTo=${redirectUrl}`)
            dispatch({ type: 'SET_LOADING', loading: false })
            return
          }
          
          // CRITICAL: If promotion is enabled, never fall back to direct creation
          // This would bypass payment and create a promoted sale without payment
          if (wantsPromotion === true) {
            const errorMessage = result.error || 'Failed to start checkout. Please try again.'
            dispatch({ type: 'SET_SUBMIT_ERROR', error: errorMessage })
            dispatch({ type: 'SET_LOADING', loading: false })
            return
          }
          
          // If draft not found and promotion is NOT enabled, fall back to direct creation
          if (result.code === 'DRAFT_NOT_FOUND') {
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[SELL_WIZARD] Draft not found on server, creating sale directly')
            }
            const payload = buildSalePayload()
            await submitSalePayload(payload)
            dispatch({ type: 'SET_LOADING', loading: false })
            return
          }
          
          // Debug-only structured logging
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            const { logger } = await import('@/lib/log')
            logger.error('Draft publish failed', new Error('Draft publish failed'), {
              component: 'sellWizard',
              operation: 'handleSubmit',
              code: result.code,
              error: result.error,
              hasDetails: !!result.details,
              path: typeof window !== 'undefined' ? window.location.pathname : undefined,
            })
          }
          
          const errorMessage = toUserFacingSubmitError({
            error: result.error,
            code: result.code,
            details: result.details
          }) || 'Failed to publish sale'
          dispatch({ type: 'SET_SUBMIT_ERROR', error: errorMessage })
          dispatch({ type: 'SET_LOADING', loading: false })
          return
        }

        // CRITICAL: If promotion is enabled, we MUST get requiresPayment flag
        // Never fall through to normal publish flow when wantsPromotion is true
        if (wantsPromotion === true) {
          if (!result.data || !('requiresPayment' in result.data) || !result.data.requiresPayment) {
            // Debug-only verification logs for promotion/checkout invariants
            if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.error('[VERIFY_PROMOTION] ERROR: wantsPromotion === true but requiresPayment missing:', {
                hasData: !!result.data,
                hasRequiresPayment: result.data && 'requiresPayment' in result.data,
                requiresPaymentValue: result.data && 'requiresPayment' in result.data ? result.data.requiresPayment : undefined,
                hasDraftKey: result.data && 'draftKey' in result.data,
              })
            }
            dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Checkout is not available. Please refresh the page and try again.' })
            dispatch({ type: 'SET_LOADING', loading: false })
            return
          }
          
          // Get draft_key from response or use the one we stored
          const draftKeyForCheckout = result.data.draftKey || draftKeyToPublish
          if (!draftKeyForCheckout) {
            dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Draft key is missing. Please refresh the page and try again.' })
            dispatch({ type: 'SET_LOADING', loading: false })
            return
          }
          
          // Debug-only verification logs for promotion/checkout invariants
          if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
            console.log('[VERIFY_PROMOTION] Redirecting to internal checkout page - this is the ONLY valid path for promoted sales:', {
              draftKey: draftKeyForCheckout,
              wantsPromotion: true,
              timestamp: new Date().toISOString()
            })
            console.log('[VERIFY_PROMOTION] Execution will return here - normal publish-success path will NOT be reached')
          }
          
          // Redirect to internal checkout page - this is the ONLY valid path for promoted sales
          const checkoutUrl = `/promotions/checkout?mode=draft&draft_key=${encodeURIComponent(draftKeyForCheckout)}&tier=featured_week`
          // Prefetch checkout route to warm code chunks
          router.prefetch(checkoutUrl)
          router.push(checkoutUrl)
          dispatch({ type: 'SET_LOADING', loading: false })
          return
        }

        // Debug-only verification logs for promotion/checkout invariants
        // This code path should NEVER be reached when wantsPromotion === true
        // If this log appears when wantsPromotion === true, the invariant is broken
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[VERIFY_PROMOTION] Normal publish-success path reached:', {
            wantsPromotion,
            hasData: !!result.data,
            hasSaleId: result.data && 'saleId' in result.data,
            timestamp: new Date().toISOString(),
            note: 'If wantsPromotion === true above, this is a BUG - normal publish path should not happen'
          })
        }
        
        // Normal publish flow - sale was created (only for non-promoted sales)
        // Type guard: check if result.data has saleId property
        if (!result.data || !('saleId' in result.data)) {
          dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Invalid response from server' })
          dispatch({ type: 'SET_LOADING', loading: false })
          return
        }

        // After type guard, TypeScript knows result.data has saleId
        const saleData = result.data as { saleId: string }
        const saleId = saleData.saleId

        // Clear drafts and sessionStorage keys
        clearLocalDraft()
        sessionStorage.removeItem('auth:postLoginRedirect')
        sessionStorage.removeItem('draft:returnStep')
        
        // Note: The publish endpoint should have already deleted the draft server-side
        // We don't need to delete it again here - the publish endpoint handles deletion
        // This prevents race conditions and ensures consistency
        
        // Clear the draft key ref to prevent reuse
        draftKeyRef.current = null
        // Reset publishing flag since publish completed successfully
        // The draft is deleted, so autosave won't recreate it anyway
        isPublishingRef.current = false

        // Dispatch sales:mutated event with sale location so SalesClient can refetch if needed
        if (typeof window !== 'undefined' && formData.lat && formData.lng) {
          window.dispatchEvent(new CustomEvent('sales:mutated', {
            detail: {
              type: 'create',
              id: saleId,
              lat: formData.lat,
              lng: formData.lng
            }
          }))
        }

        // Show confirmation modal
        setCreatedSaleId(saleId)
        setConfirmationModalOpen(true)
      } catch (error) {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[SELL_WIZARD] Error publishing draft:', error)
        }
        dispatch({ type: 'SET_SUBMIT_ERROR', error: 'Something went wrong while publishing your sale. Please try again.' })
        // Reset publishing flag on error so autosave can work again
        // Don't restore draftKeyRef - the draft should remain cleared even on error
        // User can start fresh if they need to
        isPublishingRef.current = false
      } finally {
        dispatch({ type: 'SET_LOADING', loading: false })
      }
    } else {
      // No draft exists, create sale directly (existing flow)
      const payload = buildSalePayload()
      await submitSalePayload(payload)
    }
  }

  const handlePhotoUpload = useCallback((urls: string[]) => {
    // Replace photos array with new URLs (ImageUploadCard emits all done URLs)
    dispatch({ type: 'SET_PHOTOS', photos: urls })
  }, [])

  const handleReorderPhotos = (fromIndex: number, toIndex: number) => {
    const next = [...photos]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    dispatch({ type: 'SET_PHOTOS', photos: next })
  }

  const handleSetCover = (index: number) => {
    if (index <= 0 || index >= photos.length) return
    const next = [...photos]
    const [moved] = next.splice(index, 1)
    next.unshift(moved)
    dispatch({ type: 'SET_PHOTOS', photos: next })
  }

  const handleRemovePhoto = (index: number) => {
    dispatch({ type: 'SET_PHOTOS', photos: photos.filter((_, i) => i !== index) })
  }

  const handleAddItem = useCallback((item: { id: string; name: string; price?: number; description?: string; image_url?: string; category: CategoryValue }) => {
    if (items.length >= 50) return
    dispatch({ type: 'ADD_ITEM', item })
  }, [items.length])

  const handleUpdateItem = useCallback((updated: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue }) => {
    dispatch({ type: 'UPDATE_ITEM', item: updated })
  }, [])

  const handleRemoveItem = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_ITEM', id })
  }, [])

  // Guard: if on PROMOTION step but promotions disabled, redirect to REVIEW
  useEffect(() => {
    if (currentStep === STEPS.PROMOTION && !promotionsEnabled) {
      dispatch({ type: 'SET_STEP', step: STEPS.REVIEW })
    }
  }, [currentStep, promotionsEnabled])

  const renderStep = () => {
    switch (currentStep) {
      case STEPS.DETAILS:
        return <DetailsStep formData={formData} onChange={handleInputChange} onPlaceSelected={handlePlaceSelected} errors={errors} userLat={userLat} userLng={userLng} />
      case STEPS.PHOTOS:
        return <PhotosStep photos={photos} onUpload={handlePhotoUpload} onRemove={handleRemovePhoto} onReorder={handleReorderPhotos} onSetCover={handleSetCover} />
      case STEPS.ITEMS:
        return <ItemsStep items={items} onAdd={handleAddItem} onUpdate={handleUpdateItem} onRemove={handleRemoveItem} />
      case STEPS.PROMOTION:
        if (!promotionsEnabled) {
          // Should not happen due to useEffect guard, but defensive check
          return null
        }
        return (
          <PromotionStep
            wantsPromotion={wantsPromotion}
            onTogglePromotion={(value) => {
              // Only allow toggling if draft is publishable
              // This prevents enabling promotion on invalid drafts
              if (value && !publishability.isPublishable) {
                return // Disable toggle - draft is not publishable
              }
              dispatch({ type: 'TOGGLE_PROMOTION', value })
            }}
            isPublishable={publishability.isPublishable}
            blockingErrors={publishability.blockingErrors}
          />
        )
      case STEPS.REVIEW:
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[SELL_WIZARD] Rendering ReviewStep with promotionsEnabled:', promotionsEnabled)
        }
        return (
          <ReviewStep
            formData={formData}
            photos={photos}
            items={items}
            onPublish={handleSubmit}
            loading={loading}
            submitError={submitError}
            promotionsEnabled={promotionsEnabled}
            wantsPromotion={wantsPromotion}
            onNavigateToPromotion={() => dispatch({ type: 'SET_STEP', step: STEPS.PROMOTION })}
            canStartCheckout={!!(user && user.id && draftKeyRef.current)}
            isPublishable={publishability.isPublishable}
            blockingErrors={publishability.blockingErrors}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-hidden">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900">List Your Sale</h1>
              {saveStatus === 'saving' && (
                <span className="text-sm text-gray-500 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                  Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-sm text-red-600">Save failed</span>
              )}
            </div>
            <p className="text-gray-600">Create a listing to reach more buyers in your area</p>
            <p className="text-sm text-gray-500 mt-2">You can fill this out without an account. We'll ask you to sign in when you submit.</p>
            {hasLocalDraft() && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to discard this draft? This cannot be undone.')) {
                    clearLocalDraft()
                    if (user && draftKeyRef.current) {
                      deleteDraftServer(draftKeyRef.current).catch(() => {})
                    }
                    // Reset form
                    dispatch({
                      type: 'RESUME_DRAFT',
                      payload: {
                        formData: {
                          title: '',
                          description: '',
                          address: '',
                          city: '',
                          state: '',
                          zip_code: '',
                          date_start: '',
                          time_start: '09:00',
                          date_end: '',
                          time_end: '',
                          duration_hours: 4,
                          tags: [],
                          pricing_mode: 'negotiable',
                          status: 'draft'
                        },
                        photos: [],
                        items: [],
                        currentStep: 0
                      }
                    })
                    setToastMessage('Draft discarded')
                    setShowToast(true)
                  }
                }}
                aria-label="Discard draft"
                className="text-sm text-red-600 hover:text-red-700 mt-2 underline"
              >
                Discard draft
              </button>
            )}
          </div>

      {/* Progress Steps */}
      <div className="mb-8 overflow-x-hidden px-2">
        <div className="flex justify-center">
          <div className="flex space-x-1 sm:space-x-2 md:space-x-4">
            {WIZARD_STEPS.map((step, index) => {
              const currentStepIndex = getStepIndex(currentStep)
              const isActive = index <= currentStepIndex
              const isCompleted = index < currentStepIndex
              return (
                <div key={step.id} className="flex items-center flex-shrink-0">
                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${
                    isActive
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}>
                    {index + 1}
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div className={`w-6 sm:w-8 md:w-12 h-0.5 mx-0.5 sm:mx-1 md:mx-2 ${
                      isCompleted ? 'bg-[var(--accent-primary)]' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
        
        <div className="text-center mt-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {WIZARD_STEPS[getStepIndex(currentStep)]?.title || 'Review'}
          </h2>
          <p className="text-gray-600">
            {WIZARD_STEPS[getStepIndex(currentStep)]?.description || 'Review and publish your sale'}
          </p>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 lg:p-8 mb-24 overflow-x-hidden">
        {renderStep()}
      </div>

      {/* Navigation */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 overflow-x-hidden"
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center gap-2">
        <button
          onClick={handlePrevious}
          disabled={currentStep === STEPS.DETAILS}
          aria-label="Previous step"
          className="inline-flex items-center px-4 sm:px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex-shrink-0"
        >
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>

        {currentStep < STEPS.REVIEW ? (
          <button
            onClick={handleNext}
            aria-label="Next step"
            className="inline-flex items-center px-4 sm:px-6 py-3 btn-accent min-h-[44px] flex-shrink-0"
          >
            Next
            <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
                <button
                  onClick={(e) => {
                    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
                      console.log('[SELL_WIZARD] Publish button clicked (main)', { loading, currentStep, disabled: loading })
                    }
                    e.preventDefault()
                    e.stopPropagation()
                    handleSubmit()
                  }}
                  disabled={loading || !publishability.isPublishable}
                  aria-label={publishability.isPublishable ? "Publish sale" : "Complete required fields to publish"}
                  title={!publishability.isPublishable && Object.keys(publishability.blockingErrors).length > 0 
                    ? Object.values(publishability.blockingErrors).join(', ')
                    : undefined}
                  className="inline-flex items-center px-4 sm:px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex-shrink-0"
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

      {/* Confirmation Modal */}
      {createdSaleId && (
        <ConfirmationModal
          open={confirmationModalOpen}
          onClose={() => {
            setConfirmationModalOpen(false)
            router.push('/dashboard')
          }}
          onViewSale={() => {
            // Navigate to sale detail page
            router.push(`/sales/${createdSaleId}`)
            // Close the modal state
            setConfirmationModalOpen(false)
          }}
          saleId={createdSaleId}
          showPromoteCta={false}
        />
      )}

      {/* Toast for errors */}
      <Toast
        message={toastMessage || ''}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  )
}

// Step Components
function DetailsStep({ formData, onChange, onPlaceSelected, errors, userLat, userLng }: { formData: Partial<SaleInput>, onChange: (field: keyof SaleInput, value: any) => void, onPlaceSelected: (place: { address?: string; city?: string; state?: string; zip?: string; lat?: number; lng?: number }) => void, errors?: Record<string, string>, userLat?: number, userLng?: number }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Sale Title *
        </label>
        <input
          type="text"
          id="sale-title"
          value={formData.title || ''}
          onChange={(e) => onChange('title', e.target.value)}
          placeholder="e.g., Huge Yard Sale with Antiques"
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] ${
            errors?.title ? 'border-red-500' : 'border-gray-300'
          }`}
          required
          aria-invalid={!!errors?.title}
          aria-describedby={errors?.title ? 'title-error' : undefined}
        />
        {errors?.title && (
          <p id="title-error" className="mt-1 text-sm text-red-600" role="alert">{errors.title}</p>
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
          <label htmlFor="date_start" className="block text-sm font-medium text-gray-700 mb-2 cursor-pointer">
            Start Date *
          </label>
          <input
            id="date_start"
            type="date"
            value={formData.date_start || ''}
            onChange={(e) => onChange('date_start', e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] cursor-pointer ${
              errors?.date_start ? 'border-red-500' : 'border-gray-300'
            }`}
            required
            aria-invalid={!!errors?.date_start}
            aria-describedby={errors?.date_start ? 'date_start-error' : undefined}
          />
        {errors?.date_start && (
          <p id="date_start-error" className="mt-1 text-sm text-red-600" role="alert">{errors.date_start}</p>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="date_end" className="block text-sm font-medium text-gray-700 mb-2 cursor-pointer">
            End Date *
          </label>
          <input
            id="date_end"
            type="date"
            value={formData.date_end || formData.date_start || ''}
            onChange={(e) => onChange('date_end', e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            min={formData.date_start || undefined}
            max={formData.date_start ? (() => {
              const startDate = new Date(formData.date_start)
              startDate.setDate(startDate.getDate() + 2)
              return startDate.toISOString().split('T')[0]
            })() : undefined}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] cursor-pointer ${
              errors?.date_end ? 'border-red-500' : 'border-gray-300'
            }`}
            required
            aria-invalid={!!errors?.date_end}
            aria-describedby={errors?.date_end ? 'date_end-error' : undefined}
          />
        {errors?.date_end && (
          <p id="date_end-error" className="mt-1 text-sm text-red-600" role="alert">{errors.date_end}</p>
        )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Time *
          </label>
          <TimePicker30
            value={formData.time_end || ''}
            onChange={(t) => onChange('time_end', t)}
            required
          />
          {errors?.time_end && (
            <p className="mt-1 text-sm text-red-600">{errors.time_end}</p>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Sales can last up to 3 days (maximum 2 days after start date).
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Address *
        </label>
        <AddressAutocomplete
            value={formData.address || ''}
            onChange={(address) => onChange('address', address)}
            onPlaceSelected={onPlaceSelected}
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
            id="sale-city"
            value={formData.city || ''}
            onChange={(e) => onChange('city', e.target.value)}
            placeholder="City"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)] ${
              errors?.city ? 'border-red-500' : 'border-gray-300'
            }`}
            required
            minLength={2}
            pattern="[A-Za-z\s]+"
            title="City name (letters only)"
            autoComplete="address-level2"
            aria-invalid={!!errors?.city}
            aria-describedby={errors?.city ? 'city-error' : undefined}
          />
        {errors?.city && (
          <p id="city-error" className="mt-1 text-sm text-red-600" role="alert">{errors.city}</p>
        )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            State *
          </label>
          <input
            type="text"
            id="sale-state"
            value={formData.state || ''}
            onChange={(e) => onChange('state', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="State (e.g., KY)"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors?.state ? 'border-red-500' : 'border-gray-300'
            }`}
            required
            minLength={2}
            maxLength={2}
            pattern="[A-Z]{2}"
            title="Two-letter state code (e.g., KY, CA)"
            autoComplete="address-level1"
            aria-invalid={!!errors?.state}
            aria-describedby={errors?.state ? 'state-error' : undefined}
          />
        {errors?.state && (
          <p id="state-error" className="mt-1 text-sm text-red-600" role="alert">{errors.state}</p>
        )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ZIP Code
          </label>
          <input
            type="text"
            id="sale-zip"
            value={formData.zip_code || ''}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 5)
              onChange('zip_code', value)
            }}
            placeholder="ZIP Code (5 digits)"
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              errors?.zip_code ? 'border-red-500' : 'border-gray-300'
            }`}
            pattern="\d{5}"
            title="5-digit ZIP code"
            autoComplete="postal-code"
            aria-invalid={!!errors?.zip_code}
            aria-describedby={errors?.zip_code ? 'zip_code-error' : undefined}
          />
        {errors?.zip_code && (
          <p id="zip_code-error" className="mt-1 text-sm text-red-600" role="alert">{errors.zip_code}</p>
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
          ].map((category) => {
            // Check if this category is in tags (case-insensitive comparison)
            const isChecked = formData.tags?.some(tag => 
              tag && tag.trim().toLowerCase() === category.toLowerCase()
            ) || false
            
            // Debug logging for first category only to avoid spam
            if (category === 'Furniture' && process.env.NEXT_PUBLIC_DEBUG === 'true') {
              console.log('[SELL_WIZARD] Category checkbox check:', {
                category,
                formDataTags: formData.tags,
                isChecked
              })
            }
            
            return (
            <label key={category} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  const currentTags = formData.tags || []
                  if (e.target.checked) {
                    // Add category if not already present (case-insensitive check)
                    const alreadyExists = currentTags.some(tag => 
                      tag && tag.trim().toLowerCase() === category.toLowerCase()
                    )
                    if (!alreadyExists) {
                      onChange('tags', [...currentTags, category])
                    }
                  } else {
                    // Remove category (case-insensitive)
                    onChange('tags', currentTags.filter(tag => 
                      !tag || tag.trim().toLowerCase() !== category.toLowerCase()
                    ))
                  }
                }}
                className="rounded border-gray-300 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
              />
                <span className="text-sm text-gray-700">{category}</span>
              </label>
            )
          })}
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
        
        <ImageUploadCard
          value={photos}
          onChange={onUpload}
          maxFiles={10}
          maxSizeMB={5}
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
  items: Array<{ id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue }>,
  onAdd: (item: { id: string; name: string; price?: number; description?: string; image_url?: string; category: CategoryValue }) => void,
  onUpdate: (item: { id: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue }) => void,
  onRemove: (id: string) => void
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [itemFormInstanceId, setItemFormInstanceId] = useState(0)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const MAX_ITEMS = 50

  const handleOpenModal = useCallback(() => {
    if (items.length >= MAX_ITEMS) {
      setToastMessage('Item limit reached (50)')
      setShowToast(true)
      return
    }
    setEditingItemId(null)
    // Increment instance ID to force remount when adding a new item (not editing)
    setItemFormInstanceId(prev => prev + 1)
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

  const handleSubmit = useCallback((item: { id: string; name: string; price?: number; description?: string; image_url?: string; category: CategoryValue }) => {
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
        key={editingItemId || `new-${itemFormInstanceId}`}
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

// Step Components
function PromotionStep({
  wantsPromotion,
  onTogglePromotion,
  isPublishable,
  blockingErrors,
}: {
  wantsPromotion?: boolean
  onTogglePromotion?: (next: boolean) => void
  isPublishable?: boolean
  blockingErrors?: Record<string, string>
}) {
  return (
    <div className="space-y-6">
        {/* Primary Panel */}
        <div className={`bg-white border-2 rounded-lg p-6 shadow-sm transition-colors ${
          wantsPromotion 
            ? 'bg-purple-50 border-purple-500' 
            : 'border-gray-300'
        }`}>
          {/* Decision Framing */}
          <div className="mb-6">
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">
              Promote Your Sale
            </h3>
            <p className="text-base text-gray-700">
              Before you publish, promote your sale for a one-time <strong className="font-semibold text-[#3A2268]">$2.99</strong> to reach more buyers in your area.
            </p>
          </div>

          {/* Benefits List */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3">What promotion includes:</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Prominent placement in search results and discovery feeds</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Included in weekly email to local buyers</span>
              </li>
              <li className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Early visibility before your sale starts</span>
              </li>
            </ul>
          </div>

          {/* Toggle Control */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="flex-1">
              <label className="text-base font-medium text-gray-900">
                Promote this sale
                <span className="ml-2 text-[#3A2268] font-semibold">$2.99 one-time</span>
              </label>
              {!isPublishable && blockingErrors && Object.keys(blockingErrors).length > 0 && (
                <p className="text-sm text-red-600 mt-1">
                  Complete required fields before enabling promotion
                </p>
              )}
            </div>
            <label className={`relative inline-flex items-center ${isPublishable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
              <input
                type="checkbox"
                checked={!!wantsPromotion}
                onChange={(e) => {
                  // Only allow toggling if draft is publishable
                  if (isPublishable) {
                    onTogglePromotion?.(e.target.checked)
                  }
                }}
                disabled={!isPublishable}
                className="sr-only peer"
                data-testid="promotion-step-feature-toggle"
                aria-disabled={!isPublishable}
                aria-label={isPublishable ? "Enable promotion" : "Promotion unavailable - complete required fields"}
              />
              <div className={`w-11 h-6 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
                isPublishable
                  ? 'bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-500 peer-checked:bg-purple-600'
                  : 'bg-gray-300 peer-checked:bg-gray-400'
              }`}></div>
            </label>
          </div>

          {/* State Reinforcement - ON State */}
          {wantsPromotion && (
            <div className="mt-4 pt-4 border-t border-purple-200">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="font-semibold text-purple-800">Promotion enabled</p>
                  <p className="text-sm text-purple-700 mt-1">
                    You'll be charged <strong>$2.99</strong> only if the sale is published.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Secondary Reassurance */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">
            <span className="font-medium">Optional:</span> Promotion is <strong>$2.99 one-time</strong>. No charge unless your sale is published. You can add or remove promotion anytime from your dashboard.
          </p>
        </div>
      </div>
  )
}

function ReviewStep({ 
  formData, 
  photos,
  items,
  onPublish: _onPublish,
  loading: _loading,
  submitError,
  promotionsEnabled: promotionsEnabledProp,
  paymentsEnabled: _paymentsEnabled,
  wantsPromotion,
  onNavigateToPromotion,
  canStartCheckout,
  isPublishable,
  blockingErrors,
}: {
  formData: Partial<SaleInput>
  photos: string[]
  items: Array<{ id?: string; name: string; price?: number; description?: string; image_url?: string; category?: CategoryValue }>
  onPublish: () => void
  loading: boolean
  submitError?: string | null
  promotionsEnabled?: boolean
  paymentsEnabled?: boolean
  wantsPromotion?: boolean
  onNavigateToPromotion?: () => void
  canStartCheckout?: boolean
  isPublishable?: boolean
  blockingErrors?: Record<string, string>
}) {
  // Ensure promotionsEnabled is always a boolean (defensive check)
  // This preserves the server-computed value and prevents undefined from hiding promotion section
  const promotionsEnabled = promotionsEnabledProp ?? false

  // Defensive assertion: log warning if prop is undefined (indicates prop passing issue)
  if (process.env.NEXT_PUBLIC_DEBUG === 'true' && promotionsEnabledProp === undefined) {
    console.warn('[REVIEW_STEP] promotionsEnabled prop is undefined - may indicate prop passing issue')
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (timeString: string) => {
    if (!timeString) return ''
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
            <p><strong>Date:</strong> {formData.date_start ? formatDate(formData.date_start) : 'Not set'} {formData.time_start ? `at ${formatTime(formData.time_start)}` : ''}</p>
            {formData.date_end && <p><strong>Ends:</strong> {formatDate(formData.date_end)} {formData.time_end ? `at ${formatTime(formData.time_end)}` : ''}</p>}
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
            <h4 className="font-medium text-gray-900 mb-3">Items ({items.length})</h4>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((item) => (
                <div
                  key={item.id || `review-item-${item.name}`}
                  className="bg-white border border-gray-200 rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-full h-24 object-cover rounded mb-2"
                    />
                  ) : (
                    <div className="w-full h-24 bg-gray-100 rounded mb-2 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="text-xs font-medium text-gray-900 truncate" title={item.name}>
                    {item.name}
                  </div>
                  {item.price && (
                    <div className="text-xs font-semibold text-[var(--accent-primary)] mt-1">
                      ${item.price}
                    </div>
                  )}
                  {item.description && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2" title={item.description}>
                      {item.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
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

        {/* Promotion Confirmation Section */}
        {promotionsEnabled && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            {wantsPromotion ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="flex-1">
                    <h4 className="font-semibold text-purple-800">Promotion enabled</h4>
                    <p className="text-sm text-gray-700 mt-1">
                      Your sale will be promoted in weekly emails and discovery.
                    </p>
                    <p className="text-sm font-medium text-gray-900 mt-2">
                      Cost: <span className="text-[#3A2268]">$2.99</span> (one-time)
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      You'll only be charged if this sale is published.
                    </p>
                  </div>
                </div>
                {onNavigateToPromotion && (
                  <button
                    onClick={onNavigateToPromotion}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium underline"
                  >
                    Change promotion
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-gray-900">Promotion not enabled</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Your sale will publish without promotion.
                  </p>
                </div>
                {onNavigateToPromotion && (
                  <button
                    onClick={onNavigateToPromotion}
                    className="text-sm text-purple-600 hover:text-purple-700 font-medium underline"
                  >
                    Promote my sale for $2.99
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      
      <div className="mt-6 mb-6">
        {submitError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {submitError}
          </div>
        )}
        {wantsPromotion && !canStartCheckout && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
            Your account is not ready for checkout. Please refresh the page and try again.
          </div>
        )}
        {!isPublishable && blockingErrors && Object.keys(blockingErrors).length > 0 && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
            <div className="font-medium mb-1">Complete required fields to publish:</div>
            <ul className="list-disc list-inside space-y-0.5">
              {Object.entries(blockingErrors).slice(0, 3).map(([field, error]) => (
                <li key={field}>{error}</li>
              ))}
              {Object.keys(blockingErrors).length > 3 && (
                <li className="text-yellow-700">+{Object.keys(blockingErrors).length - 3} more issue{Object.keys(blockingErrors).length - 3 === 1 ? '' : 's'}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

