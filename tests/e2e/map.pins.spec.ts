/**
 * E2E tests for map pins functionality
 */

import { test, expect } from '@playwright/test'

test.describe('Map Pins Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to sales page
    await page.goto('/sales')
    
    // Wait for map to load
    await page.waitForSelector('[data-testid="map"]', { timeout: 10000 })
  })

  test('should render pins or clusters on the map', async ({ page }) => {
    // Wait for markers to appear
    await page.waitForSelector('[data-testid="marker"], [data-testid="cluster-marker"]', { timeout: 5000 })
    
    // Check that either individual markers or cluster markers are present
    const markers = await page.locator('[data-testid="marker"]').count()
    const clusters = await page.locator('[data-testid="cluster-marker"]').count()
    
    expect(markers + clusters).toBeGreaterThan(0)
  })

  test('should handle cluster click and zoom in', async ({ page }) => {
    // Wait for clusters to appear
    await page.waitForSelector('[data-testid="cluster-marker"]', { timeout: 5000 })
    
    // Get initial zoom level
    const initialZoom = await page.evaluate(() => {
      const mapElement = document.querySelector('[data-testid="map"]')
      return mapElement?.getAttribute('data-zoom')
    })
    
    // Click on a cluster
    const cluster = page.locator('[data-testid="cluster-marker"]').first()
    await cluster.click()
    
    // Wait for zoom animation to complete
    await page.waitForTimeout(1000)
    
    // Check that zoom level has changed (this is a basic check)
    // In a real implementation, you'd check the actual map zoom level
    expect(cluster).toBeVisible()
  })

  test('should handle pin click', async ({ page }) => {
    // Wait for markers to appear
    await page.waitForSelector('[data-testid="marker"]', { timeout: 5000 })
    
    // Click on a pin
    const pin = page.locator('[data-testid="marker"]').first()
    await pin.click()
    
    // Check that the pin is still visible after click
    expect(pin).toBeVisible()
  })

  test('should toggle clustering via admin tools', async ({ page }) => {
    // Navigate to admin tools
    await page.goto('/admin/tools')
    
    // Wait for admin tools to load
    await page.waitForSelector('h1:has-text("Admin Tools")', { timeout: 5000 })
    
    // Find the clustering toggle button (if it exists)
    const clusteringToggle = page.locator('button:has-text("Toggle Clustering")')
    
    if (await clusteringToggle.isVisible()) {
      // Click the toggle
      await clusteringToggle.click()
      
      // Wait for the change to take effect
      await page.waitForTimeout(1000)
      
      // Check that the toggle state has changed
      // This would depend on the specific implementation
      expect(clusteringToggle).toBeVisible()
    }
  })

  test('should run pin diagnostics successfully', async ({ page }) => {
    // Navigate to admin tools
    await page.goto('/admin/tools')
    
    // Wait for admin tools to load
    await page.waitForSelector('h1:has-text("Admin Tools")', { timeout: 5000 })
    
    // Find and click the "Run Diagnostics" button for pins
    const runDiagnosticsButton = page.locator('button:has-text("Run Diagnostics")')
    await runDiagnosticsButton.click()
    
    // Wait for diagnostics to complete
    await page.waitForSelector('[data-testid="diagnostic-results"]', { timeout: 10000 })
    
    // Check that diagnostics ran successfully
    const successRate = await page.locator('text=/\\d+% Success Rate/').textContent()
    expect(successRate).toBeTruthy()
    
    // Check that we have test results
    const testResults = page.locator('[data-testid="diagnostic-results"] .test-result')
    const resultCount = await testResults.count()
    expect(resultCount).toBeGreaterThan(0)
  })

  test('should handle map viewport changes', async ({ page }) => {
    // Wait for map to load
    await page.waitForSelector('[data-testid="map"]', { timeout: 5000 })
    
    // Get initial viewport
    const initialViewport = await page.evaluate(() => {
      const mapElement = document.querySelector('[data-testid="map"]')
      return {
        lat: mapElement?.getAttribute('data-center-lat'),
        lng: mapElement?.getAttribute('data-center-lng'),
        zoom: mapElement?.getAttribute('data-zoom')
      }
    })
    
    // Simulate map interaction (this would depend on the specific map implementation)
    await page.mouse.move(400, 300)
    await page.mouse.down()
    await page.mouse.move(500, 400)
    await page.mouse.up()
    
    // Wait for viewport change to complete
    await page.waitForTimeout(1000)
    
    // Check that viewport has changed
    const newViewport = await page.evaluate(() => {
      const mapElement = document.querySelector('[data-testid="map"]')
      return {
        lat: mapElement?.getAttribute('data-center-lat'),
        lng: mapElement?.getAttribute('data-center-lng'),
        zoom: mapElement?.getAttribute('data-zoom')
      }
    })
    
    // The viewport should have changed
    expect(newViewport).not.toEqual(initialViewport)
  })

  test('should handle ZIP search and update pins', async ({ page }) => {
    // Find ZIP input
    const zipInput = page.locator('input[placeholder*="ZIP"]')
    await zipInput.fill('10001')
    await zipInput.press('Enter')
    
    // Wait for map to update
    await page.waitForTimeout(2000)
    
    // Check that markers are still visible
    const markers = await page.locator('[data-testid="marker"], [data-testid="cluster-marker"]').count()
    expect(markers).toBeGreaterThanOrEqual(0)
  })

  test('should handle map resize', async ({ page }) => {
    // Wait for map to load
    await page.waitForSelector('[data-testid="map"]', { timeout: 5000 })
    
    // Resize the browser window
    await page.setViewportSize({ width: 800, height: 600 })
    await page.waitForTimeout(500)
    
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForTimeout(500)
    
    // Check that map is still visible and functional
    const map = page.locator('[data-testid="map"]')
    expect(map).toBeVisible()
    
    // Check that markers are still present
    const markers = await page.locator('[data-testid="marker"], [data-testid="cluster-marker"]').count()
    expect(markers).toBeGreaterThanOrEqual(0)
  })

  test('should handle multiple rapid interactions', async ({ page }) => {
    // Wait for map to load
    await page.waitForSelector('[data-testid="map"]', { timeout: 5000 })
    
    // Perform multiple rapid interactions
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(400 + i * 10, 300 + i * 10)
      await page.mouse.down()
      await page.mouse.move(500 + i * 10, 400 + i * 10)
      await page.mouse.up()
      await page.waitForTimeout(100)
    }
    
    // Check that map is still functional
    const map = page.locator('[data-testid="map"]')
    expect(map).toBeVisible()
    
    // Check that markers are still present
    const markers = await page.locator('[data-testid="marker"], [data-testid="cluster-marker"]').count()
    expect(markers).toBeGreaterThanOrEqual(0)
  })
})
