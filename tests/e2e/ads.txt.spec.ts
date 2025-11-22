import { test, expect } from '@playwright/test'

test.describe('ads.txt', () => {
  test('should be accessible at /ads.txt', async ({ page }) => {
    const response = await page.goto('/ads.txt')
    
    // Should return 200 OK
    expect(response?.status()).toBe(200)
    
    // Should have correct content type
    const contentType = response?.headers()['content-type']
    expect(contentType).toContain('text/plain')
  })

  test('should contain Google AdSense entry', async ({ page }) => {
    await page.goto('/ads.txt')
    
    // Get the page content
    const content = await page.textContent('body')
    
    // Should contain the Google AdSense entry
    expect(content).toContain('google.com')
    expect(content).toContain('pub-8685093412475036')
    expect(content).toContain('DIRECT')
    expect(content).toContain('f08c47fec0942fa0')
    
    // Should match the exact format
    const expectedLine = 'google.com, pub-8685093412475036, DIRECT, f08c47fec0942fa0'
    const trimmedContent = content?.trim()
    expect(trimmedContent).toContain(expectedLine)
  })

  test('should have correct format (domain is first field)', async ({ page }) => {
    await page.goto('/ads.txt')
    
    const content = await page.textContent('body')
    const lines = content?.split('\n').filter(line => line.trim() && !line.trim().startsWith('#')) || []
    
    // At least one line should match the expected format
    const hasGoogleEntry = lines.some(line => {
      const fields = line.split(',').map(f => f.trim())
      // Domain must be first field and exactly 'google.com'
      return fields[0] === 'google.com' && 
             fields[1] === 'pub-8685093412475036'
    })
    
    expect(hasGoogleEntry).toBe(true)
  })
})

