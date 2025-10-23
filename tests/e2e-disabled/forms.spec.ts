import { test, expect } from '@playwright/test'

test.describe('Form Functionality', () => {
  test('can fill out add sale form', async ({ page }) => {
    await page.goto('/explore?tab=add')
    
    // Fill out the form
    await page.getByPlaceholder('e.g., Estate Sale - Antiques & Collectibles').fill('Test Garage Sale')
    await page.getByPlaceholder('Start typing your address...').fill('123 Main St, San Francisco, CA')
    await page.getByPlaceholder('Describe what you\'re selling...').fill('Vintage furniture and collectibles')
    
    // Fill date fields
    await page.getByLabel('Start Date & Time').fill('2024-12-25T09:00')
    await page.getByLabel('End Date & Time').fill('2024-12-25T17:00')
    
    // Fill price fields
    await page.getByPlaceholder('0.00').first().fill('10')
    await page.getByPlaceholder('100.00').fill('500')
    
    // Fill contact
    await page.getByPlaceholder('Phone number or email').fill('test@example.com')
    
    // Add a tag
    await page.getByPlaceholder('Add a tag...').fill('furniture')
    await page.getByRole('button', { name: 'Add' }).click()
    
    // Check that tag was added
    await expect(page.getByText('furniture')).toBeVisible()
    
    // Check form validation
    await expect(page.getByRole('button', { name: 'Post Sale' })).toBeVisible()
  })

  test('shows validation errors for required fields', async ({ page }) => {
    await page.goto('/explore?tab=add')
    
    // Try to submit without filling required fields
    await page.getByRole('button', { name: 'Post Sale' }).click()
    
    // Check that form shows validation (browser native validation)
    const titleInput = page.getByPlaceholder('e.g., Estate Sale - Antiques & Collectibles')
    await expect(titleInput).toHaveAttribute('required')
  })

  test('can use search filters', async ({ page }) => {
    await page.goto('/explore')
    
    // Open advanced filters
    await page.getByRole('button', { name: 'More Filters' }).click()
    
    // Fill filter fields
    await page.getByPlaceholder('25').fill('10')
    await page.getByLabel('From Date').fill('2024-01-01')
    await page.getByLabel('To Date').fill('2024-12-31')
    await page.getByPlaceholder('Min').fill('0')
    await page.getByPlaceholder('Max').fill('100')
    
    // Select a category
    await page.getByRole('button', { name: 'antiques' }).click()
    await expect(page.getByRole('button', { name: 'antiques' })).toHaveClass(/bg-amber-500/)
    
    // Clear filters
    await page.getByRole('button', { name: 'Clear All' }).click()
    await expect(page.getByPlaceholder('25')).toHaveValue('')
  })

  test('can use tag management in add form', async ({ page }) => {
    await page.goto('/explore?tab=add')
    
    // Add multiple tags
    const tagInput = page.getByPlaceholder('Add a tag...')
    await tagInput.fill('furniture')
    await page.getByRole('button', { name: 'Add' }).click()
    
    await tagInput.fill('antiques')
    await page.getByRole('button', { name: 'Add' }).click()
    
    await tagInput.fill('books')
    await page.getByRole('button', { name: 'Add' }).click()
    
    // Check that all tags are visible
    await expect(page.getByText('furniture')).toBeVisible()
    await expect(page.getByText('antiques')).toBeVisible()
    await expect(page.getByText('books')).toBeVisible()
    
    // Remove a tag
    await page.getByText('antiques').getByRole('button', { name: '×' }).click()
    await expect(page.getByText('antiques')).not.toBeVisible()
    
    // Check remaining tags
    await expect(page.getByText('furniture')).toBeVisible()
    await expect(page.getByText('books')).toBeVisible()
  })
})
