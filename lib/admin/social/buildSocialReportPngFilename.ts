import type { SocialReportFormatSlug } from '@/lib/admin/social/socialReportFormats'

export function buildSocialReportPngFilename({
  citySlug,
  formatSlug,
  exportedAt = new Date(),
}: {
  citySlug: string
  formatSlug: SocialReportFormatSlug
  exportedAt?: Date
}): string {
  const date = exportedAt.toISOString().slice(0, 10)
  return `lootaura-social-${citySlug}-${formatSlug}-${date}.png`
}
