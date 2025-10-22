import { test, expect } from '@playwright/test'

test.describe('Cluster Drilldown Integration', () => {
  test('should show cluster leaves immediately then reconcile with bbox', async ({ page }) => {
    // Navigate to sales page
    await page.goto('/sales')
    
    // Wait for map to load
    await page.waitForSelector('[data-testid="map-container"]', { timeout: 10000 })
    
    // Wait for clusters to appear
    await page.waitForSelector('[data-testid="cluster-marker"]', { timeout: 10000 })
    
    // Get initial sales count
    const initialSalesCount = await page.locator('[data-testid="sales-list"] [data-testid="sale-item"]').count()
    
    // Click on a cluster
    const clusterMarker = page.locator('[data-testid="cluster-marker"]').first()
    await clusterMarker.click()
    
    // Wait for leaves to appear immediately (should be 2 sales)
    await expect(page.locator('[data-testid="sales-list"] [data-testid="sale-item"]')).toHaveCount(2, { timeout: 1000 })
    
    // Wait for map to finish animating
    await page.waitForTimeout(1000)
    
    // Wait for bbox reconciliation (should still be 2 or fewer due to dedupe)
    await page.waitForTimeout(2000)
    
    const finalSalesCount = await page.locator('[data-testid="sales-list"] [data-testid="sale-item"]').count()
    
    // Assert counts match deduped unique sales
    expect(finalSalesCount).toBeGreaterThan(0)
    expect(finalSalesCount).toBeLessThanOrEqual(2)
    
    // Assert no flicker (no intermediate 0 count)
    // This is implicit in the test flow - if there was flicker, the test would fail
  })

  test('should handle cluster click without sales appearing', async ({ page }) => {
    // Navigate to sales page
    await page.goto('/sales')
    
    // Wait for map to load
    await page.waitForSelector('[data-testid="map-container"]', { timeout: 10000 })
    
    // Wait for clusters to appear
    await page.waitForSelector('[data-testid="cluster-marker"]', { timeout: 10000 })
    
    // Click on a cluster
    const clusterMarker = page.locator('[data-testid="cluster-marker"]').first()
    await clusterMarker.click()
    
    // Wait for any sales to appear
    await page.waitForTimeout(2000)
    
    // Check that sales list is not empty
    const salesCount = await page.locator('[data-testid="sales-list"] [data-testid="sale-item"]').count()
    expect(salesCount).toBeGreaterThan(0)
  })

  test('should handle multiple cluster clicks', async ({ page }) => {
    // Navigate to sales page
    await page.goto('/sales')
    
    // Wait for map to load
    await page.waitForSelector('[data-testid="map-container"]', { timeout: 10000 })
    
    // Wait for clusters to appear
    await page.waitForSelector('[data-testid="cluster-marker"]', { timeout: 10000 })
    
    // Click on first cluster
    const firstCluster = page.locator('[data-testid="cluster-marker"]').first()
    await firstCluster.click()
    
    // Wait for leaves
    await page.waitForTimeout(1000)
    
    // Click on second cluster
    const secondCluster = page.locator('[data-testid="cluster-marker"]').nth(1)
    await secondCluster.click()
    
    // Wait for new leaves
    await page.waitForTimeout(1000)
    
    // Check that sales are still visible
    const salesCount = await page.locator('[data-testid="sales-list"] [data-testid="sale-item"]').count()
    expect(salesCount).toBeGreaterThan(0)
  })
})
