export type SocialCityReportMapPin = {
  id: string
  lat: number
  lng: number
  title: string
  is_featured: boolean
}

export type SocialCityReportMapFitBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type SocialCityReport = {
  city: string
  state: string
  citySlug: string
  activeSales: number
  cityRank: number
  updatedAt: string
  weekendStart: string
  weekendEnd: string
  weekendLabel: string
  heroDateRange: string
  timestampLabel: string
  caption: string
  mapPins: SocialCityReportMapPin[]
  /** Mappable pins before 500 cap (weekend + market geography). */
  mapPinsBeforeCap: number
  /** fitBounds from all qualifying mappable pins before cap. */
  mapFitBounds: SocialCityReportMapFitBounds | null
}

export type SocialMetroOption = {
  slug: string
  city: string
  state: string
  label: string
}
