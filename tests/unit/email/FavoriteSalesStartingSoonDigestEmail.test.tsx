/**
 * Unit tests for FavoriteSalesStartingSoonDigestEmail template
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  FavoriteSalesStartingSoonDigestEmail,
  buildFavoriteSalesStartingSoonDigestSubject,
  type SaleDigestItem,
} from '@/lib/email/templates/FavoriteSalesStartingSoonDigestEmail'

describe('FavoriteSalesStartingSoonDigestEmail', () => {
  const baseSale: SaleDigestItem = {
    saleId: 'sale-1',
    saleTitle: 'Test Yard Sale',
    saleAddress: '123 Main St, Anytown, ST 12345',
    dateRange: 'Sat, Dec 7, 2025 · 8:00 AM – 2:00 PM',
    timeWindow: '8:00 AM – 2:00 PM',
    saleUrl: 'https://lootaura.com/sales/sale-1',
  }

  it('should render without throwing', () => {
    expect(() => {
      render(
        <FavoriteSalesStartingSoonDigestEmail
          sales={[baseSale]}
          hoursBeforeStart={24}
        />
      )
    }).not.toThrow()
  })

  it('should render single sale correctly', () => {
    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={[baseSale]}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('A sale you saved is starting soon')
    expect(html).toContain(baseSale.saleTitle)
    expect(html).toContain(baseSale.saleAddress)
    expect(html).toContain(baseSale.dateRange)
    expect(html).toContain(baseSale.saleUrl)
  })

  it('should render multiple sales correctly', () => {
    const sales: SaleDigestItem[] = [
      baseSale,
      {
        saleId: 'sale-2',
        saleTitle: 'Another Yard Sale',
        saleAddress: '456 Oak Ave, City, ST 67890',
        dateRange: 'Sat, Dec 7, 2025 · 9:00 AM – 3:00 PM',
        timeWindow: '9:00 AM – 3:00 PM',
        saleUrl: 'https://lootaura.com/sales/sale-2',
      },
      {
        saleId: 'sale-3',
        saleTitle: 'Third Yard Sale',
        saleAddress: '789 Pine Rd, Town, ST 11111',
        dateRange: 'Sat, Dec 7, 2025 · 10:00 AM – 4:00 PM',
        timeWindow: '10:00 AM – 4:00 PM',
        saleUrl: 'https://lootaura.com/sales/sale-3',
      },
    ]

    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={sales}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('You have 3 saved sales starting soon')
    expect(html).toContain('Test Yard Sale')
    expect(html).toContain('Another Yard Sale')
    expect(html).toContain('Third Yard Sale')
    expect(html).toContain('123 Main St, Anytown, ST 12345')
    expect(html).toContain('456 Oak Ave, City, ST 67890')
    expect(html).toContain('789 Pine Rd, Town, ST 11111')
  })

  it('should include sale URLs in rendered output', () => {
    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={[baseSale]}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('https://lootaura.com/sales/sale-1')
  })

  it('should use recipient name when provided', () => {
    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        recipientName="Jane Doe"
        sales={[baseSale]}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('Hi Jane Doe,')
  })

  it('should use generic greeting when recipient name is not provided', () => {
    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={[baseSale]}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('Hi there,')
  })

  it('should include hours before start in message for single sale', () => {
    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={[baseSale]}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('next 24 hours')
  })

  it('should include hours before start in message for multiple sales', () => {
    const sales: SaleDigestItem[] = [baseSale, {
      saleId: 'sale-2',
      saleTitle: 'Another Sale',
      saleAddress: '456 Oak Ave',
      dateRange: 'Sat, Dec 7, 2025',
      saleUrl: 'https://lootaura.com/sales/sale-2',
    }]

    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={sales}
        hoursBeforeStart={48}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('next 48 hours')
  })

  it('should include time window when provided', () => {
    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={[baseSale]}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    expect(html).toContain('8:00 AM – 2:00 PM')
  })

  it('should render all sale details for multiple sales', () => {
    const sales: SaleDigestItem[] = [
      {
        saleId: 'sale-1',
        saleTitle: 'First Sale',
        saleAddress: '123 Main St',
        dateRange: 'Sat, Dec 7, 2025 · 8:00 AM',
        saleUrl: 'https://lootaura.com/sales/sale-1',
      },
      {
        saleId: 'sale-2',
        saleTitle: 'Second Sale',
        saleAddress: '456 Oak Ave',
        dateRange: 'Sat, Dec 7, 2025 · 9:00 AM',
        timeWindow: '9:00 AM – 3:00 PM',
        saleUrl: 'https://lootaura.com/sales/sale-2',
      },
    ]

    const { container } = render(
      <FavoriteSalesStartingSoonDigestEmail
        sales={sales}
        hoursBeforeStart={24}
      />
    )
    const html = container.innerHTML

    // Check all sale titles appear
    expect(html).toContain('First Sale')
    expect(html).toContain('Second Sale')
    
    // Check all addresses appear
    expect(html).toContain('123 Main St')
    expect(html).toContain('456 Oak Ave')
    
    // Check all URLs appear
    expect(html).toContain('https://lootaura.com/sales/sale-1')
    expect(html).toContain('https://lootaura.com/sales/sale-2')
  })
})

describe('buildFavoriteSalesStartingSoonDigestSubject', () => {
  it('should generate correct subject for single sale', () => {
    const sales: SaleDigestItem[] = [{
      saleId: 'sale-1',
      saleTitle: 'My Awesome Sale',
      saleAddress: '123 Main St',
      dateRange: 'Sat, Dec 7, 2025',
      saleUrl: 'https://lootaura.com/sales/sale-1',
    }]

    const subject = buildFavoriteSalesStartingSoonDigestSubject(sales)
    expect(subject).toBe('A sale you saved is starting soon: My Awesome Sale')
  })

  it('should generate correct subject for multiple sales', () => {
    const sales: SaleDigestItem[] = [
      {
        saleId: 'sale-1',
        saleTitle: 'First Sale',
        saleAddress: '123 Main St',
        dateRange: 'Sat, Dec 7, 2025',
        saleUrl: 'https://lootaura.com/sales/sale-1',
      },
      {
        saleId: 'sale-2',
        saleTitle: 'Second Sale',
        saleAddress: '456 Oak Ave',
        dateRange: 'Sat, Dec 7, 2025',
        saleUrl: 'https://lootaura.com/sales/sale-2',
      },
    ]

    const subject = buildFavoriteSalesStartingSoonDigestSubject(sales)
    expect(subject).toBe('Several saved sales are starting soon near you')
  })

  it('should handle empty sales array gracefully', () => {
    const subject = buildFavoriteSalesStartingSoonDigestSubject([])
    expect(subject).toBe('Saved sales starting soon')
  })
})

