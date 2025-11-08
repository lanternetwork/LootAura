// Server utilities for Cloudinary avatar uploads
// Do not expose secrets in client bundles.

export const allowedAvatarHosts = [
  'res.cloudinary.com',
]

export function isAllowedAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return allowedAvatarHosts.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

export function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret) {
    return null
  }
  return { cloudName, apiKey, apiSecret }
}


