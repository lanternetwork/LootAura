import { Fragment } from 'react'
import SaleCard from './SaleCard'
import EmptyState from './EmptyState'
import { Sale } from '@/lib/types'
import { MobileListInlineAd, ListInlineAd } from '@/components/ads/AdSlots'
import { AdsenseGuard } from '@/components/ads/AdsenseGuard'

interface SalesListProps {
  sales: Sale[]
  _mode?: string
  viewport?: { center: { lat: number; lng: number }; zoom: number } | null
  /**
   * Whether the list is in a loading state
   * When true, no ads will be rendered (AdSense policy compliance)
   */
  isLoading?: boolean
}

/**
 * Minimum number of sales required before showing inline ads
 * AdSense policy: ads should only appear with meaningful content
 */
const MIN_SALES_FOR_ADS = 4

export default function SalesList({ sales, _mode, viewport, isLoading = false }: SalesListProps) {
  const isEmpty = !sales?.length

  // AdSense Policy Compliance: Never show ads when loading or empty
  if (isEmpty || isLoading) {
    if (isEmpty) {
      return (
        <EmptyState
          title="No Sales Found"
          cta={
            <a
              href="/explore?tab=add"
              className="link-accent font-medium"
            >
              Post the first sale
            </a>
          }
        />
      )
    }
    // Loading state - return empty div or skeleton (no ads)
    return null
  }

  // AdSense Policy Compliance: Only show ads when we have sufficient content
  const hasEnoughContent = sales.length >= MIN_SALES_FOR_ADS

  return (
    <div
      className="flex flex-col gap-3 sm:gap-4 md:grid md:grid-cols-1 lg:grid-cols-2"
      data-testid="sales-list"
      style={{ width: '100%' }}
    >
      {sales.map((sale, index) => (
        <Fragment key={sale.id}>
          <div>
            <SaleCard sale={sale} viewport={viewport} />
          </div>
          {/* Show inline ad after every 6th sale (indices 5, 11, 17, etc.) */}
          {/* Desktop only - mobile ads removed */}
          {/* Ad must be a direct child of grid to span columns */}
          {/* AdSense Policy: Only show ads when we have at least MIN_SALES_FOR_ADS sales */}
          {(index + 1) % 6 === 0 && index > 0 && hasEnoughContent && (
            <AdsenseGuard hasContent={hasEnoughContent}>
              <div
                className="hidden md:block md:col-span-2 lg:col-span-2"
                style={{
                  width: '100%',
                  minWidth: '200px',
                  gridColumn: '1 / -1' // Force full width span
                }}
              >
                <ListInlineAd />
              </div>
            </AdsenseGuard>
          )}
        </Fragment>
      ))}
    </div>
  )
}



