'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'react-toastify'
import { buildShareTargets, type ShareTarget } from '@/lib/share/buildShareUrls'
import { analytics } from '@/lib/analytics'

interface SaleShareButtonProps {
  url: string
  title: string
  text?: string
  saleId: string
}

/**
 * Check if device is mobile
 */
function isMobile(): boolean {
  if (typeof window === 'undefined') return false
  
  // Check user agent
  const ua = navigator.userAgent
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
  if (mobileRegex.test(ua)) return true
  
  // Check navigator.userAgentData if available (experimental API)
  if ('userAgentData' in navigator) {
    const userAgentData = (navigator as any).userAgentData
    if (userAgentData?.mobile) {
      return true
    }
  }
  
  // Check screen width as fallback
  return window.innerWidth < 768
}

/**
 * Check if Web Share API is available and usable
 */
function isWebShareAvailable(): boolean {
  if (typeof window === 'undefined' || !navigator.share) return false
  
  // Safari on desktop has restrictions - check if it's actually usable
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  const isDesktop = !isMobile()
  
  // Safari desktop has limited Web Share support
  if (isSafari && isDesktop) {
    return false
  }
  
  return true
}

export default function SaleShareButton({ url, title, text, saleId }: SaleShareButtonProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const webShareAvailable = isWebShareAvailable()
  const mobile = isMobile()
  const shareTargets = buildShareTargets({ url, title, text })

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isMenuOpen])

  // Close menu on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isMenuOpen) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [isMenuOpen])

  const handleWebShare = async () => {
    if (!navigator.share) return

    try {
      await navigator.share({
        title,
        text: text || title,
        url,
      })
      
      // Track analytics
      analytics.trackShare(saleId, 'webshare')
    } catch (error: any) {
      // User canceled or error occurred
      if (error.name !== 'AbortError') {
        console.error('Error sharing:', error)
      }
      // Silently handle AbortError (user canceled)
    }
  }

  const handleCopyLink = async (target: ShareTarget) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(target.url)
        toast.success('Link copied to clipboard')
        
        // Track analytics
        analytics.trackShare(saleId, 'copy')
      } else if (document.execCommand) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea')
        textArea.value = target.url
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        textArea.style.left = '-9999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const success = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (success) {
          toast.success('Link copied to clipboard')
          analytics.trackShare(saleId, 'copy')
        } else {
          throw new Error('Copy command failed')
        }
      } else {
        throw new Error('Clipboard API not available')
      }
      setIsMenuOpen(false)
    } catch (error) {
      console.error('Failed to copy link:', error)
      toast.error('Failed to copy link')
    }
  }

  const handleShareTarget = (target: ShareTarget) => {
    if (target.action === 'copy') {
      handleCopyLink(target)
      return
    }

    // Open share URL in new window
    window.open(target.url, '_blank', 'noopener,noreferrer')
    
    // Track analytics
    const provider = target.id === 'twitter' ? 'twitter' : target.id === 'facebook' ? 'facebook' : target.id === 'reddit' ? 'reddit' : target.id === 'whatsapp' ? 'whatsapp' : target.id === 'email' ? 'email' : target.id === 'sms' ? 'sms' : 'unknown'
    analytics.trackShare(saleId, provider)
    
    setIsMenuOpen(false)
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    // Check for modifier keys (Alt, Ctrl, Meta) or long press to show menu
    const isModifierKey = e.altKey || e.ctrlKey || e.metaKey
    
    if (webShareAvailable && !isModifierKey) {
      // Primary action: Web Share API
      handleWebShare()
    } else {
      // Fallback: Show menu
      setIsMenuOpen(!isMenuOpen)
    }
  }

  // Filter targets based on mobile/desktop
  // Also filter out Copy Link if clipboard is not available
  const hasClipboard = typeof navigator !== 'undefined' && 
    (navigator.clipboard?.writeText || document.execCommand)
  
  const visibleTargets = shareTargets.filter(target => {
    if (target.mobileOnly && !mobile) return false
    if (target.action === 'copy' && !hasClipboard) return false
    return true
  })

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-label="Share sale"
        className="inline-flex items-center px-4 py-2 rounded-lg font-medium transition-colors min-h-[44px] bg-[rgba(147,51,234,0.15)] text-[#3A2268] hover:bg-[rgba(147,51,234,0.25)] focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
      >
        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
        </svg>
        Share
        {webShareAvailable && (
          <svg className="w-4 h-4 ml-1 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isMenuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1"
          role="menu"
          aria-orientation="vertical"
        >
          {visibleTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={() => handleShareTarget(target)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus:bg-gray-100"
              role="menuitem"
              aria-label={`Share via ${target.label}`}
            >
              {target.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

