import { describe, it, expect } from 'vitest'
import {
  buildListingGeoLinks,
  buildListingBreadcrumbItems,
  resolvePilotMetroForSale,
} from '@/lib/seo/geoLinking'
import type { Sale } from '@/lib/types'

describe('geoLinking', () => {
  const dallasSale = {
    id: 's1',
    owner_id: 'o',
    title: 'Test',
    city: 'Dallas',
    state: 'TX',
    status: 'published',
  } as Sale

  it('resolves metro from sale city/state (nationwide, no allowlist)', () => {
    expect(resolvePilotMetroForSale(dallasSale)?.slug).toBe('dallas-tx')
    expect(resolvePilotMetroForSale({ city: 'Unknown', state: 'ZZ' })?.slug).toBe('unknown-zz')
    expect(resolvePilotMetroForSale({ city: '', state: 'TX' })).toBeNull()
  })

  it('builds city and weekend links when metro resolves', () => {
    const links = buildListingGeoLinks(dallasSale)
    expect(links.city?.href).toBe('/yard-sales/dallas-tx')
    expect(links.weekend?.href).toBe('/yard-sales-this-weekend/dallas-tx')
    expect(links.nearbyMetros).toEqual([])
  })

  it('includes metro in breadcrumb trail when resolved', () => {
    const crumbs = buildListingBreadcrumbItems(dallasSale)
    expect(crumbs.some((c) => c.name === 'Dallas')).toBe(true)
    expect(crumbs[crumbs.length - 1].name).toBe('Test')
  })
})
