'use client'

import { useEffect } from 'react'

/**
 * Google Site Verification Meta Tag Injector
 * 
 * Injects the Google site verification meta tag into the document head.
 * This is a client-side fallback since Next.js App Router doesn't fully support
 * custom head tags in the layout.
 */
export default function GoogleVerificationMeta() {
  useEffect(() => {
    const verificationCode = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    
    if (!verificationCode) {
      return
    }
    
    // Check if meta tag already exists
    const existingMeta = document.querySelector('meta[name="google-site-verification"]')
    if (existingMeta) {
      // Update content if it exists but has wrong value
      if (existingMeta.getAttribute('content') !== verificationCode) {
        existingMeta.setAttribute('content', verificationCode)
      }
      return
    }
    
    // Create and inject the meta tag
    const meta = document.createElement('meta')
    meta.name = 'google-site-verification'
    meta.content = verificationCode
    document.head.appendChild(meta)
    
    // Cleanup function
    return () => {
      const metaToRemove = document.querySelector('meta[name="google-site-verification"]')
      if (metaToRemove && metaToRemove.getAttribute('content') === verificationCode) {
        metaToRemove.remove()
      }
    }
  }, [])
  
  // This component renders nothing
  return null
}

