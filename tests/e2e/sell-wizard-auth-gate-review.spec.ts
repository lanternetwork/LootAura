import { test, expect } from '@playwright/test'

/**
 * E2E test for auth-gate at Items→Review transition
 * Flow: logged-out → Items Next → login → resume Review → publish → confirmation
 */
test.describe('Sell Wizard Auth Gate at Items→Review', () => {
  test('should redirect to login from Items step and resume to Review after login', async ({ page }) => {
    // Start logged out
    await page.goto('/sell/new')
    
    // Wait for wizard to load
    await expect(page.locator('text=Sale Details')).toBeVisible()
    
    // Fill Details step
    await page.fill('input[name="title"]', 'Test Sale')
    await page.fill('input[name="city"]', 'Louisville')
    await page.fill('input[name="state"]', 'KY')
    await page.fill('input[name="date_start"]', '2024-12-15')
    
    // Click Next to go to Photos
    await page.click('button:has-text("Next")')
    await expect(page.locator('text=Photos')).toBeVisible()
    
    // Click Next to go to Items
    await page.click('button:has-text("Next")')
    await expect(page.locator('text=Items for Sale')).toBeVisible()
    
    // Add an item
    await page.click('button:has-text("Add Item")')
    await page.fill('input[name="name"]', 'Test Item')
    await page.fill('input[name="price"]', '10.00')
    await page.click('button:has-text("Save")')
    
    // Verify item is added
    await expect(page.locator('text=Test Item')).toBeVisible()
    
    // Click Next from Items step (should trigger auth gate)
    await page.click('button:has-text("Next")')
    
    // Should redirect to login page
    await expect(page).toHaveURL(/\/auth\/signin/)
    await expect(page.locator('text=Sign in')).toBeVisible()
    
    // Verify sessionStorage keys are set
    const postLoginRedirect = await page.evaluate(() => 
      sessionStorage.getItem('auth:postLoginRedirect')
    )
    expect(postLoginRedirect).toBe('/sell/new?resume=review')
    
    const returnStep = await page.evaluate(() => 
      sessionStorage.getItem('draft:returnStep')
    )
    expect(returnStep).toBe('review')
    
    // Verify draft is saved to localStorage
    const draft = await page.evaluate(() => 
      localStorage.getItem('draft:sale:new')
    )
    expect(draft).toBeTruthy()
    const parsedDraft = JSON.parse(draft!)
    expect(parsedDraft.items).toHaveLength(1)
    expect(parsedDraft.items[0].name).toBe('Test Item')
    
    // Sign in (using test credentials - adjust as needed)
    // Note: This assumes you have a test user or can create one
    // For now, we'll mock the login flow
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    
    // Wait for redirect back to wizard
    await expect(page).toHaveURL(/\/sell\/new.*resume=review/)
    
    // Should be on Review step
    await expect(page.locator('text=Review Your Sale')).toBeVisible()
    
    // Verify draft was restored
    await expect(page.locator('text=Test Sale')).toBeVisible()
    await expect(page.locator('text=Test Item')).toBeVisible()
    
    // Verify sessionStorage keys are cleared
    const clearedRedirect = await page.evaluate(() => 
      sessionStorage.getItem('auth:postLoginRedirect')
    )
    expect(clearedRedirect).toBeNull()
    
    const clearedStep = await page.evaluate(() => 
      sessionStorage.getItem('draft:returnStep')
    )
    expect(clearedStep).toBeNull()
    
    // Publish the sale
    await page.click('button:has-text("Publish Sale")')
    
    // Wait for confirmation modal
    await expect(page.locator('text=Sale posted!')).toBeVisible()
    await expect(page.locator('text=View Sale')).toBeVisible()
    await expect(page.locator('text=Go to Dashboard')).toBeVisible()
    
    // Verify draft is cleared
    const clearedDraft = await page.evaluate(() => 
      localStorage.getItem('draft:sale:new')
    )
    expect(clearedDraft).toBeNull()
  })
  
  test('should not re-prompt if user navigates back and forward after auth', async ({ page }) => {
    // Start logged in (or log in first)
    // ... login logic ...
    
    await page.goto('/sell/new')
    
    // Navigate to Items step
    await page.fill('input[name="title"]', 'Test Sale')
    await page.fill('input[name="city"]', 'Louisville')
    await page.fill('input[name="state"]', 'KY')
    await page.fill('input[name="date_start"]', '2024-12-15')
    await page.click('button:has-text("Next")') // Details → Photos
    await page.click('button:has-text("Next")') // Photos → Items
    
    // Add item
    await page.click('button:has-text("Add Item")')
    await page.fill('input[name="name"]', 'Test Item')
    await page.click('button:has-text("Save")')
    
    // Go to Review
    await page.click('button:has-text("Next")')
    await expect(page.locator('text=Review Your Sale')).toBeVisible()
    
    // Go back to Items
    await page.click('button:has-text("Previous")')
    await expect(page.locator('text=Items for Sale')).toBeVisible()
    
    // Go forward to Review again - should not prompt for login
    await page.click('button:has-text("Next")')
    await expect(page.locator('text=Review Your Sale')).toBeVisible()
    await expect(page).not.toHaveURL(/\/auth\/signin/)
  })
})

