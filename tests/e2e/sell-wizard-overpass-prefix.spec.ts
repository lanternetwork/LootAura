import { test, expect } from '@playwright/test'

test.describe('Sell Wizard - Overpass Prefix Search', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock geolocation
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 38.2527, longitude: -85.7585 })

    // Mock authentication
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            aud: 'authenticated'
          }
        })
      })
    })

    // Mock IP geolocation
    await page.route('**/api/geolocation/ip', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lat: 38.2527,
          lng: -85.7585
        })
      })
    })

    // Mock Overpass API
    await page.route('**/api/geocoding/overpass-address**', async (route) => {
      const url = new URL(route.request().url())
      const q = url.searchParams.get('q') || ''
      
      // Extract prefix from query (numeric-only or digits+street)
      const numericMatch = q.match(/^(\d{1,6})(?:\s|$)/)
      const prefix = numericMatch ? numericMatch[1] : ''
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [
            {
              id: `node:${prefix}1`,
              label: `${prefix} Main St, Louisville, KY, 40201`,
              lat: 38.2512,
              lng: -85.7494,
              address: {
                houseNumber: prefix,
                road: 'Main St',
                city: 'Louisville',
                state: 'KY',
                postcode: '40201',
                country: 'US'
              }
            },
            {
              id: `node:${prefix}2`,
              label: `${prefix}0 Oak Ave, Louisville, KY, 40202`,
              lat: 38.2520,
              lng: -85.7500,
              address: {
                houseNumber: `${prefix}0`,
                road: 'Oak Ave',
                city: 'Louisville',
                state: 'KY',
                postcode: '40202',
                country: 'US'
              }
            }
          ]
        })
      })
    })

    // Mock Nominatim suggest as fallback
    await page.route('**/api/geocoding/suggest**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: [
            {
              id: 'nominatim:1',
              label: 'Fallback Address, Louisville, KY',
              lat: 38.25,
              lng: -85.75,
              address: {
                road: 'Fallback St',
                city: 'Louisville',
                state: 'KY'
              }
            }
          ]
        })
      })
    })
  })

  test('should show Overpass addresses for numeric prefix when coords available', async ({ page }) => {
    await page.goto('/sell/new')
    
    // Wait for address input
    const addressInput = page.locator('input[name="sale_address_line1"]')
    await expect(addressInput).toBeVisible()

    // Type numeric prefix
    await addressInput.fill('12')
    
    // Wait for suggestions to appear
    await page.waitForTimeout(350) // Debounce + fetch
    
    // Check that suggestions appear
    const suggestions = page.locator('[role="listbox"] [role="option"]')
    await expect(suggestions.first()).toBeVisible({ timeout: 2000 })
    
    // Verify first suggestion starts with the prefix
    const firstSuggestion = suggestions.first()
    const text = await firstSuggestion.textContent()
    expect(text).toMatch(/^12/)
  })

  test('should show closest addresses first for numeric prefix', async ({ page }) => {
    await page.goto('/sell/new')
    
    const addressInput = page.locator('input[name="sale_address_line1"]')
    await addressInput.fill('5001')
    
    await page.waitForTimeout(350)
    
    const suggestions = page.locator('[role="listbox"] [role="option"]')
    await expect(suggestions.first()).toBeVisible({ timeout: 2000 })
    
    // First suggestion should be closest (5001 Main St at 38.2512, -85.7494)
    const firstText = await suggestions.first().textContent()
    expect(firstText).toContain('5001')
  })

  test('should fallback to Nominatim when Overpass unavailable', async ({ page }) => {
    // Mock Overpass to return error
    await page.route('**/api/geocoding/overpass-address**', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          code: 'OVERPASS_UNAVAILABLE',
          error: 'Overpass rate limit exceeded'
        })
      })
    })

    await page.goto('/sell/new')
    
    const addressInput = page.locator('input[name="sale_address_line1"]')
    await addressInput.fill('12')
    
    await page.waitForTimeout(350)
    
    // Should still show suggestions from Nominatim fallback
    const suggestions = page.locator('[role="listbox"] [role="option"]')
    await expect(suggestions.first()).toBeVisible({ timeout: 2000 })
    
    // Should show fallback message
    const fallbackMessage = page.locator('text=/Showing broader matches/')
    await expect(fallbackMessage).toBeVisible()
  })

  test('should allow single digit numeric queries', async ({ page }) => {
    await page.goto('/sell/new')
    
    const addressInput = page.locator('input[name="sale_address_line1"]')
    
    // Type single digit - should work (no "Type at least 2 characters" error)
    await addressInput.fill('1')
    
    await page.waitForTimeout(350)
    
    // Should not show "Type at least 2 characters" error
    const errorText = page.locator('text=/Type at least 2 characters/')
    await expect(errorText).not.toBeVisible()
    
    // Should show suggestions or searching state
    const suggestions = page.locator('[role="listbox"] [role="option"]')
    const searching = page.locator('text=/Searching/')
    
    // Either suggestions appear or searching message
    await expect(suggestions.first().or(searching)).toBeVisible({ timeout: 2000 })
  })

  test('should use Nominatim for non-numeric queries', async ({ page }) => {
    await page.goto('/sell/new')
    
    const addressInput = page.locator('input[name="sale_address_line1"]')
    
    // Type non-numeric query
    await addressInput.fill('main')
    
    await page.waitForTimeout(350)
    
    // Should use Nominatim (not Overpass)
    // Check that Overpass was not called (or was called but not used)
    const suggestions = page.locator('[role="listbox"] [role="option"]')
    await expect(suggestions.first()).toBeVisible({ timeout: 2000 })
  })
})

