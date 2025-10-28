'use client'
import Image from 'next/image'
import { useState } from 'react'

interface OptimizedImageProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  priority?: boolean
  fill?: boolean
  sizes?: string
}

export default function OptimizedImage({
  src,
  alt,
  width = 300,
  height = 200,
  className = '',
  priority = false,
  fill = false,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Check if it's a Supabase storage URL - validate URL properly with allowlist
  const isSupabaseUrl = (() => {
    try {
      const url = new URL(src)
      const allowedHosts = [
        'supabase.co',
        'supabase.in', 
        'storage.googleapis.com'
      ]
      return allowedHosts.some(host => 
        url.hostname === host || 
        url.hostname.endsWith('.' + host)
      )
    } catch {
      return false
    }
  })()
  
  // Generate blur placeholder for Supabase URLs
  const blurDataURL = isSupabaseUrl 
    ? `data:image/svg+xml;base64,${Buffer.from(
        `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#f3f4f6"/>
          <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9ca3af" font-family="system-ui">Loading...</text>
        </svg>`
      ).toString('base64')}`
    : undefined

  if (hasError) {
    return (
      <div 
        className={`bg-neutral-200 flex items-center justify-center ${className}`}
        style={fill ? {} : { width, height }}
      >
        <div className="text-neutral-400 text-sm">Image unavailable</div>
      </div>
    )
  }

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={`object-cover transition-opacity duration-300 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        } ${className}`}
        priority={priority}
        sizes={sizes}
        placeholder={blurDataURL ? 'blur' : 'empty'}
        blurDataURL={blurDataURL}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false)
          setHasError(true)
        }}
      />
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={`transition-opacity duration-300 ${
        isLoading ? 'opacity-0' : 'opacity-100'
      } ${className}`}
      priority={priority}
      sizes={sizes}
      placeholder={blurDataURL ? 'blur' : 'empty'}
      blurDataURL={blurDataURL}
      onLoad={() => setIsLoading(false)}
      onError={() => {
        setIsLoading(false)
        setHasError(true)
      }}
    />
  )
}
