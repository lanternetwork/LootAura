// Minimal Cloudinary URL validator used by API routes to guard image fields.
// Accept only HTTPS URLs under res.cloudinary.com/<cloud>/image/upload/**

export function getCloudinaryCloudName(): string | undefined {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || undefined
}

export function isAllowedImageUrl(url: string): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  if (parsed.hostname !== 'res.cloudinary.com') return false

  const cloud = getCloudinaryCloudName()
  if (!cloud) return false

  // Expect pathname starting with /<cloud>/image/upload/
  const expectedPrefix = `/${cloud}/image/upload/`
  return parsed.pathname.startsWith(expectedPrefix)
}


