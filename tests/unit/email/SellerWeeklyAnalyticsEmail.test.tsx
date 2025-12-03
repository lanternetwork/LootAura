import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  SellerWeeklyAnalyticsEmail,
  buildSellerWeeklyAnalyticsSubject,
} from '@/lib/email/templates/SellerWeeklyAnalyticsEmail'

describe('SellerWeeklyAnalyticsEmail', () => {
  const baseProps = {
    totalViews: 150,
    totalSaves: 25,
    totalClicks: 10,
    topSales: [
      {
        title: 'Vintage Furniture Sale',
        views: 100,
        saves: 15,
        clicks: 8,
        ctr: 8.0,
      },
      {
        title: 'Electronics Clearance',
        views: 50,
        saves: 10,
        clicks: 2,
        ctr: 4.0,
      },
    ],
    dashboardUrl: 'https://lootaura.com/dashboard',
    weekStart: 'Mon, Jan 1',
    weekEnd: 'Sun, Jan 7',
  }

  it('should render without throwing', () => {
    expect(() => {
      render(<SellerWeeklyAnalyticsEmail {...baseProps} />)
    }).not.toThrow()
  })

  it('should include total views in rendered output', () => {
    const { container } = render(<SellerWeeklyAnalyticsEmail {...baseProps} />)
    expect(container.innerHTML).toContain('150')
  })

  it('should include total saves in rendered output', () => {
    const { container } = render(<SellerWeeklyAnalyticsEmail {...baseProps} />)
    expect(container.innerHTML).toContain('25')
  })

  it('should include total clicks in rendered output', () => {
    const { container } = render(<SellerWeeklyAnalyticsEmail {...baseProps} />)
    expect(container.innerHTML).toContain('10')
  })

  it('should include top sales in rendered output', () => {
    const { container } = render(<SellerWeeklyAnalyticsEmail {...baseProps} />)
    expect(container.innerHTML).toContain('Vintage Furniture Sale')
    expect(container.innerHTML).toContain('Electronics Clearance')
  })

  it('should include dashboard URL in the CTA button', () => {
    const { container } = render(<SellerWeeklyAnalyticsEmail {...baseProps} />)
    // React Email Button component renders as an anchor tag, not a button
    const link = container.querySelector(`a[href="${baseProps.dashboardUrl}"]`)
    expect(link).toBeTruthy()
    expect(link?.textContent).toContain('View Detailed Stats')
  })

  it('should use owner display name when provided', () => {
    const propsWithName = { ...baseProps, ownerDisplayName: 'Jane Seller' }
    const { container } = render(<SellerWeeklyAnalyticsEmail {...propsWithName} />)
    expect(container.innerHTML).toContain('Hi Jane Seller,')
  })

  it('should use generic greeting when owner display name is not provided', () => {
    const propsWithoutName = { ...baseProps, ownerDisplayName: undefined }
    const { container } = render(<SellerWeeklyAnalyticsEmail {...propsWithoutName} />)
    expect(container.innerHTML).toContain('Hi there,')
  })

  it('should calculate and display CTR correctly', () => {
    const { container } = render(<SellerWeeklyAnalyticsEmail {...baseProps} />)
    // CTR = (10 / 150) * 100 = 6.67%
    expect(container.innerHTML).toMatch(/6\.\d+%/)
  })

  it('should handle zero metrics gracefully', () => {
    const zeroProps = {
      ...baseProps,
      totalViews: 0,
      totalSaves: 0,
      totalClicks: 0,
      topSales: [],
    }
    expect(() => {
      render(<SellerWeeklyAnalyticsEmail {...zeroProps} />)
    }).not.toThrow()
  })

  it('should format large numbers with commas', () => {
    const largeProps = {
      ...baseProps,
      totalViews: 12345,
      totalSaves: 6789,
      totalClicks: 1234,
    }
    const { container } = render(<SellerWeeklyAnalyticsEmail {...largeProps} />)
    expect(container.innerHTML).toContain('12,345')
    expect(container.innerHTML).toContain('6,789')
    expect(container.innerHTML).toContain('1,234')
  })
})

describe('buildSellerWeeklyAnalyticsSubject', () => {
  it('should generate correct subject line', () => {
    const subject = buildSellerWeeklyAnalyticsSubject('Mon, Jan 1')
    expect(subject).toBe('Your LootAura weekly summary - Mon, Jan 1')
  })
})

