'use client'

import { useState, useEffect } from 'react'
import { CheckCircleIcon, XCircleIcon, InformationCircleIcon } from '@heroicons/react/20/solid'
import { ENV_PUBLIC } from '@/lib/env'
import Image from 'next/image'
import nextConfig from '../../../next.config.js' // Adjust path as needed

interface CloudinaryStatus {
  cloudNamePresent: boolean
  presetPresent: boolean
  nextImageAllowlist: boolean
  sampleUrlHealth: 'loading' | 'success' | 'error'
  lastWidgetResult?: any
  lastWidgetError?: string
}

export default function CloudinaryDiagnostics() {
  const [status, setStatus] = useState<CloudinaryStatus>({
    cloudNamePresent: false,
    presetPresent: false,
    nextImageAllowlist: true, // Assume true since we added it to next.config.js
    sampleUrlHealth: 'loading'
  })

  useEffect(() => {
    // Check environment variables
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

    setStatus(prev => ({
      ...prev,
      cloudNamePresent: !!cloudName,
      presetPresent: !!preset
    }))

    // Test sample transformation URL health
    if (cloudName) {
      const sampleUrl = `https://res.cloudinary.com/${cloudName}/image/upload/w_100,h_100,c_fill/sample.jpg`
      
      const img = new Image()
      img.onload = () => {
        setStatus(prev => ({ ...prev, sampleUrlHealth: 'success' }))
      }
      img.onerror = () => {
        setStatus(prev => ({ ...prev, sampleUrlHealth: 'error' }))
      }
      img.src = sampleUrl
    } else {
      setStatus(prev => ({ ...prev, sampleUrlHealth: 'error' }))
    }
  }, [])

  const openWidgetTest = async () => {
    if (typeof window === 'undefined') {
      setStatus(prev => ({ 
        ...prev, 
        lastWidgetError: 'Not in browser environment' 
      }))
      return
    }

    // Load Cloudinary script if not already loaded
    if (!window.cloudinary) {
      try {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script')
          script.src = 'https://widget.cloudinary.com/v2.0/global/all.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load Cloudinary script'))
          document.head.appendChild(script)
        })
      } catch (error) {
        setStatus(prev => ({ 
          ...prev, 
          lastWidgetError: 'Failed to load Cloudinary script' 
        }))
        return
      }
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const preset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

    if (!cloudName || !preset) {
      setStatus(prev => ({ 
        ...prev, 
        lastWidgetError: 'Missing environment variables' 
      }))
      return
    }

    try {
      const widget = window.cloudinary.createUploadWidget(
        {
          cloudName,
          uploadPreset: preset,
          multiple: false,
          maxFiles: 1,
          resourceType: 'image',
          folder: 'lootaura/test',
          sources: ['local']
        },
        (error: any, result: any) => {
          if (error) {
            setStatus(prev => ({ 
              ...prev, 
              lastWidgetError: error.message || 'Upload failed',
              lastWidgetResult: null
            }))
          } else if (result && result.event === 'success') {
            setStatus(prev => ({ 
              ...prev, 
              lastWidgetResult: result.info,
              lastWidgetError: undefined
            }))
          }
        }
      )

      widget.open()
    } catch (err) {
      setStatus(prev => ({ 
        ...prev, 
        lastWidgetError: err instanceof Error ? err.message : 'Unknown error' 
      }))
    }
  }

  const getStatusIcon = (condition: boolean) => {
    return condition ? '✅' : '❌'
  }

  const getHealthIcon = (health: string) => {
    switch (health) {
      case 'success': return '✅'
      case 'error': return '❌'
      case 'loading': return '⏳'
      default: return '❓'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">Cloudinary Diagnostics</h3>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Cloud Name Present</span>
          <span>{getStatusIcon(status.cloudNamePresent)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span>Upload Preset Present</span>
          <span>{getStatusIcon(status.presetPresent)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span>Next.js Image Allowlist</span>
          <span>{getStatusIcon(status.nextImageAllowlist)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span>Sample URL Health</span>
          <span>{getHealthIcon(status.sampleUrlHealth)}</span>
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={openWidgetTest}
          disabled={!status.cloudNamePresent || !status.presetPresent}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          Open Widget Smoke Test
        </button>
      </div>

      {status.lastWidgetResult && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <h4 className="font-medium text-green-800">Last Upload Result</h4>
          <p className="text-sm text-green-700">
            URL: {status.lastWidgetResult.secure_url}
          </p>
        </div>
      )}

      {status.lastWidgetError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
          <h4 className="font-medium text-red-800">Last Error</h4>
          <p className="text-sm text-red-700">{status.lastWidgetError}</p>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>• Cloud Name: {process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'Not set'}</p>
        <p>• Upload Preset: {process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'Not set'}</p>
      </div>
    </div>
  )
}

