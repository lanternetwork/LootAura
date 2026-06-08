export type SocialCityReportMapPin = {
  id: string
  lat: number
  lng: number
  title: string
  is_featured: boolean
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
}

export type SocialMetroOption = {
  slug: string
  city: string
  state: string
  label: string
}
