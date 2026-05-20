import type { YstmDetailAddressSource } from '@/lib/ingestion/acquisition/ystmDetailPageAddressResolver'

export type YstmDetailPageGoldenExpectation = {
  name: string
  fixtureFile: string
  sourceUrl: string
  configCity: string
  configState: string
  expectNull: boolean
  title?: string | RegExp
  addressContains?: string[]
  addressSource?: YstmDetailAddressSource | null
  expectNoAddress?: boolean
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
    addressSource: 'detail_dom',
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
    addressSource: 'detail_dom',
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
    addressSource: 'detail_dom',
    city: 'Chicago',
    state: 'IL',
    nativeCoords: { lat: 41.812252210000, lng: -87.711150220000 },
  },
  {
    name: 'montrose-full',
    fixtureFile: 'detail-montrose-full.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/1929-W-Montrose-Ave/961002738/listing.html',
    configCity: 'Chicago',
    configState: 'IL',
    expectNull: false,
    title: 'Yard Sale',
    addressContains: ['1929 W Montrose Ave'],
    addressSource: 'detail_dom',
    city: 'Chicago',
    state: 'IL',
    startDate: '2026-05-23',
    endDate: '2026-05-23',
    nativeCoords: { lat: 41.9613172, lng: -87.6772575 },
  },
  {
    name: 'oak-park-lombard',
    fixtureFile: 'detail-oak-park-lombard.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/515-N-Lombard-Ave/2439464/userlisting.html',
    configCity: 'Chicago',
    configState: 'IL',
    expectNull: false,
    title: /Alley sale/,
    addressContains: ['515 N Lombard Ave', 'Oak Park'],
    addressSource: 'detail_dom',
    city: 'Oak Park',
    state: 'IL',
    startDate: '2026-05-23',
    endDate: '2026-05-24',
    nativeCoords: { lat: 41.895294, lng: -87.780373 },
  },
  {
    name: 'madison-evanston',
    fixtureFile: 'detail-madison-evanston.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/1325-Madison-St/21587281/userlisting.html',
    configCity: 'Chicago',
    configState: 'IL',
    expectNull: false,
    title: /1325 Madison/,
    addressContains: ['1325 Madison St', 'Evanston'],
    addressSource: 'detail_dom',
    city: 'Evanston',
    state: 'IL',
    startDate: '2026-05-23',
    endDate: '2026-05-23',
    nativeCoords: { lat: 42.031942, lng: -87.691272 },
  },
  {
    name: 'logan-square-hidden',
    fixtureFile: 'detail-logan-square-hidden.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/Logan-Square-Moving-Sale/2441465/userlisting.html',
    configCity: 'Chicago',
    configState: 'IL',
    expectNull: false,
    title: /Logan Square/,
    expectNoAddress: true,
    addressSource: null,
    nativeCoords: { lat: 41.92775, lng: -87.70562 },
  },
  {
    name: 'edgebrook-hidden',
    fixtureFile: 'detail-edgebrook-hidden.html',
    sourceUrl:
      'https://yardsaletreasuremap.com/US/Illinois/Chicago/Edgebrook-Estate-Sale/2441446/userlisting.html',
    configCity: 'Chicago',
    configState: 'IL',
    expectNull: false,
    title: /Edgebrook/,
    expectNoAddress: true,
    addressSource: null,
    nativeCoords: { lat: 41.99537, lng: -87.75367 },
  },
]
