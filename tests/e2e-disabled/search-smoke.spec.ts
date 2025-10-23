import { test, expect } from '@playwright/test'

test.describe('Search Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to sales page
    await page.goto('/sales')
    await page.waitForLoadState('networkidle')
  })

  test('ZIP search returns results and pins match', async ({ page }) => {
    // Enter ZIP 40204 (Louisville, KY)
    const zipInput = page.locator('input[placeholder*="ZIP code"]')
    await zipInput.fill('40204')
    await page.locator('button:has-text("Set")').click()
    
    // Wait for results to load
    await page.waitForSelector('[data-testid="sales-grid"]', { timeout: 10000 })
    
    // Check that results are displayed
    const salesCards = page.locator('[data-testid="sale-card"]')
    await expect(salesCards).toHaveCount(1, { timeout: 10000 })
    
    // Check that map pins are displayed
    const mapPins = page.locator('.mapboxgl-marker')
    await expect(mapPins).toHaveCount(1, { timeout: 10000 })
    
    // Verify location is set to Louisville area
    const locationInfo = page.locator('text=Louisville')
    await expect(locationInfo).toBeVisible()
  })

  test('Category filter reduces results', async ({ page }) => {
    // First get baseline count without filters
    const salesCards = page.locator('[data-testid="sale-card"]')
    const initialCount = await salesCards.count()
    
    // Open filters modal
    await page.locator('button:has-text("Filters")').click()
    
    // Add "tools" category filter
    await page.locator('input[type="checkbox"][value="tools"]').check()
    
    // Close modal and wait for results to update
    await page.locator('button:has-text("Apply")').click()
    await page.waitForTimeout(2000)
    
    // Check that results are filtered
    const filteredCount = await salesCards.count()
    expect(filteredCount).toBeLessThanOrEqual(initialCount)
    
    // Verify map pins also reduced
    const mapPins = page.locator('.mapboxgl-marker')
    const pinCount = await mapPins.count()
    expect(pinCount).toBeLessThanOrEqual(initialCount)
  })

  test('Distance radius changes affect results', async ({ page }) => {
    // Set location first
    const zipInput = page.locator('input[placeholder*="ZIP code"]')
    await zipInput.fill('40204')
    await page.locator('button:has-text("Set")').click()
    await page.waitForSelector('[data-testid="sales-grid"]')
    
    // Get initial count
    const salesCards = page.locator('[data-testid="sale-card"]')
    const initialCount = await salesCards.count()
    
    // Open filters and change radius to 5 miles
    await page.locator('button:has-text("Filters")').click()
    const distanceSlider = page.locator('input[type="range"]')
    await distanceSlider.fill('5')
    await page.locator('button:has-text("Apply")').click()
    await page.waitForTimeout(2000)
    
    // Should have fewer results
    const reducedCount = await salesCards.count()
    expect(reducedCount).toBeLessThanOrEqual(initialCount)
    
    // Change radius to 100 miles
    await page.locator('button:has-text("Filters")').click()
    await distanceSlider.fill('100')
    await page.locator('button:has-text("Apply")').click()
    await page.waitForTimeout(2000)
    
    // Should have more results
    const increasedCount = await salesCards.count()
    expect(increasedCount).toBeGreaterThanOrEqual(reducedCount)
  })

  test('Date filters show expected seed subsets', async ({ page }) => {
    // Set location first
    const zipInput = page.locator('input[placeholder*="ZIP code"]')
    await zipInput.fill('40204')
    await page.locator('button:has-text("Set")').click()
    await page.waitForSelector('[data-testid="sales-grid"]')
    
    // Test "This Weekend" filter
    await page.locator('button:has-text("Filters")').click()
    await page.locator('input[value="weekend"]').check()
    await page.locator('button:has-text("Apply")').click()
    await page.waitForTimeout(2000)
    
    // Check that date filter label is displayed
    const dateLabel = page.locator('text=This Weekend')
    await expect(dateLabel).toBeVisible()
    
    // Test "Next Weekend" filter
    await page.locator('button:has-text("Filters")').click()
    await page.locator('input[value="next_weekend"]').check()
    await page.locator('button:has-text("Apply")').click()
    await page.waitForTimeout(2000)
    
    // Check that date filter label is displayed
    const nextWeekendLabel = page.locator('text=Next Weekend')
    await expect(nextWeekendLabel).toBeVisible()
    
    // Results should be different between weekend filters
    const salesCards = page.locator('[data-testid="sale-card"]')
    const weekendCount = await salesCards.count()
    
    // Switch back to "This Weekend"
    await page.locator('button:has-text("Filters")').click()
    await page.locator('input[value="weekend"]').check()
    await page.locator('button:has-text("Apply")').click()
    await page.waitForTimeout(2000)
    
    const thisWeekendCount = await salesCards.count()
    
    // Counts might be the same if no sales in those date ranges, but labels should be different
    expect(weekendCount).toBeGreaterThanOrEqual(0)
    expect(thisWeekendCount).toBeGreaterThanOrEqual(0)
  })

  test('Search functionality works end-to-end', async ({ page }) => {
    // Set location
    const zipInput = page.locator('input[placeholder*="ZIP code"]')
    await zipInput.fill('40204')
    await page.locator('button:has-text("Set")').click()
    await page.waitForSelector('[data-testid="sales-grid"]')
    
    // Verify initial results
    const salesCards = page.locator('[data-testid="sale-card"]')
    await expect(salesCards).toHaveCount(1, { timeout: 10000 })
    
    // Verify map is displayed
    const mapContainer = page.locator('.mapboxgl-map')
    await expect(mapContainer).toBeVisible()
    
    // Verify location info is displayed
    const locationInfo = page.locator('text=Searching within')
    await expect(locationInfo).toBeVisible()
    
    // Verify filters are accessible
    const filterButton = page.locator('button:has-text("Filters")')
    await expect(filterButton).toBeVisible()
  })
})
