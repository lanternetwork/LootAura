/**
 * Unit tests for FavoriteSaleStartingSoonEmail template
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  FavoriteSaleStartingSoonEmail,
  buildFavoriteSaleStartingSoonSubject,
} from '@/lib/email/templates/FavoriteSaleStartingSoonEmail'

describe('FavoriteSaleStartingSoonEmail', () => {
  it('should render without throwing', () => {
    const props = {
      saleTitle: 'Test Yard Sale',
      saleAddress: '123 Main St, Anytown, ST 12345',
      dateRange: 'Sat, Dec 7, 2025 · 8:00 AM – 2:00 PM',
      saleUrl: 'https://lootaura.com/sales/test-id',
    }

    expect(() => {
      render(<FavoriteSaleStartingSoonEmail {...props} />)
    }).not.toThrow()
  })

  it('should include sale title in rendered output', () => {
    const props = {
      saleTitle: 'My Awesome Yard Sale',
      saleAddress: '456 Oak Ave, City, ST 67890',
      dateRange: 'Sun, Dec 8, 2025 · 9:00 AM – 3:00 PM',
      saleUrl: 'https://lootaura.com/sales/another-id',
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('My Awesome Yard Sale')
  })

  it('should include sale address in rendered output', () => {
    const props = {
      saleTitle: 'Test Sale',
      saleAddress: '789 Pine Rd, Town, ST 11111',
      dateRange: 'Mon, Dec 9, 2025 · 10:00 AM – 4:00 PM',
      saleUrl: 'https://lootaura.com/sales/address-test',
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('789 Pine Rd, Town, ST 11111')
  })

  it('should include date range text in rendered output', () => {
    const props = {
      saleTitle: 'Date Test Sale',
      saleAddress: '321 Elm St',
      dateRange: 'Tue, Dec 10, 2025 · 11:00 AM – 5:00 PM',
      saleUrl: 'https://lootaura.com/sales/date-test',
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Tue, Dec 10, 2025 · 11:00 AM – 5:00 PM')
  })

  it('should include sale URL in rendered output', () => {
    const props = {
      saleTitle: 'URL Test Sale',
      saleAddress: '999 Test Ave',
      dateRange: 'Wed, Dec 11, 2025 · 12:00 PM',
      saleUrl: 'https://lootaura.com/sales/url-test-id',
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('https://lootaura.com/sales/url-test-id')
  })

  it('should use recipient name when provided', () => {
    const props = {
      recipientName: 'John Doe',
      saleTitle: 'Personalized Sale',
      saleAddress: '123 Test St',
      dateRange: 'Thu, Dec 12, 2025 · 1:00 PM',
      saleUrl: 'https://lootaura.com/sales/personalized',
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('Hi John Doe,')
  })

  it('should use generic greeting when recipient name is not provided', () => {
    const props = {
      saleTitle: 'Generic Sale',
      saleAddress: '456 Test Ave',
      dateRange: 'Fri, Dec 13, 2025 · 2:00 PM',
      saleUrl: 'https://lootaura.com/sales/generic',
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
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
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('9:00 AM – 2:00 PM')
  })

  it('should include "starting soon" messaging', () => {
    const props = {
      saleTitle: 'Starting Soon Test',
      saleAddress: '123 Test St',
      dateRange: 'Sun, Dec 15, 2025 · 10:00 AM',
      saleUrl: 'https://lootaura.com/sales/starting-soon',
    }

    const { container } = render(<FavoriteSaleStartingSoonEmail {...props} />)
    const html = container.innerHTML

    expect(html).toContain('starting soon')
    expect(html).toContain('favorite')
  })
})

describe('buildFavoriteSaleStartingSoonSubject', () => {
  it('should generate correct subject line with sale title', () => {
    const subject = buildFavoriteSaleStartingSoonSubject('My Yard Sale')
    expect(subject).toBe('A sale you saved is starting soon: My Yard Sale')
  })

  it('should include sale title in subject', () => {
    const subject = buildFavoriteSaleStartingSoonSubject('My Awesome Sale')
    expect(subject).toBe('A sale you saved is starting soon: My Awesome Sale')
  })
})

