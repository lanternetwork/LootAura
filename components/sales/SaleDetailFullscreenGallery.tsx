'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { isTrustedNextImageHost } from '@/lib/images/isTrustedNextImageHost'

export function stepGalleryIndex(current: number, length: number, direction: 'prev' | 'next'): number {
  if (length <= 0) return 0
  if (direction === 'prev') {
    return current === 0 ? length - 1 : current - 1
  }
  return (current + 1) % length
}

type SaleDetailFullscreenGalleryProps = {
  open: boolean
  onClose: () => void
  images: string[]
  selectedIndex: number
  onSelectedIndexChange: (index: number) => void
  imageAlt: string
  failedUrls: ReadonlySet<string>
  onImageLoad?: (url: string) => void
  onImageError?: (url: string) => void
}

export default function SaleDetailFullscreenGallery({
  open,
  onClose,
  images,
  selectedIndex,
  onSelectedIndexChange,
  imageAlt,
  failedUrls,
  onImageLoad,
  onImageError,
}: SaleDetailFullscreenGalleryProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 100)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open || images.length === 0) return null

  const url = images[selectedIndex]
  if (!url || failedUrls.has(url)) return null

  const canNavigate = images.length > 1
  const counterLabel = `${selectedIndex + 1} / ${images.length}`

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-black/90"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Sale image gallery"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm text-white/80">{counterLabel}</span>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/15 px-3 py-2 text-sm font-medium text-white hover:bg-white/25 transition-colors"
          aria-label="Close image gallery"
        >
          Close
        </button>
      </div>

      <div
        className="relative flex flex-1 min-h-0 items-center justify-center px-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        {canNavigate && (
          <button
            type="button"
            aria-label="Previous sale image"
            className="absolute left-2 sm:left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-medium text-gray-900 shadow"
            onClick={() => onSelectedIndexChange(stepGalleryIndex(selectedIndex, images.length, 'prev'))}
          >
            Prev
          </button>
        )}

        <div className="relative w-full h-full max-w-5xl max-h-[85vh] flex items-center justify-center">
          {isTrustedNextImageHost(url) ? (
            <Image
              src={url}
              alt={imageAlt}
              fill
              className="object-contain"
              sizes="100vw"
              priority
              data-testid="sale-detail-fullscreen-image"
              onLoad={() => onImageLoad?.(url)}
              onError={() => onImageError?.(url)}
            />
          ) : (
            <img
              src={url}
              alt={imageAlt}
              data-testid="sale-detail-fullscreen-image"
              className="max-h-[85vh] max-w-full object-contain"
              referrerPolicy="no-referrer"
              onLoad={() => onImageLoad?.(url)}
              onError={() => onImageError?.(url)}
            />
          )}
        </div>

        {canNavigate && (
          <button
            type="button"
            aria-label="Next sale image"
            className="absolute right-2 sm:right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-sm font-medium text-gray-900 shadow"
            onClick={() => onSelectedIndexChange(stepGalleryIndex(selectedIndex, images.length, 'next'))}
          >
            Next
          </button>
        )}
      </div>
    </div>
  )
}
