/**
 * Unit tests for SaleCreatedConfirmationEmail template
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SaleCreatedConfirmationEmail, getSaleCreatedSubject } from '@/lib/email/templates/SaleCreatedConfirmationEmail'

describe('SaleCreatedConfirmationEmail', () => {
  it('should render without throwing', () => {
    const props = {
      saleTitle: 'Test Yard Sale',
      saleAddress: '123 Main St, Anytown, ST 12345',
      saleDateRangeText: 'Sat, Dec 7 · 8:00 am – 2:00 pm',
      saleUrl: 'https://lootaura.com/sales/test-id',
    }

    expect(() => {
      render(<SaleCreatedConfirmationEmail {...props} />)
    }).not.toThrow()
  })

  it('should include sale title in rendered output', () => {
    const props = {
      saleTitle: 'My Awesome Yard Sale',
      saleAddress: '456 Oak Ave, City, ST 67890',
      saleDateRangeText: 'Sun, Dec 8 · 9:00 am – 3:00 pm',
      saleUrl: 'https://lootaura.com/sales/another-id',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('My Awesome Yard Sale')
  })

  it('should include sale address in rendered output', () => {
    const props = {
      saleTitle: 'Test Sale',
      saleAddress: '789 Pine Rd, Town, ST 11111',
      saleDateRangeText: 'Mon, Dec 9 · 10:00 am – 4:00 pm',
      saleUrl: 'https://lootaura.com/sales/address-test',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('789 Pine Rd, Town, ST 11111')
  })

  it('should include date range text in rendered output', () => {
    const props = {
      saleTitle: 'Date Test Sale',
      saleAddress: '321 Elm St',
      saleDateRangeText: 'Tue, Dec 10 · 11:00 am – 5:00 pm',
      saleUrl: 'https://lootaura.com/sales/date-test',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Tue, Dec 10 · 11:00 am – 5:00 pm')
  })

  it('should include sale URL in rendered output', () => {
    const props = {
      saleTitle: 'URL Test Sale',
      saleAddress: '999 Test Ave',
      saleDateRangeText: 'Wed, Dec 11 · 12:00 pm',
      saleUrl: 'https://lootaura.com/sales/url-test-id',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('https://lootaura.com/sales/url-test-id')
  })

  it('should use recipient name when provided', () => {
    const props = {
      recipientName: 'John Doe',
      saleTitle: 'Personalized Sale',
      saleAddress: '123 Test St',
      saleDateRangeText: 'Thu, Dec 12 · 1:00 pm',
      saleUrl: 'https://lootaura.com/sales/personalized',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Hi John Doe,')
  })

  it('should use generic greeting when recipient name is not provided', () => {
    const props = {
      saleTitle: 'Generic Sale',
      saleAddress: '456 Test Ave',
      saleDateRangeText: 'Fri, Dec 13 · 2:00 pm',
      saleUrl: 'https://lootaura.com/sales/generic',
    }

    const { container } = render(<SaleCreatedConfirmationEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Hi there,')
  })
})

describe('getSaleCreatedSubject', () => {
  it('should generate correct subject line', () => {
    const subject = getSaleCreatedSubject('My Yard Sale')
    expect(subject).toBe('Your sale "My Yard Sale" is live on LootAura')
  })

  it('should handle sale titles with special characters', () => {
    const subject = getSaleCreatedSubject('Sale & More!')
    expect(subject).toBe('Your sale "Sale & More!" is live on LootAura')
  })

  it('should handle empty sale title', () => {
    const subject = getSaleCreatedSubject('')
    expect(subject).toBe('Your sale "" is live on LootAura')
  })
})

