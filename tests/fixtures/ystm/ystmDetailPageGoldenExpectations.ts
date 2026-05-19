export type YstmDetailPageGoldenExpectation = {
  name: string
  fixtureFile: string
  sourceUrl: string
  configCity: string
  configState: string
  expectNull: boolean
  title?: string | RegExp
  addressContains?: string[]
  city?: string
  state?: string
  startDate?: string
  endDate?: string
  nativeCoords?: { lat: number; lng: number }
  minImageUrls?: number
}

export const YSTM_DETAIL_PAGE_GOLDEN_EXPECTATIONS: YstmDetailPageGoldenExpectation[] = [
  {
    name: 'louisville-devondale',
    fixtureFile: 'detail-louisville-devondale.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Kentucky/Louisville/1802-Devondale-Dr/38754131/userlisting.html',
    configCity: 'Louisville',
    configState: 'KY',
    expectNull: false,
    title: 'Our Biggest Yard Sale',
    addressContains: ['1802 Devondale Dr', 'Louisville'],
    city: 'Louisville',
    state: 'KY',
    startDate: '2026-05-23',
    endDate: '2026-05-23',
    nativeCoords: { lat: 38.276708, lng: -85.613833 },
  },
  {
    name: 'park-ridge-chicago',
    fixtureFile: 'detail-park-ridge-chicago.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/6519-N-Oliphant-Ave/2439464/userlisting.html',
    configCity: 'Chicago',
    configState: 'IL',
    expectNull: false,
    title: /Park Ridge/,
    addressContains: ['6519 N Oliphant Ave'],
    city: 'Chicago',
    state: 'IL',
    startDate: '2026-05-21',
    endDate: '2026-05-24',
    nativeCoords: { lat: 41.9987367, lng: -87.8199156 },
    minImageUrls: 2,
  },
  {
    name: 'native-coords-chicago',
    fixtureFile: 'detail-with-native-coords.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/4443-S-St-Louis-Ave/999/userlisting.html',
    configCity: 'Chicago',
    configState: 'IL',
    expectNull: false,
    title: 'Detail title',
    addressContains: ['4443 S St Louis Ave', 'Chicago'],
    city: 'Chicago',
    state: 'IL',
    nativeCoords: { lat: 41.812252210000, lng: -87.711150220000 },
  },
]
