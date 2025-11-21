/**
 * Unit tests for AdSense ad components
 * 
 * Tests verify that:
 * - Ad components render nothing when ads are disabled
 * - Ad components render correctly when ads are enabled
 * - Non-personalized ads attribute is present
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'

// Mock ENV_PUBLIC with a mutable object
const mockEnvPublic = {
  NEXT_PUBLIC_ENABLE_ADSENSE: false,
}

vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual('@/lib/env')
  return {
    ...actual,
    ENV_PUBLIC: mockEnvPublic,
    isProduction: () => true,
  }
})

// Mock window.adsbygoogle
Object.defineProperty(global, 'window', {
  value: {
    adsbygoogle: [],
  },
  writable: true,
  configurable: true,
})

describe('AdSense Components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset ads enabled state
    mockEnvPublic.NEXT_PUBLIC_ENABLE_ADSENSE = false
    // Reset window mock
    if (global.window) {
      (global.window as any).adsbygoogle = []
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('SaleDetailBannerAd', () => {
    it('should render nothing when ads are disabled', async () => {
      mockEnvPublic.NEXT_PUBLIC_ENABLE_ADSENSE = false
      
      const { SaleDetailBannerAd } = await import('@/components/ads/AdSlots')
      const { container } = render(<SaleDetailBannerAd />)
      
      expect(container.firstChild).toBeNull()
    })

    it('should render ad slot when ads are enabled', async () => {
      mockEnvPublic.NEXT_PUBLIC_ENABLE_ADSENSE = true
      
      // Mock window
      Object.defineProperty(global, 'window', {
        value: {
          adsbygoogle: [],
        },
        writable: true,
        configurable: true,
      })
      
      const { SaleDetailBannerAd } = await import('@/components/ads/AdSlots')
      const { container } = render(<SaleDetailBannerAd />)
      
      // Should render the container div
      expect(container.firstChild).toBeTruthy()
    })
  })

  describe('MobileListInlineAd', () => {
    it('should render nothing when ads are disabled', async () => {
      mockEnvPublic.NEXT_PUBLIC_ENABLE_ADSENSE = false
      
      const { MobileListInlineAd } = await import('@/components/ads/AdSlots')
      const { container } = render(<MobileListInlineAd />)
      
      expect(container.firstChild).toBeNull()
    })
  })

  describe('ListInlineAd', () => {
    it('should render nothing when ads are disabled', async () => {
      mockEnvPublic.NEXT_PUBLIC_ENABLE_ADSENSE = false
      
      const { ListInlineAd } = await import('@/components/ads/AdSlots')
      const { container } = render(<ListInlineAd />)
      
      expect(container.firstChild).toBeNull()
    })
  })

  describe('DesktopFooterAd', () => {
    it('should render nothing when ads are disabled', async () => {
      mockEnvPublic.NEXT_PUBLIC_ENABLE_ADSENSE = false
      
      // Mock usePathname to return home
      vi.mock('next/navigation', () => ({
        usePathname: () => '/',
      }))
      
      const { DesktopFooterAd } = await import('@/components/ads/AdSlots')
      const { container } = render(<DesktopFooterAd />)
      
      expect(container.firstChild).toBeNull()
    })
  })

  describe('AdSenseSlot - Non-personalized ads', () => {
    it('should include data-npa="1" attribute for non-personalized ads', async () => {
      mockEnvPublic.NEXT_PUBLIC_ENABLE_ADSENSE = true
      
      Object.defineProperty(global, 'window', {
        value: {
          adsbygoogle: [],
        },
        writable: true,
        configurable: true,
      })
      
      const AdSenseSlot = (await import('@/components/ads/AdSenseSlot')).default
      const { container } = render(
        <AdSenseSlot slot="1234567890" />
      )
      
      const insElement = container.querySelector('ins.adsbygoogle')
      expect(insElement).toBeTruthy()
      expect(insElement?.getAttribute('data-npa')).toBe('1')
    })
  })
})

