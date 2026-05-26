import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isCrossProviderIngestEnforcementEnabled,
  isCrossProviderPublishLinkEnforcementEnabled,
  isCrossProviderShadowEnabled,
} from '@/lib/ingestion/identity/crossProviderShadowEnforcement'

describe('crossProviderShadowEnforcement (Phase E default-on)', () => {
  const priorEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.INGESTION_CROSS_PROVIDER_ENFORCEMENT
    delete process.env.INGESTION_CROSS_PROVIDER_SHADOW
    delete process.env.INGESTION_CROSS_PROVIDER_INGEST_ENFORCE
    delete process.env.INGESTION_CROSS_PROVIDER_PUBLISH_LINK
    delete process.env.INGESTION_CROSS_PROVIDER_PUBLISH_ENFORCE
  })

  afterEach(() => {
    process.env = { ...priorEnv }
  })

  it('defaults shadow, ingest, and publish enforcement on', () => {
    expect(isCrossProviderShadowEnabled()).toBe(true)
    expect(isCrossProviderIngestEnforcementEnabled()).toBe(true)
    expect(isCrossProviderPublishLinkEnforcementEnabled()).toBe(true)
  })

  it('master kill switch disables all features', () => {
    process.env.INGESTION_CROSS_PROVIDER_ENFORCEMENT = 'false'
    expect(isCrossProviderShadowEnabled()).toBe(false)
    expect(isCrossProviderIngestEnforcementEnabled()).toBe(false)
    expect(isCrossProviderPublishLinkEnforcementEnabled()).toBe(false)
  })

  it('per-feature opt-out disables only that feature', () => {
    process.env.INGESTION_CROSS_PROVIDER_PUBLISH_LINK = 'false'
    expect(isCrossProviderShadowEnabled()).toBe(true)
    expect(isCrossProviderIngestEnforcementEnabled()).toBe(true)
    expect(isCrossProviderPublishLinkEnforcementEnabled()).toBe(false)
  })
})
