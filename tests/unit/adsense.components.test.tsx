/**
 * Unit tests for AdSense ad components
 * 
 * Tests verify that:
 * - Ad components are properly structured
 * - Non-personalized ads attribute is present in AdSenseSlot
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('AdSense Components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Component structure', () => {
    it('SaleDetailBannerAd should be exported and be a function', () => {
      const { SaleDetailBannerAd } = require('@/components/ads/AdSlots')
      expect(SaleDetailBannerAd).toBeDefined()
      expect(typeof SaleDetailBannerAd).toBe('function')
    })

    it('MobileListInlineAd should be exported and be a function', () => {
      const { MobileListInlineAd } = require('@/components/ads/AdSlots')
      expect(MobileListInlineAd).toBeDefined()
      expect(typeof MobileListInlineAd).toBe('function')
    })

    it('ListInlineAd should be exported and be a function', () => {
      const { ListInlineAd } = require('@/components/ads/AdSlots')
      expect(ListInlineAd).toBeDefined()
      expect(typeof ListInlineAd).toBe('function')
    })

    it('DesktopFooterAd should be exported and be a function', () => {
      const { DesktopFooterAd } = require('@/components/ads/AdSlots')
      expect(DesktopFooterAd).toBeDefined()
      expect(typeof DesktopFooterAd).toBe('function')
    })
  })

  describe('AdSenseSlot - Non-personalized ads', () => {
    it('should be exported and be a function', () => {
      const AdSenseSlot = require('@/components/ads/AdSenseSlot').default
      expect(AdSenseSlot).toBeDefined()
      expect(typeof AdSenseSlot).toBe('function')
    })

    it('should have data-npa attribute in component code', () => {
      // Read the source file to verify data-npa is present
      const fs = require('fs')
      const path = require('path')
      const filePath = path.join(process.cwd(), 'components', 'ads', 'AdSenseSlot.tsx')
      const fileContent = fs.readFileSync(filePath, 'utf-8')
      
      // Verify non-personalized ads attribute is present
      expect(fileContent).toContain('data-npa="1"')
    })
  })
})
