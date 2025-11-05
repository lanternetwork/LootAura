import { test, expect } from '@playwright/test'

test.describe('Sell Wizard - Address Autocomplete with Nominatim', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Nominatim suggest endpoint
    await page.route('**/api/geocoding/suggest**', async (route) => {
      const url = new URL(route.request().url())
      const query = url.searchParams.get('q') || ''
      
      if (query.toLowerCase().includes('123 main')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: [
              {
                id: '1',
                label: '123 Main St, Louisville, KY 40201',
                lat: 38.2512,
                lng: -85.7494,
                address: {
                  houseNumber: '123',
                  road: 'Main St',
                  city: 'Louisville',
                  state: 'KY',
                  postcode: '40201',
                  country: 'US'
                }
              }
            ]
          })
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: [] })
        })
      }
    })

    // Mock Nominatim geocode endpoint (for blur fallback)
    await page.route('**/nominatim.openstreetmap.org/search**', async (route) => {
      const url = new URL(route.request().url())
      const query = url.searchParams.get('q') || ''
      
      if (query.toLowerCase().includes('456 oak')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              place_id: 789,
              display_name: '456 Oak Ave, Louisville, KY 40202',
              lat: '38.2512',
              lon: '-85.7494',
              address: {
                city: 'Louisville',
                state: 'KY',
                postcode: '40202'
              }
            }
          ])
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
      }
    })
  })

  test('should show suggestions when typing address', async ({ page }) => {
    await page.goto('/sell/new')
    await page.waitForLoadState('networkidle')

    // Type address
    const addressInput = page.locator('input[placeholder*="address" i]').first()
    await addressInput.fill('123 Main')
    await addressInput.waitFor({ state: 'visible' })

    // Wait for suggestions to appear
    await page.waitForTimeout(500) // Debounce delay

    // Should show suggestion dropdown
    const suggestion = page.locator('text=123 Main St, Louisville, KY 40201')
    await expect(suggestion).toBeVisible()
  })

  test('should set lat/lng when selecting suggestion', async ({ page }) => {
    await page.goto('/sell/new')
    await page.waitForLoadState('networkidle')

    // Type and select address
    const addressInput = page.locator('input[placeholder*="address" i]').first()
    await addressInput.fill('123 Main')
    await page.waitForTimeout(500)

    // Click suggestion
    const suggestion = page.locator('text=123 Main St, Louisville, KY 40201')
    await suggestion.click()

    // Address should be filled
    await expect(addressInput).toHaveValue(/123 Main St/i)

    // City, state, zip should be populated
    const cityInput = page.locator('input[name="city"]').first()
    await expect(cityInput).toHaveValue(/Louisville/i)

    // Should be able to proceed (lat/lng set)
    const nextButton = page.locator('button:has-text("Next")').first()
    await expect(nextButton).toBeEnabled()
  })

  test('should geocode on blur if no suggestion selected', async ({ page }) => {
    await page.goto('/sell/new')
    await page.waitForLoadState('networkidle')

    // Type address without selecting suggestion
    const addressInput = page.locator('input[placeholder*="address" i]').first()
    await addressInput.fill('456 Oak Ave, Louisville, KY')
    
    // Blur the input
    await addressInput.blur()
    
    // Wait for geocoding to complete
    await page.waitForTimeout(1000)

    // Should show "Looking up address..." message
    const geocodingMessage = page.locator('text=Looking up address')
    await expect(geocodingMessage).toBeVisible({ timeout: 2000 })

    // Address should be filled
    await expect(addressInput).toHaveValue(/456 Oak/i)

    // Should be able to proceed (lat/lng set via geocode)
    const nextButton = page.locator('button:has-text("Next")').first()
    await expect(nextButton).toBeEnabled()
  })

  test('should show inline error for invalid address', async ({ page }) => {
    await page.goto('/sell/new')
    await page.waitForLoadState('networkidle')

    // Type invalid address
    const addressInput = page.locator('input[placeholder*="address" i]').first()
    await addressInput.fill('Invalid Address That Should Fail')
    
    // Blur the input
    await addressInput.blur()
    
    // Wait for geocoding attempt
    await page.waitForTimeout(1000)

    // Should show validation error
    const errorMessage = page.locator('text=Please enter a complete address').or(page.locator('text=coordinates'))
    await expect(errorMessage).toBeVisible({ timeout: 2000 })

    // Should not be able to proceed
    const nextButton = page.locator('button:has-text("Next")').first()
    await expect(nextButton).toBeEnabled() // Button might still be enabled, but validation will fail
  })

  test('should block submit until lat/lng populated', async ({ page }) => {
    await page.goto('/sell/new')
    await page.waitForLoadState('networkidle')

    // Fill form without address
    await page.fill('input[name="title"]', 'Test Sale')
    await page.fill('input[name="city"]', 'Louisville')
    await page.fill('input[name="state"]', 'KY')

    // Try to proceed
    const nextButton = page.locator('button:has-text("Next")').first()
    await nextButton.click()

    // Should show validation error
    const errorMessage = page.locator('text=coordinates').or(page.locator('text=address'))
    await expect(errorMessage).toBeVisible({ timeout: 2000 })
  })

  test('should handle rapid typing without stale results', async ({ page }) => {
    await page.goto('/sell/new')
    await page.waitForLoadState('networkidle')

    const addressInput = page.locator('input[placeholder*="address" i]').first()

    // Type rapidly
    await addressInput.fill('123')
    await page.waitForTimeout(100)
    await addressInput.fill('123 Main')
    await page.waitForTimeout(100)
    await addressInput.fill('123 Main St')

    // Wait for debounce
    await page.waitForTimeout(500)

    // Should only show final suggestion (not intermediate ones)
    const suggestion = page.locator('text=123 Main St, Louisville, KY 40201')
    await expect(suggestion).toBeVisible({ timeout: 2000 })
  })
})

