import { test, expect } from '@playwright/test'

test.describe('Cluster Drilldown E2E', () => {
  test('basic page load and intent check', async ({ page }) => {
    await page.goto('/sales')
    
    // Wait for the page to load
    await expect(page.getByTestId('sales-root')).toBeVisible()
    
    // Check that the initial intent is set
    await expect(page.getByTestId('sales-root')).toHaveAttribute('data-debug-intent', /Filters/)
    
    // Basic check that the page is responsive
    await expect(page.getByTestId('sales-root')).toBeVisible()
  })

  test('expects page to be responsive after load', async ({ page }) => {
    await page.goto('/sales')
    
    // Wait for the page to load
    await expect(page.getByTestId('sales-root')).toBeVisible()
    
    // Wait a bit for any async operations to complete
    await page.waitForTimeout(1000)
    
    // Check that the page is still responsive
    await expect(page.getByTestId('sales-root')).toBeVisible()
  })
})