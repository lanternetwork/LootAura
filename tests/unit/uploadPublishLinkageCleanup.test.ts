import { describe, it, expect } from 'vitest'
import { publishLinkageFieldsToClearOnReopenUpload } from '@/lib/ingestion/uploadPublishLinkageCleanup'

describe('publishLinkageFieldsToClearOnReopenUpload', () => {
  it('clears published_sale_id and published_at for needs_geocode', () => {
    expect(publishLinkageFieldsToClearOnReopenUpload('needs_geocode')).toEqual({
      published_sale_id: null,
      published_at: null,
    })
  })

  it('clears for needs_check and ready and publishing', () => {
    expect(publishLinkageFieldsToClearOnReopenUpload('needs_check')).toEqual({
      published_sale_id: null,
      published_at: null,
    })
    expect(publishLinkageFieldsToClearOnReopenUpload('ready')).toEqual({
      published_sale_id: null,
      published_at: null,
    })
    expect(publishLinkageFieldsToClearOnReopenUpload('publishing')).toEqual({
      published_sale_id: null,
      published_at: null,
    })
  })

  it('does not clear when status remains published', () => {
    expect(publishLinkageFieldsToClearOnReopenUpload('published')).toBeNull()
  })

  it('returns null for other statuses (e.g. publish_failed)', () => {
    expect(publishLinkageFieldsToClearOnReopenUpload('publish_failed')).toBeNull()
    expect(publishLinkageFieldsToClearOnReopenUpload('rejected')).toBeNull()
  })
})
