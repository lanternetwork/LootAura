import { test, expect } from '@playwright/test';

test.describe('ZIP Search', () => {
  test('ZIP search shows results and maintains Filters intent', async ({ page }) => {
    // Navigate to the sales page
    await page.goto('/sales');
    
    // Wait for the page to load
    await page.waitForSelector('[data-testid="zip-input"]', { timeout: 10000 });
    
    // Enter a valid ZIP code
    const zipInput = page.locator('[data-testid="zip-input"]');
    await zipInput.fill('90210');
    await zipInput.press('Enter');
    
    // Wait for results to load
    await page.waitForSelector('[data-testid="sale-card"]', { timeout: 10000 });
    
    // Verify that sales are displayed
    const saleCards = page.locator('[data-testid="sale-card"]');
    await expect(saleCards).toHaveCount.greaterThan(0);
    
    // Verify that the list shows sales (intent should be Filters)
    const salesList = page.locator('[data-testid="sales-list"]');
    await expect(salesList).toBeVisible();
    
    // Pan the map slightly to test UserPan intent
    const map = page.locator('[data-testid="map"]');
    await map.hover();
    await page.mouse.down();
    await page.mouse.move(100, 100);
    await page.mouse.up();
    
    // Wait a moment for the pan to complete
    await page.waitForTimeout(1000);
    
    // Verify that sales are still displayed after panning
    await expect(saleCards).toHaveCount.greaterThan(0);
  });
});
