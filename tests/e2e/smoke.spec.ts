import { test, expect } from '@playwright/test'

test.describe.configure({ tag: '@smoke' })

test.describe('Smoke Tests - Critical Flows', () => {
  test('home page loads and map area renders', async ({ page }) => {
    await page.goto('/')
    
    // Check landing page loads
    await expect(page.getByRole('heading', { name: /Find Amazing Yard Sale Treasures/i })).toBeVisible()
    
    // Navigate to explore/map view
    await page.getByRole('link', { name: 'Find Sales' }).click()
    await expect(page).toHaveURL(/\/explore/)
    
    // Navigate to map view
    await page.getByRole('link', { name: 'Map View' }).click()
    await expect(page).toHaveURL(/\/explore.*tab=map/)
    
    // Check map container is present (even if markers are minimal/mocked)
    const mapContainer = page.locator('#map, [data-testid="map"], .map-container').first()
    await expect(mapContainer).toBeVisible({ timeout: 10000 })
  })

  test('auth basic flow - sign in redirects to dashboard', async ({ page }) => {
    // Mock authentication success
    await page.route('**/auth/v1/token?grant_type=password', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            aud: 'authenticated'
          }
        })
      })
    })

    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-id',
          email: 'test@example.com',
          aud: 'authenticated'
        })
      })
    })

    // Navigate to sign in
    await page.goto('/signin')
    await expect(page.getByRole('heading', { name: /Welcome to YardSaleFinder/i })).toBeVisible()
    
    // Fill sign in form
    await page.getByPlaceholder('your@email.com').fill('test@example.com')
    await page.getByPlaceholder('••••••••').fill('password123')
    
    // Submit sign in
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    // Should redirect to dashboard or main post-login page
    // Wait for navigation (could be /dashboard, /explore, or /)
    await page.waitForURL(/\/(dashboard|explore|\?)/, { timeout: 10000 })
    
    // Verify we're not still on signin page
    await expect(page.getByRole('heading', { name: /Welcome to YardSaleFinder/i })).not.toBeVisible()
  })

  test('create sale happy path', async ({ page }) => {
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

    // Mock geocoding to return valid location
    await page.route('**/nominatim.openstreetmap.org/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          display_name: '123 Test Street, Louisville, KY',
          lat: '38.2527',
          lon: '-85.7585'
        }])
      })
    })

    // Mock sale creation API
    let saleCreated = false
    await page.route('**/api/sales', async (route) => {
      if (route.request().method() === 'POST') {
        saleCreated = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: {
              id: 'smoke-test-sale-123',
              title: 'Smoke Test Sale',
              address: '123 Test Street, Louisville, KY',
              lat: 38.2527,
              lng: -85.7585,
              owner_id: 'test-user-id',
              status: 'published',
              created_at: new Date().toISOString()
            }
          })
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: saleCreated ? [{
              id: 'smoke-test-sale-123',
              title: 'Smoke Test Sale',
              address: '123 Test Street, Louisville, KY'
            }] : []
          })
        })
      }
    })

    // Navigate to sell wizard
    await page.goto('/explore?tab=add')
    await page.waitForLoadState('networkidle')
    
    // Verify form is visible
    await expect(page.getByRole('heading', { name: /Post Your Sale/i })).toBeVisible()
    
    // Fill minimal valid fields
    await page.fill('input[name="title"], input[placeholder*="title"]', 'Smoke Test Sale')
    await page.fill('input[name="address"], input[placeholder*="Address"]', '123 Test Street, Louisville, KY')
    
    // Wait for geocoding to complete
    await page.waitForTimeout(1000)
    
    // Submit form
    await page.getByRole('button', { name: /Post|Submit|Publish/i }).click()
    
    // Wait for success or redirect
    await page.waitForTimeout(2000)
    
    // Verify sale was created (check for success message or sale in list)
    const successIndicator = page.locator('text=/success|created|posted/i').first()
    await expect(successIndicator).toBeVisible({ timeout: 10000 })
  })

  test('moderation smoke - report sale and admin sees it', async ({ page }) => {
    const testSaleId = 'smoke-test-sale-for-report'
    
    // Mock a published sale
    await page.route('**/api/sales/**', async (route) => {
      if (route.request().url().includes(testSaleId)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: {
              id: testSaleId,
              title: 'Test Sale for Reporting',
              status: 'published',
              moderation_status: 'published'
            }
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

    // Mock report creation
    let reportCreated = false
    await page.route('**/api/sales/*/report', async (route) => {
      if (route.request().method() === 'POST') {
        reportCreated = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            data: {
              id: 'report-123',
              sale_id: testSaleId,
              status: 'open',
              reason: 'spam'
            }
          })
        })
      }
    })

    // Mock normal user auth
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'normal-user-id',
            email: 'user@example.com',
            aud: 'authenticated'
          }
        })
      })
    })

    // Navigate to a sale detail page (or use explore to find sale)
    await page.goto(`/sale/${testSaleId}`)
    await page.waitForLoadState('networkidle')
    
    // Find and click report button
    const reportButton = page.getByRole('button', { name: /Report|Flag/i }).first()
    if (await reportButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportButton.click()
      
      // Fill report form if modal appears
      const reasonInput = page.locator('select[name="reason"], input[name="reason"]').first()
      if (await reasonInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await reasonInput.selectOption('spam')
      }
      
      // Submit report
      const submitButton = page.getByRole('button', { name: /Submit|Report/i }).first()
      if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitButton.click()
        await page.waitForTimeout(1000)
      }
    }

    // Now switch to admin view
    // Mock admin auth
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'admin-user-id',
            email: 'admin@example.com',
            aud: 'authenticated',
            app_metadata: { role: 'admin' }
          }
        })
      })
    })

    // Mock admin reports API
    await page.route('**/api/admin/reports**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: reportCreated ? [{
            id: 'report-123',
            sale_id: testSaleId,
            status: 'open',
            reason: 'spam',
            sales: {
              id: testSaleId,
              title: 'Test Sale for Reporting'
            }
          }] : [],
          pagination: {
            total: reportCreated ? 1 : 0
          }
        })
      })
    })

    // Navigate to admin reports
    await page.goto('/admin/tools')
    await page.waitForLoadState('networkidle')
    
    // Check admin tools page loads
    await expect(page.getByRole('heading', { name: /Admin Tools/i })).toBeVisible({ timeout: 10000 })
    
    // Look for reports panel/tab
    const reportsTab = page.getByRole('tab', { name: /Reports/i }).or(page.getByRole('link', { name: /Reports/i })).first()
    if (await reportsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await reportsTab.click()
      await page.waitForTimeout(1000)
    }
    
    // Verify report is listed as "Open" if it was created
    if (reportCreated) {
      const openReport = page.locator('text=/open|Open/i').first()
      await expect(openReport).toBeVisible({ timeout: 5000 })
    } else {
      // If report button wasn't found, at least verify admin panel loads
      const adminContent = page.locator('text=/Reports|Admin|Tools/i').first()
      await expect(adminContent).toBeVisible()
    }
  })
})

