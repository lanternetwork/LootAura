import { test, expect } from '@playwright/test'

test.describe('Admin Tools Load Testing', () => {
  test('should show load testing disabled message in production', async ({ page }) => {
    // Navigate to admin tools
    await page.goto('/admin/tools')
    
    // Wait for admin tools to load
    await page.waitForSelector('h1:has-text("Admin Tools")', { timeout: 5000 })
    
    // Look for load testing section
    const loadTestingSection = page.locator('text=Load Testing Controls')
    await expect(loadTestingSection).toBeVisible()
    
    // Try to run a load test
    const runTestButton = page.locator('button:has-text("Run Test")').first()
    await runTestButton.click()
    
    // Wait for the response
    await page.waitForTimeout(2000)
    
    // Check that we get a proper error message (not a generic 500 error)
    const errorMessage = page.locator('text=Error: HTTP error! status: 403')
    await expect(errorMessage).toBeVisible()
  })

  test('should show all load testing scenarios', async ({ page }) => {
    // Navigate to admin tools
    await page.goto('/admin/tools')
    
    // Wait for admin tools to load
    await page.waitForSelector('h1:has-text("Admin Tools")', { timeout: 5000 })
    
    // Check that all expected scenarios are present
    const expectedScenarios = [
      'Sales Baseline',
      'Sales Burst', 
      'Sales Sustained',
      'Geocoding Cache',
      'Geocoding Abuse',
      'Auth Signin',
      'Auth Magic Link',
      'Mutation Sales',
      'Multi-IP Sales'
    ]
    
    for (const scenario of expectedScenarios) {
      const scenarioElement = page.locator(`text=${scenario}`)
      await expect(scenarioElement).toBeVisible()
    }
    
    // Check that all scenarios have Run Test buttons
    const runTestButtons = page.locator('button:has-text("Run Test")')
    await expect(runTestButtons).toHaveCount(expectedScenarios.length)
  })

  test('should show proper test summary', async ({ page }) => {
    // Navigate to admin tools
    await page.goto('/admin/tools')
    
    // Wait for admin tools to load
    await page.waitForSelector('h1:has-text("Admin Tools")', { timeout: 5000 })
    
    // Look for test summary section
    const testSummary = page.locator('text=Test Summary')
    await expect(testSummary).toBeVisible()
    
    // Check that summary shows initial state
    const completedCount = page.locator('text=Completed:0')
    const errorsCount = page.locator('text=Errors:0')
    const runningCount = page.locator('text=Running:0')
    const totalCount = page.locator('text=Total:9')
    
    await expect(completedCount).toBeVisible()
    await expect(errorsCount).toBeVisible() 
    await expect(runningCount).toBeVisible()
    await expect(totalCount).toBeVisible()
  })

  test('should have proper base URL configuration', async ({ page }) => {
    // Navigate to admin tools
    await page.goto('/admin/tools')
    
    // Wait for admin tools to load
    await page.waitForSelector('h1:has-text("Admin Tools")', { timeout: 5000 })
    
    // Check that base URL input is present and has correct default
    const baseUrlInput = page.locator('input[placeholder*="localhost:3000"]')
    await expect(baseUrlInput).toBeVisible()
    
    // Check that the input has the correct default value
    await expect(baseUrlInput).toHaveValue('http://localhost:3000')
  })
})
