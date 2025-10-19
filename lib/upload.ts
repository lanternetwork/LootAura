// Client-side upload utility using server-signed URLs

import { isFileSizeValid, getFileSizeErrorMessage } from './config/upload'

export interface UploadRequest {
  mimeType: string
  sizeBytes: number
  ext?: string
  entity: 'sale' | 'profile'
  entityId?: string
}

export interface UploadResponse {
  uploadUrl: string
  publicUrl: string
  expiresIn: number
  objectKey: string
}

export interface UploadResult {
  success: boolean
  publicUrl?: string
  error?: string
}

/**
 * Request a signed upload URL from the server
 */
export async function requestSignedUploadUrl(request: UploadRequest): Promise<UploadResponse> {
  const response = await fetch('/api/upload/signed-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to get upload URL')
  }

  return response.json()
}

/**
 * Upload a file using a signed URL
 */
export async function uploadFile(
  file: File, 
  uploadUrl: string, 
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100
        onProgress(progress)
      }
    })
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    })
    
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'))
    })
    
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })
}

/**
 * Complete upload flow: get signed URL and upload file
 */
export async function uploadImage(
  file: File,
  entity: 'sale' | 'profile',
  entityId?: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  try {
    // Validate file
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Only JPEG, PNG, and WebP images are allowed'
      }
    }

    if (!isFileSizeValid(file.size)) {
      return {
        success: false,
        error: getFileSizeErrorMessage(file.size)
      }
    }

    // Get signed URL
    const uploadRequest: UploadRequest = {
      mimeType: file.type,
      sizeBytes: file.size,
      ext: file.name.split('.').pop(),
      entity,
      entityId
    }

    const { uploadUrl, publicUrl } = await requestSignedUploadUrl(uploadRequest)

    // Upload file
    await uploadFile(file, uploadUrl, onProgress)

    return {
      success: true,
      publicUrl
    }

  } catch (error) {
    console.error('Upload error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    }
  }
}
