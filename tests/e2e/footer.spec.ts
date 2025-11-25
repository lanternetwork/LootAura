/**
 * E2E tests for SiteFooter component
 * 
 * Tests verify that:
 * - Footer is visible on main pages
 * - Footer links navigate correctly
 * - Info pages load with correct content
 */

import { test, expect } from '@playwright/test'

test.describe('Site Footer', () => {
  test('should be visible on home page', async ({ page }) => {
    await page.goto('/')
    
    // Check footer is visible
    const footer = page.locator('footer[role="contentinfo"]')
    await expect(footer).toBeVisible()
    
    // Check brand name is visible
    await expect(page.getByText('Loot Aura')).toBeVisible()
    
    // Check navigation links are visible
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Terms of Use' })).toBeVisible()
  })

  test('should be visible on sales page', async ({ page }) => {
    await page.goto('/sales')
    
    const footer = page.locator('footer[role="contentinfo"]')
    await expect(footer).toBeVisible()
  })

  test('should navigate to About page', async ({ page }) => {
    await page.goto('/')
    
    // Click About link
    await page.getByRole('link', { name: 'About' }).click()
    
    // Verify navigation
    await expect(page).toHaveURL('/about')
    
    // Verify page content
    await expect(page.getByRole('heading', { name: 'About Loot Aura' })).toBeVisible()
    await expect(page.getByText(/Map-first platform/)).toBeVisible()
  })

  test('should navigate to Privacy Policy page', async ({ page }) => {
    await page.goto('/')
    
    // Click Privacy Policy link
    await page.getByRole('link', { name: 'Privacy Policy' }).click()
    
    // Verify navigation
    await expect(page).toHaveURL('/privacy')
    
    // Verify page content
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
    await expect(page.getByText(/Information We Collect/)).toBeVisible()
  })

  test('should navigate to Terms of Use page', async ({ page }) => {
    await page.goto('/')
    
    // Click Terms of Use link
    await page.getByRole('link', { name: 'Terms of Use' }).click()
    
    // Verify navigation
    await expect(page).toHaveURL('/terms')
    
    // Verify page content
    await expect(page.getByRole('heading', { name: 'Terms of Use' })).toBeVisible()
    await expect(page.getByText(/Acceptance of Terms/)).toBeVisible()
  })

  test('should display copyright with current year', async ({ page }) => {
    await page.goto('/')
    
    const currentYear = new Date().getFullYear()
    const copyrightText = page.getByText(new RegExp(`© ${currentYear} Loot Aura`))
    await expect(copyrightText).toBeVisible()
  })

  test('footer should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    const footer = page.locator('footer[role="contentinfo"]')
    await expect(footer).toBeVisible()
    
    // Check that links are still accessible on mobile
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible()
  })
})

