import { describe, it, expect } from 'vitest'
import { buildSocialReportPngFilename } from '@/lib/admin/social/buildSocialReportPngFilename'

describe('buildSocialReportPngFilename', () => {
  it('builds deterministic filename without PII beyond city slug', () => {
    const filename = buildSocialReportPngFilename({
      citySlug: 'austin-tx',
      formatSlug: 'instagram-feed',
      exportedAt: new Date('2026-06-13T15:30:00.000Z'),
    })

    expect(filename).toBe('lootaura-social-austin-tx-instagram-feed-2026-06-13.png')
  })

  it('supports vertical-story format slug', () => {
    const filename = buildSocialReportPngFilename({
      citySlug: 'houston-tx',
      formatSlug: 'vertical-story',
      exportedAt: new Date('2026-06-14T00:00:00.000Z'),
    })

    expect(filename).toBe('lootaura-social-houston-tx-vertical-story-2026-06-14.png')
  })
})
