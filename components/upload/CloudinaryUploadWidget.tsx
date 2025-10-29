'use client'

import { useEffect, useRef, useState } from 'react'
import { FaCloudUploadAlt, FaSpinner, FaExclamationTriangle } from 'react-icons/fa'
import { CloudinaryWidget } from '@/types/cloudinary'

interface CloudinaryUploadWidgetProps {
  onUpload: (urls: string[]) => void
  maxFiles?: number
  className?: string
}

export default function CloudinaryUploadWidget({ 
  onUpload, 
  maxFiles = 10, 
  className = '' 
}: CloudinaryUploadWidgetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isCloudinaryAvailable, setIsCloudinaryAvailable] = useState(false)
  const widgetRef = useRef<CloudinaryWidget | null>(null)

  // Check if Cloudinary environment variables are available
  useEffect(() => {
    const hasCloudinaryConfig = !!(
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
    )
    setIsCloudinaryAvailable(hasCloudinaryConfig)
  }, [])

  // Initialize Cloudinary widget
  useEffect(() => {
    if (!isCloudinaryAvailable || typeof window === 'undefined') return

    const loadCloudinaryScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.cloudinary) {
          resolve()
          return
        }

        const script = document.createElement('script')
        script.src = 'https://widget.cloudinary.com/v2.0/global/all.js'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Cloudinary script'))
        document.head.appendChild(script)
      })
    }

    const initializeWidget = async () => {
      try {
        await loadCloudinaryScript()
        
        if (!window.cloudinary) {
          throw new Error('Cloudinary widget not available')
        }

        const widget = window.cloudinary.createUploadWidget(
          {
            cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
            uploadPreset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
            multiple: true,
            maxFiles: maxFiles,
            cropping: true,
            croppingAspectRatio: 16/9,
            croppingShowDimensions: true,
            resourceType: 'image',
            folder: 'lootaura/sales',
            tags: ['lootaura', 'yard-sale'],
            sources: ['local', 'camera', 'url'],
            showAdvancedOptions: false,
            showPoweredBy: false,
            styles: {
              palette: {
                window: '#FFFFFF',
                sourceBg: '#F4F4F5',
                windowBorder: '#90A0B3',
                tabIcon: '#0078FF',
                inactiveTabIcon: '#8E9FBF',
                menuIcons: '#5A616A',
                link: '#0078FF',
                action: '#FF620C',
                inProgress: '#0078FF',
                complete: '#20B832',
                error: '#EA2727',
                textDark: '#000000',
                textLight: '#FFFFFF'
              },
              fonts: {
                default: null,
                'Roboto, sans-serif': {
                  url: 'https://fonts.googleapis.com/css?family=Roboto',
                  active: true
                }
              }
            }
          },
          (error: any, result: any) => {
            if (error) {
              console.error('Cloudinary upload error:', error)
              setError('Upload failed. Please try again.')
              setIsLoading(false)
              return
            }

            if (result && result.event === 'success') {
              const uploadedUrls = result.info.secure_url ? [result.info.secure_url] : []
              onUpload(uploadedUrls)
              setIsLoading(false)
            }
          }
        )

        widgetRef.current = widget
      } catch (err) {
        console.error('Failed to initialize Cloudinary widget:', err)
        setError('Failed to initialize upload widget.')
        setIsLoading(false)
      }
    }

    initializeWidget()

    return () => {
      if (widgetRef.current) {
        widgetRef.current.destroy()
      }
    }
  }, [isCloudinaryAvailable, maxFiles, onUpload])

  const handleUpload = () => {
    if (!widgetRef.current) return
    
    setError(null)
    setIsLoading(true)
    widgetRef.current.open()
  }

  // Feature flag: Show disabled state if Cloudinary not configured
  if (!isCloudinaryAvailable) {
    return (
      <div className={`p-6 border-2 border-dashed border-gray-300 rounded-lg text-center ${className}`}>
        <FaExclamationTriangle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Image Upload Not Available</h3>
        <p className="text-gray-500 mb-4">
          Cloudinary configuration is missing. Please set the following environment variables:
        </p>
        <div className="bg-gray-100 p-3 rounded text-left text-sm font-mono">
          <div>NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</div>
          <div>NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET</div>
        </div>
        <p className="text-gray-400 text-sm mt-2">
          Contact your administrator to enable image uploads.
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <button
        onClick={handleUpload}
        disabled={isLoading}
        className="w-full flex items-center justify-center px-6 py-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[120px]"
      >
        {isLoading ? (
          <>
            <FaSpinner className="animate-spin h-6 w-6 text-blue-600 mr-3" />
            <span className="text-blue-600 font-medium">Uploading...</span>
          </>
        ) : (
          <>
            <FaCloudUploadAlt className="h-6 w-6 text-gray-400 mr-3" />
            <div className="text-left">
              <div className="text-gray-900 font-medium">Upload Images</div>
              <div className="text-gray-500 text-sm">Click to select or drag and drop</div>
              <div className="text-gray-400 text-xs mt-1">Max {maxFiles} images</div>
            </div>
          </>
        )}
      </button>

      {error && (
        <div className="flex items-center text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          <FaExclamationTriangle className="mr-2" />
          {error}
        </div>
      )}
    </div>
  )
}
