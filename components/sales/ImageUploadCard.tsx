'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { uploadToCloudinary } from '@/lib/uploads/cloudinary'
import Toast from './Toast'

interface ImageItem {
  id: string
  file?: File
  localPreviewUrl?: string
  status: 'idle' | 'uploading' | 'done' | 'error'
  progress: number
  url?: string
  error?: string
}

interface ImageUploadCardProps {
  value?: string[] // initial URLs if editing
  onChange: (urls: string[]) => void // emit final URLs (uploaded & confirmed only)
  onUploadStateChange?: (uploading: boolean) => void // notify parent of upload state
  maxFiles?: number // default 6
  maxSizeMB?: number // default 5
}

export default function ImageUploadCard({
  value = [],
  onChange,
  onUploadStateChange,
  maxFiles = 6,
  maxSizeMB = 5
}: ImageUploadCardProps) {
  const [items, setItems] = useState<ImageItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const hasUploadingItemsRef = useRef(false)

  // Initialize with existing URLs (only when value prop changes externally, not from our own onChange)
  const prevValueRef = useRef<string[]>([])
  const isInitializedRef = useRef(false)
  useEffect(() => {
    // Only sync if value prop changed externally (not from our own onChange)
    const valueChanged = JSON.stringify([...value].sort()) !== JSON.stringify([...prevValueRef.current].sort())
    
    if (valueChanged && value.length > 0 && !isInitializedRef.current) {
      // Only initialize if we haven't initialized yet (to avoid overwriting in-progress uploads)
      const initialItems: ImageItem[] = value.map((url, index) => ({
        id: `existing-${index}-${Date.now()}`,
        status: 'done' as const,
        progress: 100,
        url
      }))
      setItems(initialItems)
      prevValueRef.current = [...value]
      isInitializedRef.current = true
    } else if (value.length === 0 && items.length === 0) {
      // Reset when value becomes empty and we have no items
      prevValueRef.current = []
      isInitializedRef.current = false
    } else if (valueChanged) {
      // Update ref even if we don't sync (to track external changes)
      prevValueRef.current = [...value]
    }
  }, [value, items.length])

  // Emit final URLs whenever done items change (but only if URLs actually changed)
  const prevUrlsRef = useRef<string[]>([])
  useEffect(() => {
    const doneUrls = items
      .filter(item => item.status === 'done' && item.url)
      .map(item => item.url!)
      .sort() // Sort for stable comparison
    
    // Only call onChange if URLs actually changed (prevents infinite loops)
    const urlsChanged = JSON.stringify(doneUrls) !== JSON.stringify(prevUrlsRef.current)
    if (urlsChanged) {
      prevUrlsRef.current = doneUrls
      onChange(doneUrls)
    }
    
    // Track upload state and notify parent
    const hasUploading = items.some(item => item.status === 'uploading')
    hasUploadingItemsRef.current = hasUploading
    if (onUploadStateChange) {
      onUploadStateChange(hasUploading)
    }
  }, [items, onChange, onUploadStateChange])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      items.forEach(item => {
        if (item.localPreviewUrl) {
          URL.revokeObjectURL(item.localPreviewUrl)
        }
      })
    }
  }, [items])

  const showToastMessage = useCallback((message: string) => {
    setToastMessage(message)
    setShowToast(true)
  }, [])

  const validateFile = useCallback((file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    if (!allowedTypes.includes(file.type)) {
      return `File type not supported. Please use JPEG, PNG, WebP, or HEIC.`
    }

    const maxSize = maxSizeMB * 1024 * 1024
    if (file.size > maxSize) {
      return `File size must be less than ${maxSizeMB}MB`
    }

    return null
  }, [maxSizeMB])

  const createPreviewUrl = useCallback((file: File): string => {
    return URL.createObjectURL(file)
  }, [])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return

    const fileArray = Array.from(files)
    const currentCount = items.filter(i => i.status !== 'error').length
    const remainingSlots = maxFiles - currentCount

    if (fileArray.length > remainingSlots) {
      showToastMessage(`Maximum ${maxFiles} images allowed. Only the first ${remainingSlots} will be uploaded.`)
      fileArray.splice(remainingSlots)
    }

    const newItems: ImageItem[] = []

    for (const file of fileArray) {
      const validationError = validateFile(file)
      if (validationError) {
        showToastMessage(validationError)
        continue
      }

      const id = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
      const previewUrl = createPreviewUrl(file)

      newItems.push({
        id,
        file,
        localPreviewUrl: previewUrl,
        status: 'idle',
        progress: 0
      })
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems])
      // Start uploading immediately
      newItems.forEach(item => {
        if (item.file) {
          uploadFile(item.id, item.file)
        }
      })
    }
  }, [items, maxFiles, validateFile, createPreviewUrl, showToastMessage])

  const uploadFile = useCallback(async (itemId: string, file: File) => {
    const controller = new AbortController()
    abortControllersRef.current.set(itemId, controller)

    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, status: 'uploading', progress: 0 } : item
    ))

    try {
      const result = await uploadToCloudinary(file, {
        onProgress: (progress) => {
          setItems(prev => prev.map(item =>
            item.id === itemId ? { ...item, progress } : item
          ))
        },
        signal: controller.signal
      })

      if (result.success && result.publicUrl) {
        setItems(prev => prev.map(item => {
          if (item.id === itemId) {
            // Cleanup preview URL
            if (item.localPreviewUrl) {
              URL.revokeObjectURL(item.localPreviewUrl)
            }
            return {
              ...item,
              status: 'done',
              progress: 100,
              url: result.publicUrl,
              file: undefined,
              localPreviewUrl: undefined
            }
          }
          return item
        }))
      } else {
        setItems(prev => prev.map(item =>
          item.id === itemId
            ? { ...item, status: 'error', error: result.error || 'Upload failed' }
            : item
        ))
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Upload cancelled') {
        // Cleanup cancelled upload
        setItems(prev => {
          const item = prev.find(i => i.id === itemId)
          if (item?.localPreviewUrl) {
            URL.revokeObjectURL(item.localPreviewUrl)
          }
          return prev.filter(i => i.id !== itemId)
        })
      } else {
        setItems(prev => prev.map(item =>
          item.id === itemId
            ? { ...item, status: 'error', error: error instanceof Error ? error.message : 'Upload failed' }
            : item
        ))
      }
    } finally {
      abortControllersRef.current.delete(itemId)
    }
  }, [])

  const handleRemove = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (item?.localPreviewUrl) {
      URL.revokeObjectURL(item.localPreviewUrl)
    }

    // Cancel upload if in progress
    const controller = abortControllersRef.current.get(itemId)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(itemId)
    }

    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [items])

  const handleRetry = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (item?.file) {
      uploadFile(itemId, item.file)
    }
  }, [items, uploadFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    handleFiles(files)
  }, [handleFiles])

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleFiles])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const files: File[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault()
      // Create a FileList-like object
      const dataTransfer = new DataTransfer()
      files.forEach(file => dataTransfer.items.add(file))
      handleFiles(dataTransfer.files)
    }
  }, [handleFiles])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const hasUploadingItems = items.some(item => item.status === 'uploading')

  return (
    <>
      <div className="space-y-4">
        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onPaste={handlePaste}
          onClick={handleClick}
          className={`
            relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
            transition-all min-h-[120px] flex items-center justify-center
            ${isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }
          `}
          role="button"
          tabIndex={0}
          aria-label="Upload item photos"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleClick()
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            multiple
            capture="environment"
            onChange={handleFileInputChange}
            className="hidden"
            aria-label="File input"
          />

          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <div className="text-sm font-medium text-gray-900">
              Drag & drop or click to upload
            </div>
            <div className="text-xs text-gray-500">
              Up to {maxFiles} images, max {maxSizeMB}MB each
            </div>
          </div>
        </div>

        {/* Preview List */}
        {items.length > 0 && (
          <div className="space-y-2" role="list" aria-live="polite">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-white"
                role="listitem"
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                  {item.localPreviewUrl ? (
                    <img
                      src={item.localPreviewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : item.url ? (
                    <img
                      src={item.url}
                      alt="Uploaded"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {item.file?.name || 'Uploaded image'}
                  </div>
                  {item.file && (
                    <div className="text-xs text-gray-500">
                      {formatFileSize(item.file.size)}
                    </div>
                  )}

                  {/* Progress Bar */}
                  {item.status === 'uploading' && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                          role="progressbar"
                          aria-valuenow={item.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Uploading... {Math.round(item.progress)}%
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {item.status === 'error' && item.error && (
                    <div className="text-xs text-red-600 mt-1">{item.error}</div>
                  )}

                  {/* Success Indicator */}
                  {item.status === 'done' && (
                    <div className="text-xs text-green-600 mt-1">✓ Uploaded</div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex gap-1">
                  {item.status === 'error' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetry(item.id)
                      }}
                      className="p-1 text-blue-600 hover:text-blue-800 transition-colors"
                      aria-label="Retry upload"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.5m13.5 0V4M4 9a9 9 0 1018 0" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemove(item.id)
                    }}
                    className="p-1 text-red-600 hover:text-red-800 transition-colors"
                    aria-label="Remove image"
                    onKeyDown={(e) => {
                      if (e.key === 'Delete') {
                        e.stopPropagation()
                        handleRemove(item.id)
                      }
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Upload Status Banner */}
        {hasUploadingItems && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span>Uploading images... Please wait before saving.</span>
            </div>
          </div>
        )}
      </div>

      <Toast
        message={toastMessage || ''}
        isVisible={showToast}
        onClose={() => setShowToast(false)}
      />
    </>
  )
}

