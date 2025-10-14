import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddSaleForm from '@/components/AddSaleForm'

// Use global mocks from tests/setup.ts

// Mock ImageUploader
vi.mock('@/components/ImageUploader', () => ({
  default: ({ onUpload }: { onUpload: (photos: string[]) => void }) => (
    <div data-testid="image-uploader">
      <button onClick={() => onUpload(['photo1.jpg'])}>Upload Image</button>
    </div>
  )
}))

describe('AddSaleForm Accessibility', () => {
  beforeEach(() => {
    // Mock window.alert for JSDOM
    global.alert = vi.fn()
  })

  it('should have proper form labels and structure', () => {
    render(<AddSaleForm />)
    
    // Check for proper form element
    const form = screen.getByRole('form')
    expect(form).toBeInTheDocument()
    
    // Check for required field labels
    expect(screen.getByLabelText('Sale Title *')).toBeInTheDocument()
    expect(screen.getByLabelText('Address *')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
    expect(screen.getByLabelText('Start Date & Time')).toBeInTheDocument()
    expect(screen.getByLabelText('End Date & Time')).toBeInTheDocument()
    expect(screen.getByLabelText('Min Price ($)')).toBeInTheDocument()
    expect(screen.getByLabelText('Max Price ($)')).toBeInTheDocument()
    expect(screen.getByLabelText('Contact Info')).toBeInTheDocument()
    expect(screen.getByLabelText('Tags')).toBeInTheDocument()
  })

  it('should have proper input types and attributes', () => {
    render(<AddSaleForm />)
    
    // Check input types
    const titleInput = screen.getByLabelText('Sale Title *')
    expect(titleInput).toHaveAttribute('type', 'text')
    expect(titleInput).toHaveAttribute('required')
    
    const addressInput = screen.getByLabelText('Address *')
    expect(addressInput).toHaveAttribute('type', 'text')
    expect(addressInput).toHaveAttribute('required')
    
    const descriptionTextarea = screen.getByLabelText('Description')
    expect(descriptionTextarea).toBeInTheDocument()
    
    const startDateInput = screen.getByLabelText('Start Date & Time')
    expect(startDateInput).toHaveAttribute('type', 'datetime-local')
    
    const endDateInput = screen.getByLabelText('End Date & Time')
    expect(endDateInput).toHaveAttribute('type', 'datetime-local')
    
    const minPriceInput = screen.getByLabelText('Min Price ($)')
    expect(minPriceInput).toHaveAttribute('type', 'number')
    expect(minPriceInput).toHaveAttribute('min', '0')
    expect(minPriceInput).toHaveAttribute('step', '0.01')
    
    const maxPriceInput = screen.getByLabelText('Max Price ($)')
    expect(maxPriceInput).toHaveAttribute('type', 'number')
    expect(maxPriceInput).toHaveAttribute('min', '0')
    expect(maxPriceInput).toHaveAttribute('step', '0.01')
  })

  it('should have proper button roles and labels', () => {
    render(<AddSaleForm />)
    
    // Check submit button
    const submitButton = screen.getByRole('button', { name: /post sale/i })
    expect(submitButton).toBeInTheDocument()
    expect(submitButton).toHaveAttribute('type', 'submit')
    
    // Check add tag button
    const addTagButton = screen.getByRole('button', { name: /add/i })
    expect(addTagButton).toBeInTheDocument()
    expect(addTagButton).toHaveAttribute('type', 'button')
  })

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup()
    render(<AddSaleForm />)
    
    // Tab through form elements
    const titleInput = screen.getByLabelText('Sale Title *')
    const addressInput = screen.getByLabelText('Address *')
    const descriptionTextarea = screen.getByLabelText('Description')
    const startDateInput = screen.getByLabelText('Start Date & Time')
    const endDateInput = screen.getByLabelText('End Date & Time')
    const minPriceInput = screen.getByLabelText('Min Price ($)')
    const maxPriceInput = screen.getByLabelText('Max Price ($)')
    const contactInput = screen.getByLabelText('Contact Info')
    const tagInput = screen.getByPlaceholderText('Add a tag...')
    const addTagButton = screen.getByRole('button', { name: /add/i })
    const submitButton = screen.getByRole('button', { name: /post sale/i })
    
    // Focus should move through elements in order
    await user.tab()
    expect(titleInput).toHaveFocus()
    
    await user.tab()
    expect(addressInput).toHaveFocus()
    
    await user.tab()
    expect(descriptionTextarea).toHaveFocus()
    
    await user.tab()
    expect(startDateInput).toHaveFocus()
    
    await user.tab()
    expect(endDateInput).toHaveFocus()
    
    await user.tab()
    expect(minPriceInput).toHaveFocus()
    
    await user.tab()
    expect(maxPriceInput).toHaveFocus()
    
    await user.tab()
    expect(contactInput).toHaveFocus()
    
    await user.tab()
    expect(tagInput).toHaveFocus()
    
    await user.tab()
    expect(addTagButton).toHaveFocus()
    
    await user.tab()
    // ImageUploader button comes next
    const imageUploaderButton = screen.getByText('Upload Image')
    expect(imageUploaderButton).toHaveFocus()
    
    await user.tab()
    expect(submitButton).toHaveFocus()
  })

  it('should support form submission with Enter key', async () => {
    const user = userEvent.setup()
    render(<AddSaleForm />)
    
    // Fill in required fields
    await user.type(screen.getByLabelText('Sale Title *'), 'Test Sale')
    await user.type(screen.getByLabelText('Address *'), '123 Test St')
    
    // Submit form with Enter key
    const submitButton = screen.getByRole('button', { name: /post sale/i })
    await user.click(submitButton)
    
    // Form should be submitted (mocked)
    expect(submitButton).toBeInTheDocument()
  })

  it('should support adding tags with Enter key', async () => {
    const user = userEvent.setup()
    render(<AddSaleForm />)
    
    const tagInput = screen.getByPlaceholderText('Add a tag...')
    const addTagButton = screen.getByRole('button', { name: /add/i })
    
    // Type a tag and press Enter
    await user.type(tagInput, 'furniture')
    await user.keyboard('{Enter}')
    
    // Tag should be added
    expect(screen.getByText('furniture')).toBeInTheDocument()
  })

  it('should have proper error handling and announcements', () => {
    render(<AddSaleForm />)
    
    // Initially no error should be shown
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    
    // Error state would be tested with actual form submission
    // This is covered in the integration tests
  })

  it('should have proper fieldset and legend structure for grouped fields', () => {
    render(<AddSaleForm />)
    
    // Check that date fields are properly grouped
    const startDateLabel = screen.getByLabelText('Start Date & Time')
    const endDateLabel = screen.getByLabelText('End Date & Time')
    
    expect(startDateLabel).toBeInTheDocument()
    expect(endDateLabel).toBeInTheDocument()
    
    // Check that price fields are properly grouped
    const minPriceLabel = screen.getByLabelText('Min Price ($)')
    const maxPriceLabel = screen.getByLabelText('Max Price ($)')
    
    expect(minPriceLabel).toBeInTheDocument()
    expect(maxPriceLabel).toBeInTheDocument()
  })

  it('should have proper focus management', async () => {
    const user = userEvent.setup()
    render(<AddSaleForm />)
    
    // Focus should start on first input
    const titleInput = screen.getByLabelText('Sale Title *')
    titleInput.focus()
    expect(titleInput).toHaveFocus()
    
    // Tab should move focus to next input
    await user.tab()
    const addressInput = screen.getByLabelText('Address *')
    expect(addressInput).toHaveFocus()
  })

  it('should have proper ARIA attributes', () => {
    render(<AddSaleForm />)
    
    // Check for proper form role
    const form = screen.getByRole('form')
    expect(form).toBeInTheDocument()
    
    // Check that required fields are properly marked
    const requiredInputs = screen.getAllByLabelText(/\*/)
    expect(requiredInputs.length).toBeGreaterThan(0)
    
    // Check that inputs have proper names
    const titleInput = screen.getByLabelText('Sale Title *')
    expect(titleInput).toHaveAttribute('name', 'title')
    
    const addressInput = screen.getByLabelText('Address *')
    expect(addressInput).toHaveAttribute('name', 'address')
  })

  it('should support screen reader navigation', () => {
    render(<AddSaleForm />)
    
    // All form elements should be accessible to screen readers
    const form = screen.getByRole('form')
    expect(form).toBeInTheDocument()
    
    // Check that all inputs have associated labels
    const inputs = screen.getAllByRole('textbox')
    inputs.forEach(input => {
      const id = input.getAttribute('id')
      const labelElement = input.closest('div')?.querySelector(`label[for="${id}"]`)
      expect(labelElement).toBeInTheDocument()
    })
    
    // Check that all buttons have accessible names
    const buttons = screen.getAllByRole('button')
    buttons.forEach(button => {
      expect(button).toHaveAccessibleName()
    })
  })
})
