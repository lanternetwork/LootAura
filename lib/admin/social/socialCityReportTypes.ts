export type SocialCityReportMapPin = {
  id: string
  lat: number
  lng: number
  title: string
  is_featured: boolean
}

export type SocialCityReportMapViewport = {
  centerLat: number
  centerLng: number
  zoom: number
}

export type SocialCityReport = {
  city: string
  state: string
  citySlug: string
  activeSales: number
  estateSales: number
  yardSales: number
  /** Rank among preset cities, or null when selected city has no ranking preset. */
  cityRank: number | null
  updatedAt: string
  weekendStart: string
  weekendEnd: string
  weekendLabel: string
  heroDateRange: string
  timestampLabel: string
  caption: string
  mapPins: SocialCityReportMapPin[]
  mapViewport: SocialCityReportMapViewport
}

export type SocialMetroOption = {
  slug: string
  city: string
  state: string
  label: string
}
