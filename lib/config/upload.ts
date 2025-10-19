/**
 * Upload configuration module
 * 
 * This module provides upload-related configuration that is consistent
 * between client and server. The server owns the canonical limits, and
 * the client references them through this module to avoid drift.
 */

// Default upload size limit (5MB in bytes)
const DEFAULT_MAX_UPLOAD_SIZE = 5242880

/**
 * Get the maximum upload size in bytes
 * 
 * This should match the server's MAX_UPLOAD_SIZE_BYTES environment variable.
 * The server enforces this limit, and the client uses it for UI validation
 * and error messages to provide consistent user experience.
 */
export function getMaxUploadSize(): number {
  // In a real implementation, this could fetch from a server endpoint
  // or be injected at build time. For now, we use the same default
  // as the server to maintain consistency.
  return DEFAULT_MAX_UPLOAD_SIZE
}

/**
 * Get the maximum upload size in MB for display purposes
 */
export function getMaxUploadSizeMB(): number {
  return Math.round(getMaxUploadSize() / 1024 / 1024)
}

/**
 * Check if a file size is within the upload limit
 */
export function isFileSizeValid(sizeBytes: number): boolean {
  return sizeBytes <= getMaxUploadSize()
}

/**
 * Get a human-readable error message for file size validation
 */
export function getFileSizeErrorMessage(sizeBytes: number): string {
  const maxSize = getMaxUploadSize()
  const maxSizeMB = getMaxUploadSizeMB()
  
  if (sizeBytes > maxSize) {
    return `File size must be less than ${maxSizeMB}MB`
  }
  
  return ''
}
