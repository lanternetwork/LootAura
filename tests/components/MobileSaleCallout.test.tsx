import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MobileSaleCallout, { MOBILE_SALE_CALLOUT_Z_INDEX } from '@/components/sales/MobileSaleCallout'
import { makeSale } from '../_helpers/factories'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/lib/analytics-client', () => ({
  trackAnalyticsEvent: vi.fn(),
}))

vi.mock('@/components/FavoriteButton', () => ({
  __esModule: true,
  default: function MockFavoriteButton({ saleId }: { saleId: string }) {
    return (
      <button type="button" aria-label="Save sale" data-testid="callout-favorite">
        {saleId}
      </button>
    )
  },
}))

const defaultViewport = { center: { lat: 38, lng: -85 }, zoom: 10 }
const defaultPinPosition = { x: 100, y: 200 }

describe('MobileSaleCallout', () => {
  beforeEach(() => {
    push.mockClear()
  })

  it('renders favorite control in action area when sale is provided', () => {
    const sale = makeSale({ id: 'callout-sale-1', title: 'Map callout sale' })

    render(
      <MobileSaleCallout
        sale={sale}
        onDismiss={() => {}}
        viewport={defaultViewport}
        pinPosition={defaultPinPosition}
      />
    )

    const favoriteControl = screen.getByTestId('callout-favorite')
    expect(favoriteControl).toBeInTheDocument()
    expect(favoriteControl).toHaveAttribute('aria-label', 'Save sale')
  })

  it('renders null when sale is null', () => {
    const { container } = render(
      <MobileSaleCallout sale={null} onDismiss={() => {}} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('clicking favorite control does not dismiss the callout (pinPosition branch)', () => {
    const onDismiss = vi.fn()
    const sale = makeSale({ id: 'callout-sale-1', title: 'Map callout sale' })

    render(
      <MobileSaleCallout
        sale={sale}
        onDismiss={onDismiss}
        viewport={defaultViewport}
        pinPosition={defaultPinPosition}
      />
    )

    fireEvent.click(screen.getByTestId('callout-favorite'))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('shows distance from sale.distance_m when viewport is set', () => {
    const sale = makeSale({
      id: 'callout-sale-2',
      title: 'Nearby callout sale',
      lat: 38.26,
      lng: -85.76,
      distance_m: 804,
    })

    render(
      <MobileSaleCallout
        sale={sale}
        onDismiss={() => {}}
        viewport={{ center: { lat: 38.25, lng: -85.75 }, zoom: 10 }}
        pinPosition={defaultPinPosition}
      />
    )

    expect(screen.getByTestId('callout-distance-from-user')).toHaveTextContent('0.5 mi away')
  })

  it('View Sale navigates to the sale detail route with viewport params', () => {
    const sale = makeSale({ id: 'callout-sale-1', title: 'Map callout sale' })

    render(
      <MobileSaleCallout
        sale={sale}
        onDismiss={() => {}}
        viewport={defaultViewport}
        pinPosition={defaultPinPosition}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Sale' }))

    expect(push).toHaveBeenCalledWith('/sales/callout-sale-1?lat=38&lng=-85&zoom=10')
  })

  it('View Sale does not bubble to a parent map dismiss handler', () => {
    const parentClick = vi.fn()
    const sale = makeSale({ id: 'callout-sale-1', title: 'Map callout sale' })

    render(
      <div onClick={parentClick}>
        <MobileSaleCallout
          sale={sale}
          onDismiss={() => {}}
          viewport={defaultViewport}
          pinPosition={defaultPinPosition}
        />
      </div>
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Sale' }))

    expect(push).toHaveBeenCalledWith('/sales/callout-sale-1?lat=38&lng=-85&zoom=10')
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('callout root click does not bubble to a parent map dismiss handler', () => {
    const parentClick = vi.fn()
    const onDismiss = vi.fn()
    const sale = makeSale({ id: 'callout-sale-1', title: 'Map callout sale' })

    const { container } = render(
      <div onClick={parentClick}>
        <MobileSaleCallout
          sale={sale}
          onDismiss={onDismiss}
          viewport={defaultViewport}
          pinPosition={defaultPinPosition}
        />
      </div>
    )

    const calloutRoot = container.querySelector('[data-mobile-sale-callout="true"]')
    expect(calloutRoot).not.toBeNull()
    fireEvent.click(calloutRoot!)

    expect(parentClick).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('pin-position callout root captures pointer events and sits above FAB layer', () => {
    const sale = makeSale({ id: 'callout-sale-1', title: 'Map callout sale' })

    const { container } = render(
      <MobileSaleCallout
        sale={sale}
        onDismiss={() => {}}
        viewport={defaultViewport}
        pinPosition={defaultPinPosition}
      />
    )

    const calloutRoot = container.querySelector('[data-mobile-sale-callout="true"]') as HTMLElement
    expect(calloutRoot).toHaveClass('pointer-events-auto')
    expect(calloutRoot.style.zIndex).toBe(String(MOBILE_SALE_CALLOUT_Z_INDEX))
    expect(MOBILE_SALE_CALLOUT_Z_INDEX).toBeGreaterThan(110)
  })
})

describe('MobileSalesShell map dismiss contract', () => {
  const shellSource = readFileSync(
    path.resolve(process.cwd(), 'app/sales/MobileSalesShell.tsx'),
    'utf8'
  )
  const calloutSource = readFileSync(
    path.resolve(process.cwd(), 'components/sales/MobileSaleCallout.tsx'),
    'utf8'
  )

  it('guards wrapper dismiss with target === currentTarget', () => {
    expect(shellSource).toMatch(/e\.target !== e\.currentTarget/)
    expect(shellSource).toMatch(/handleMapClick/)
  })

  it('keeps SimpleMap onMapClick dismiss path for map canvas taps', () => {
    expect(shellSource).toMatch(/onMapClick=\{\(\) => \{/)
    expect(shellSource).toMatch(/onLocationClick\(selectedPinId\)/)
  })

  it('mobile callout z-index stays above FAB overlay z-[110]', () => {
    expect(shellSource).toMatch(/z-\[110\]/)
    expect(calloutSource).toMatch(/MOBILE_SALE_CALLOUT_Z_INDEX = 120/)
    expect(MOBILE_SALE_CALLOUT_Z_INDEX).toBeGreaterThan(110)
  })
})

describe('SalesClient desktop map dismiss contract', () => {
  const salesClientSource = readFileSync(
    path.resolve(process.cwd(), 'app/sales/SalesClient.tsx'),
    'utf8'
  )
  const simpleMapSource = readFileSync(
    path.resolve(process.cwd(), 'components/location/SimpleMap.tsx'),
    'utf8'
  )

  it('still guards desktop wrapper dismiss with target === currentTarget', () => {
    expect(salesClientSource).toMatch(/handleDesktopMapClick/)
    expect(salesClientSource).toMatch(/e\.target === e\.currentTarget/)
  })

  it('SimpleMap skips dismiss when click originates inside mobile sale callout', () => {
    expect(simpleMapSource).toMatch(/data-mobile-sale-callout="true"/)
    expect(simpleMapSource).toMatch(/isClickOnSaleCallout/)
  })
})
