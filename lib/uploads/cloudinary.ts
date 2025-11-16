/**
 * Direct Cloudinary upload helper using unsigned upload preset
 * Supports progress tracking via XHR
 */

export interface CloudinaryUploadOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

export interface CloudinaryUploadResult {
  success: boolean
  publicUrl?: string
  error?: string
}

/**
 * Upload a file directly to Cloudinary using unsigned upload preset
 */
export async function uploadToCloudinary(
  file: File,
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  const { onProgress, signal } = options

  const { ENV_PUBLIC } = await import('@/lib/env')
  const cloudName = ENV_PUBLIC.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  const uploadPreset = ENV_PUBLIC.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET

  if (!cloudName || !uploadPreset) {
    return {
      success: false,
      error: 'Cloudinary configuration missing'
    }
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  if (!allowedTypes.includes(file.type)) {
    return {
      success: false,
      error: 'Only JPEG, PNG, WebP, and HEIC images are allowed'
    }
  }

  // Validate file size (5MB default)
  const maxSize = 5 * 1024 * 1024
  if (file.size > maxSize) {
    return {
      success: false,
      error: `File size must be less than 5MB`
    }
  }

  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', uploadPreset)
    formData.append('folder', 'lootaura/sales')
    formData.append('tags', 'lootaura,yard-sale')

    const xhr = new XMLHttpRequest()

    // Handle abort
    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort()
        reject(new Error('Upload cancelled'))
      })
    }

    // Track progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100
          onProgress(progress)
        }
      })
    }

    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          if (response.secure_url) {
            resolve({
              success: true,
              publicUrl: response.secure_url
            })
          } else {
            resolve({
              success: false,
              error: 'Upload succeeded but no URL returned'
            })
          }
        } catch (error) {
          resolve({
            success: false,
            error: 'Failed to parse upload response'
          })
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText)
          resolve({
            success: false,
            error: error.error?.message || `Upload failed with status ${xhr.status}`
          })
        } catch {
          resolve({
            success: false,
            error: `Upload failed with status ${xhr.status}`
          })
        }
      }
    })

    // Handle errors
    xhr.addEventListener('error', () => {
      resolve({
        success: false,
        error: 'Network error during upload'
      })
    })

    xhr.addEventListener('abort', () => {
      resolve({
        success: false,
        error: 'Upload cancelled'
      })
    })

    // Start upload
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
    xhr.send(formData)
  })
}

