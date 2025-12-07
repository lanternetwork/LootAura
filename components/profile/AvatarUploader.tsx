'use client'

import { useState } from 'react'
import { getCsrfHeaders } from '@/lib/csrf-client'

type AvatarUploaderProps = {
  initialUrl?: string | null
  onUpdated?: (url: string | null) => void
  onClose?: () => void
}

export function AvatarUploader({ initialUrl, onUpdated, onClose }: AvatarUploaderProps) {
  const [preview, setPreview] = useState<string | undefined>(initialUrl || undefined)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB')
      return
    }
    
    setError(null)
    setUploading(true)
    
    try {
      // Get Cloudinary signature
      const sigRes = await fetch('/api/profile/avatar', { 
        method: 'POST',
        headers: {
          ...getCsrfHeaders(),
        },
        credentials: 'include',
      })
      const sig = await sigRes.json()
      
      if (!sig?.ok || !sig?.data) {
        throw new Error(sig?.error || 'Failed to get upload signature')
      }
      
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[AVATAR] signature issued', { hasPreset: !!sig.data.upload_preset, hasSignature: !!sig.data.signature })
      }
      
      // Upload to Cloudinary
      const form = new FormData()
      form.append('file', file)
      
      // Check if using unsigned preset (preferred) or signed upload
      if (sig.data.upload_preset) {
        // Unsigned upload preset (simpler, no signature needed)
        // eager transformations should be configured in the upload preset, not passed as parameter
        form.append('upload_preset', sig.data.upload_preset)
        if (sig.data.folder) form.append('folder', sig.data.folder)
        // Don't include eager for unsigned uploads - it's not allowed
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AVATAR] uploading with unsigned preset:', {
            upload_preset: sig.data.upload_preset,
            folder: sig.data.folder,
            eager: sig.data.eager,
          })
        }
      } else {
        // Signed upload (fallback)
        // IMPORTANT: Parameters must be sent in the same order as signed
        // For signed uploads, Cloudinary expects: eager, folder, timestamp (lexicographically sorted)
        form.append('eager', sig.data.eager)
        form.append('folder', sig.data.folder)
        form.append('timestamp', String(sig.data.timestamp))
        form.append('api_key', sig.data.api_key)
        form.append('signature', sig.data.signature)
        
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[AVATAR] uploading with signed params:', {
            eager: sig.data.eager,
            folder: sig.data.folder,
            timestamp: sig.data.timestamp,
            api_key: sig.data.api_key,
            signature: sig.data.signature,
          })
        }
      }
      
      const cloudUrl = `https://api.cloudinary.com/v1_1/${sig.data.cloud_name}/image/upload`
      const uploadRes = await fetch(cloudUrl, { method: 'POST', body: form })
      
      if (!uploadRes.ok) {
        const errorText = await uploadRes.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { message: errorText }
        }
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[AVATAR] upload error:', errorData)
        }
        throw new Error(errorData?.error?.message || errorData?.message || `Upload failed: ${uploadRes.status}`)
      }
      
      const uploadResult = await uploadRes.json()
      
      if (!uploadResult.secure_url) {
        throw new Error(uploadResult?.error?.message || 'Upload succeeded but no URL returned')
      }
      
      // Validate URL is from allowed host
      const allowedHosts = ['res.cloudinary.com']
      const urlObj = new URL(uploadResult.secure_url)
      if (!allowedHosts.some(host => urlObj.hostname.includes(host))) {
        throw new Error('Invalid image host')
      }
      
      // Add cache busting parameter to ensure fresh image
      const cacheBustedUrl = `${uploadResult.secure_url}?v=${Date.now()}`
      setPreview(cacheBustedUrl)
      
      // Persist to profile - write to base table via RPC
      const profileRes = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ avatar_url: uploadResult.secure_url }), // Store original URL without cache bust
      })
      
      // Read response once - don't read it twice!
      const profileData = await profileRes.json().catch(() => ({ ok: false, error: 'Failed to parse response' }))
      
      if (!profileRes.ok || !profileData?.ok) {
        const errorMsg = profileData?.error || 'Failed to save avatar'
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.error('[AVATAR] save to profile failed:', errorMsg, profileData)
        }
        throw new Error(errorMsg)
      }
      
      if (onUpdated) {
        // Pass cache-busted URL to parent so it updates immediately
        onUpdated(cacheBustedUrl)
      }
    } catch (e: any) {
      setError(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onRemove = async () => {
    setUploading(true)
    setError(null)
    
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          ...getCsrfHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ avatar_url: null }),
      })
      
      if (!res.ok) {
        throw new Error('Failed to remove avatar')
      }
      
      setPreview(undefined)
      if (onUpdated) {
        onUpdated(null)
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to remove avatar')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {preview ? (
        <div
          className="w-32 h-32 rounded-full mx-auto"
          style={{ backgroundImage: `url(${preview})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          aria-label="Avatar preview"
        />
      ) : (
        <div className="w-32 h-32 rounded-full bg-neutral-200 mx-auto" aria-label="No avatar" />
      )}
      <div className="flex gap-2 items-center justify-center">
        <label className="btn-accent cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUpload}
            disabled={uploading}
          />
          {uploading ? 'Uploading…' : 'Upload'}
        </label>
        {preview && (
          <button
            type="button"
            onClick={onRemove}
            disabled={uploading}
            className="rounded px-4 py-2 border text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Remove
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded px-4 py-2 border text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Close
          </button>
        )}
      </div>
      {error && <div className="text-red-600 text-sm text-center">{error}</div>}
      <div className="text-xs text-neutral-500 text-center">
        Supported formats: JPG, PNG, GIF. Max size: 5MB
      </div>
    </div>
  )
}

