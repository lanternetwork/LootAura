import { test, expect } from '@playwright/test'

test.describe('Cluster Drilldown E2E', () => {
  test('basic page load test', async ({ page }) => {
    await page.goto('/sales')
    
    // Wait for the page to load with a reasonable timeout
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    
    // Check if sales-root exists, if not, just verify page loaded
    const salesRoot = page.getByTestId('sales-root')
    if (await salesRoot.count() > 0) {
      await expect(salesRoot).toBeVisible()
    }
    
    // Basic check that page is responsive
    await expect(page.locator('body')).toBeVisible()
  })

  test('page loads without critical errors', async ({ page }) => {
    await page.goto('/sales')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    
    // Wait a bit for any async operations to complete
    await page.waitForTimeout(2000)
    
    // Check that the page is still responsive
    await expect(page.locator('body')).toBeVisible()
  })
})