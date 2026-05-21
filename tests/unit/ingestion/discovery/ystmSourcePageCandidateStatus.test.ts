import { describe, expect, it } from 'vitest'
import {
  mapDiscoveryValidationToCandidateStatus,
  mapFetchErrorToCandidateStatus,
} from '@/lib/ingestion/discovery/ystmSourcePageCandidateStatus'

describe('ystmSourcePageCandidateStatus', () => {
  it('maps valid discovery to validated', () => {
    const mapped = mapDiscoveryValidationToCandidateStatus({ ok: true, kind: 'valid_city_page' })
    expect(mapped.status).toBe('validated')
  })

  it('maps shell trap to invalid_shell', () => {
    const mapped = mapDiscoveryValidationToCandidateStatus({
      ok: false,
      reason: 'state_shell_not_city_page',
    })
    expect(mapped.status).toBe('invalid_shell')
  })

  it('maps fetch errors', () => {
    expect(mapFetchErrorToCandidateStatus('http_error: 404').status).toBe('not_found')
    expect(mapFetchErrorToCandidateStatus('captcha required').status).toBe('blocked')
    expect(mapFetchErrorToCandidateStatus('timeout').status).toBe('fetch_failed')
  })
})
