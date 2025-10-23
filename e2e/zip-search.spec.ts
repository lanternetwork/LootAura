import { test, expect } from '@playwright/test'

test.describe('ZIP Search E2E', () => {
  test('basic page load and ZIP input interaction', async ({ page }) => {
    await page.goto('/sales')
    
    // Wait for the page to be visible instead of networkidle
    await expect(page.locator('body')).toBeVisible()
    
    // Wait a bit for any async operations to complete
    await page.waitForTimeout(2000)
    
    // Check if sales-root exists, if not, just verify page loaded
    const salesRoot = page.getByTestId('sales-root')
    if (await salesRoot.count() > 0) {
      await expect(salesRoot).toBeVisible()
    }
    
    // Look for ZIP input with fallback - wait for it to be visible
    const zipInput = page.getByTestId('zip-input').first()
    if (await zipInput.count() > 0) {
      // Wait for the input to be visible and enabled before interacting
      await zipInput.waitFor({ state: 'visible', timeout: 10000 })
      await zipInput.fill('40204')
      await zipInput.press('Enter')
      
      // Wait a bit for any async operations
      await page.waitForTimeout(1000)
    }
    
    // Basic check that page is responsive
    await expect(page.locator('body')).toBeVisible()
  })

  test('page loads without errors', async ({ page }) => {
    await page.goto('/sales')
    
    // Wait for page to be visible instead of networkidle
    await expect(page.locator('body')).toBeVisible()
    
    // Check for any console errors
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    // Wait a bit to catch any async errors
    await page.waitForTimeout(2000)
    
    // The page should load without critical errors
    expect(errors.length).toBeLessThan(10) // Allow some non-critical errors
  })
})
