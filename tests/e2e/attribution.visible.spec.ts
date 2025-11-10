/**
 * E2E tests for OSM attribution visibility
 */

import { test, expect } from '@playwright/test'

test.describe('OSM Attribution Visibility', () => {
  test('should show OSM attribution on sales page map (bottom-right)', async ({ page }) => {
    // Navigate to sales page
    await page.goto('/sales')
    
    // Wait for map to load
    await page.waitForSelector('canvas', { timeout: 10000 })
    
    // Wait for attribution to appear
    const attribution = page.getByText('© OpenStreetMap contributors')
    await expect(attribution).toBeVisible({ timeout: 5000 })
    
    // Get the map container
    const mapContainer = page.locator('[class*="relative"]').filter({ has: page.locator('canvas') }).first()
    await expect(mapContainer).toBeVisible()
    
    // Get bounding box of map container
    const mapBox = await mapContainer.boundingBox()
    expect(mapBox).toBeTruthy()
    
    // Get bounding box of attribution
    const attributionBox = await attribution.boundingBox()
    expect(attributionBox).toBeTruthy()
    
    if (mapBox && attributionBox) {
      // Check that attribution is near bottom-right (within 24px tolerance)
      const distanceFromRight = mapBox.width - (attributionBox.x + attributionBox.width - mapBox.x)
      const distanceFromBottom = mapBox.height - (attributionBox.y + attributionBox.height - mapBox.y)
      
      expect(distanceFromRight).toBeLessThanOrEqual(24)
      expect(distanceFromBottom).toBeLessThanOrEqual(24)
    }
    
    // Verify the link has correct href
    const link = attribution.locator('a[href="https://www.openstreetmap.org/copyright"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('should show OSM attribution on hero map (top-right)', async ({ page }) => {
    // Navigate to home page
    await page.goto('/')
    
    // Wait for map preview section to load
    await page.waitForSelector('text=/Browse on the live map/i', { timeout: 10000 })
    
    // Scroll to map preview section
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('section')).find(s => 
        s.textContent?.includes('Browse on the live map')
      )
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
    
    // Wait for map to load
    await page.waitForSelector('canvas', { timeout: 10000 })
    
    // Wait for attribution to appear
    const attribution = page.getByText('© OpenStreetMap contributors')
    await expect(attribution).toBeVisible({ timeout: 5000 })
    
    // Get the map container
    const mapContainer = page.locator('[class*="relative"]').filter({ has: page.locator('canvas') }).first()
    await expect(mapContainer).toBeVisible()
    
    // Get bounding box of map container
    const mapBox = await mapContainer.boundingBox()
    expect(mapBox).toBeTruthy()
    
    // Get bounding box of attribution
    const attributionBox = await attribution.boundingBox()
    expect(attributionBox).toBeTruthy()
    
    if (mapBox && attributionBox) {
      // Check that attribution is near top-right (within 24px tolerance)
      const distanceFromRight = mapBox.width - (attributionBox.x + attributionBox.width - mapBox.x)
      const distanceFromTop = attributionBox.y - mapBox.y
      
      expect(distanceFromRight).toBeLessThanOrEqual(24)
      expect(distanceFromTop).toBeLessThanOrEqual(24)
    }
    
    // Verify the link has correct href
    const link = attribution.locator('a[href="https://www.openstreetmap.org/copyright"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('should not block map gestures', async ({ page }) => {
    // Navigate to sales page
    await page.goto('/sales')
    
    // Wait for map to load
    await page.waitForSelector('canvas', { timeout: 10000 })
    
    // Wait for attribution to appear
    const attribution = page.getByText('© OpenStreetMap contributors')
    await expect(attribution).toBeVisible({ timeout: 5000 })
    
    // Get the map container
    const mapContainer = page.locator('[class*="relative"]').filter({ has: page.locator('canvas') }).first()
    
    // Try to pan the map by clicking and dragging
    const mapBox = await mapContainer.boundingBox()
    expect(mapBox).toBeTruthy()
    
    if (mapBox) {
      // Click in the center of the map
      await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(mapBox.x + mapBox.width / 2 + 50, mapBox.y + mapBox.height / 2 + 50)
      await page.mouse.up()
      
      // Wait a bit for map to update
      await page.waitForTimeout(500)
      
      // Map should still be visible and functional
      await expect(mapContainer).toBeVisible()
    }
  })

  test('should be visible on mobile widths', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Navigate to sales page
    await page.goto('/sales')
    
    // Wait for map to load
    await page.waitForSelector('canvas', { timeout: 10000 })
    
    // Wait for attribution to appear
    const attribution = page.getByText('© OpenStreetMap contributors')
    await expect(attribution).toBeVisible({ timeout: 5000 })
    
    // Verify it's still clickable
    const link = attribution.locator('a[href="https://www.openstreetmap.org/copyright"]')
    await expect(link).toBeVisible()
  })
})

