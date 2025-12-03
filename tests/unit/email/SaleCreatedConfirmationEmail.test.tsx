/**
 * Unit tests for SaleCreatedConfirmationEmail template
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  SaleCreatedConfirmationEmail,
  buildSaleCreatedSubject,
  buildSaleCreatedPreview,
} from '@/lib/email/templates/SaleCreatedConfirmationEmail'

describe('SaleCreatedConfirmationEmail', () => {
  it('should render without throwing', () => {
    const props = {
      saleTitle: 'Test Yard Sale',
      saleAddress: '123 Main St, Anytown, ST 12345',
      dateRange: 'Sat, Dec 7, 2025 · 8:00 AM – 2:00 PM',
      saleUrl: 'https://lootaura.com/sales/test-id',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    expect(() => {
      render(<SaleCreatedConfirmationEmail {...props} />)
    }).not.toThrow()
  })

  it('should include sale title in rendered output', () => {
    const props = {
      saleTitle: 'My Awesome Yard Sale',
      saleAddress: '456 Oak Ave, City, ST 67890',
      dateRange: 'Sun, Dec 8, 2025 · 9:00 AM – 3:00 PM',
      saleUrl: 'https://lootaura.com/sales/another-id',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('My Awesome Yard Sale')
  })

  it('should include sale address in rendered output', () => {
    const props = {
      saleTitle: 'Test Sale',
      saleAddress: '789 Pine Rd, Town, ST 11111',
      dateRange: 'Mon, Dec 9, 2025 · 10:00 AM – 4:00 PM',
      saleUrl: 'https://lootaura.com/sales/address-test',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('789 Pine Rd, Town, ST 11111')
  })

  it('should include date range text in rendered output', () => {
    const props = {
      saleTitle: 'Date Test Sale',
      saleAddress: '321 Elm St',
      dateRange: 'Tue, Dec 10, 2025 · 11:00 AM – 5:00 PM',
      saleUrl: 'https://lootaura.com/sales/date-test',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Tue, Dec 10, 2025 · 11:00 AM – 5:00 PM')
  })

  it('should include sale URL in rendered output', () => {
    const props = {
      saleTitle: 'URL Test Sale',
      saleAddress: '999 Test Ave',
      dateRange: 'Wed, Dec 11, 2025 · 12:00 PM',
      saleUrl: 'https://lootaura.com/sales/url-test-id',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('https://lootaura.com/sales/url-test-id')
  })

  it('should include manage URL in rendered output', () => {
    const props = {
      saleTitle: 'Manage Test Sale',
      saleAddress: '123 Test St',
      dateRange: 'Thu, Dec 12, 2025 · 1:00 PM',
      saleUrl: 'https://lootaura.com/sales/manage-test',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('https://lootaura.com/dashboard')
  })

  it('should use recipient name when provided', () => {
    const props = {
      recipientName: 'John Doe',
      saleTitle: 'Personalized Sale',
      saleAddress: '123 Test St',
      dateRange: 'Thu, Dec 12, 2025 · 1:00 PM',
      saleUrl: 'https://lootaura.com/sales/personalized',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Hi John Doe,')
  })

  it('should use generic greeting when recipient name is not provided', () => {
    const props = {
      saleTitle: 'Generic Sale',
      saleAddress: '456 Test Ave',
      dateRange: 'Fri, Dec 13, 2025 · 2:00 PM',
      saleUrl: 'https://lootaura.com/sales/generic',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Hi there,')
  })

  it('should include time window when provided', () => {
    const props = {
      saleTitle: 'Time Window Test',
      saleAddress: '789 Test Blvd',
      dateRange: 'Sat, Dec 14, 2025',
      timeWindow: '9:00 AM – 2:00 PM',
      saleUrl: 'https://lootaura.com/sales/time-test',
      manageUrl: 'https://lootaura.com/dashboard',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('9:00 AM – 2:00 PM')
  })
})

describe('buildSaleCreatedSubject', () => {
  it('should generate correct subject line', () => {
    const subject = buildSaleCreatedSubject('My Yard Sale')
    expect(subject).toBe('Your yard sale is live on LootAura 🚀')
  })

  it('should not include sale title in subject (consistent branding)', () => {
    const subject = buildSaleCreatedSubject('My Awesome Sale')
    expect(subject).toBe('Your yard sale is live on LootAura 🚀')
  })
})

describe('buildSaleCreatedPreview', () => {
  it('should generate correct preview text', () => {
    const preview = buildSaleCreatedPreview({
      saleTitle: 'My Yard Sale',
      dateRange: 'Sat, Dec 7, 2025 · 8:00 AM – 2:00 PM',
      addressLine: '123 Main St, Anytown, ST 12345',
    })
    expect(preview).toContain('My Yard Sale')
    expect(preview).toContain('Sat, Dec 7, 2025 · 8:00 AM – 2:00 PM')
    expect(preview).toContain('123 Main St, Anytown, ST 12345')
  })
})

