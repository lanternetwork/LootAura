export function isTrustedNextImageHost(urlString: string): boolean {
  try {
    const u = new URL(urlString)
    if (u.protocol !== 'https:') return false
    const host = u.hostname.toLowerCase()
    if (host === 'res.cloudinary.com') return true
    if (host === 'storage.googleapis.com') return true
    if (host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) {
      return u.pathname.startsWith('/storage/v1/object/public/')
    }
    return false
  } catch {
    return false
  }
}
