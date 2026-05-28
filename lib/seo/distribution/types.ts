export type SeoDistributionSurfaceId =
  | 'reddit_city'
  | 'reddit_weekend'
  | 'facebook_city'
  | 'facebook_weekend'
  | 'digest_email'

export type SeoDistributionPack = {
  generatedAt: string
  metroSlug: string
  surface: SeoDistributionSurfaceId
  eligible: boolean
  blockers: string[]
  title: string
  body: string
  links: Array<{ label: string; url: string }>
}
