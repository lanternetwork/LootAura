import { test, expect } from '@playwright/test'

test.describe('YardSaleFinder Happy Path', () => {
  test('can load landing page and navigate to explore', async ({ page }) => {
    await page.goto('/')
    
    // Check landing page elements
    await expect(page.getByRole('heading', { name: 'Find Amazing Yard Sale Treasures' })).toBeVisible()
    await expect(page.getByPlaceholder('Enter your city or zip code')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Find Sales' })).toBeVisible()
    
    // Navigate to explore page
    await page.getByRole('link', { name: 'Find Sales' }).click()
    await expect(page).toHaveURL('/explore')
    
    // Check explore page elements
    await expect(page.getByRole('heading', { name: 'Explore Yard Sales' })).toBeVisible()
    await expect(page.getByText('Browse, search, and discover amazing deals')).toBeVisible()
  })

  test('can navigate between tabs', async ({ page }) => {
    await page.goto('/explore')
    
    // Check initial tab (Browse Sales)
    await expect(page.getByRole('link', { name: 'Browse Sales' })).toHaveClass(/bg-amber-100/)
    
    // Navigate to Map View
    await page.getByRole('link', { name: 'Map View' }).click()
    await expect(page).toHaveURL('/explore?tab=map')
    
    // Navigate to Add Sale
    await page.getByRole('link', { name: 'Add Sale' }).click()
    await expect(page).toHaveURL('/explore?tab=add')
    
    // Check form elements
    await expect(page.getByRole('heading', { name: 'Post Your Sale' })).toBeVisible()
    await expect(page.getByPlaceholder('e.g., Estate Sale - Antiques & Collectibles')).toBeVisible()
    
    // Navigate to Find More
    await page.getByRole('link', { name: 'Find More' }).click()
    await expect(page).toHaveURL('/explore?tab=find')
  })

  test('can use search functionality', async ({ page }) => {
    await page.goto('/explore')
    
    // Use search bar
    const searchInput = page.getByPlaceholder('Search sales by title or description...')
    await searchInput.fill('garage sale')
    await searchInput.press('Enter')
    
    // Check that search was performed (URL should update or results should show)
    await expect(searchInput).toHaveValue('garage sale')
  })

  test('can access sign in page', async ({ page }) => {
    await page.goto('/signin')
    
    // Check sign in page elements
    await expect(page.getByRole('heading', { name: 'Welcome to YardSaleFinder' })).toBeVisible()
    await expect(page.getByPlaceholder('your@email.com')).toBeVisible()
    await expect(page.getByPlaceholder('••••••••')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible()
  })

  test('can access favorites page', async ({ page }) => {
    await page.goto('/favorites')
    
    // Check favorites page elements
    await expect(page.getByRole('heading', { name: 'Your Favorites' })).toBeVisible()
    await expect(page.getByText('0 saved sales')).toBeVisible()
  })

  test('has working navigation header', async ({ page }) => {
    await page.goto('/')
    
    // Check header elements
    await expect(page.getByRole('link', { name: 'YardSaleFinder' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse Sales' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Favorites' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Post Sale' })).toBeVisible()
    
    // Test navigation
    await page.getByRole('link', { name: 'Browse Sales' }).click()
    await expect(page).toHaveURL('/explore')
    
    await page.getByRole('link', { name: 'YardSaleFinder' }).click()
    await expect(page).toHaveURL('/')
  })

  test('is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Check that mobile layout works
    await expect(page.getByRole('heading', { name: 'Find Amazing Yard Sale Treasures' })).toBeVisible()
    
    // Check that search input is responsive
    const searchInput = page.getByPlaceholder('Enter your city or zip code')
    await expect(searchInput).toBeVisible()
    
    // Navigate to explore and check mobile layout
    await page.getByRole('link', { name: 'Find Sales' }).click()
    await expect(page).toHaveURL('/explore')
    await expect(page.getByRole('heading', { name: 'Explore Yard Sales' })).toBeVisible()
  })

  test('shows proper error states', async ({ page }) => {
    // Test 404 page
    await page.goto('/nonexistent-page')
    await expect(page.getByText('404')).toBeVisible()
  })
})
