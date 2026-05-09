import { describe, it, expect } from 'vitest'
import { Policies } from '@/lib/rateLimit/policies'
import { pickDenialForResponse, pickTightestAllowed } from '@/lib/rateLimit/pickRateLimitWinners'

describe('pickDenialForResponse', () => {
  it('returns null when all policies allow', () => {
    const r = pickDenialForResponse([
      {
        policy: Policies.ADMIN_TOOLS,
        result: { allowed: true, softLimited: false, remaining: 2, resetAt: 100 },
      },
      {
        policy: Policies.ADMIN_HOURLY,
        result: { allowed: true, softLimited: false, remaining: 50, resetAt: 200 },
      },
    ])
    expect(r).toBeNull()
  })

  it('uses max resetAt when multiple policies deny', () => {
    const r = pickDenialForResponse([
      {
        policy: Policies.ADMIN_TOOLS,
        result: { allowed: false, softLimited: false, remaining: 0, resetAt: 100 },
      },
      {
        policy: Policies.ADMIN_HOURLY,
        result: { allowed: false, softLimited: false, remaining: 0, resetAt: 500 },
      },
    ])
    expect(r).not.toBeNull()
    expect(r!.resetAt).toBe(500)
    expect(r!.denyingPolicyNames).toEqual(['ADMIN_HOURLY', 'ADMIN_TOOLS'])
    expect(r!.policy.name).toBe('ADMIN_HOURLY')
  })

  it('lists single denying policy', () => {
    const r = pickDenialForResponse([
      {
        policy: Policies.ADMIN_TOOLS,
        result: { allowed: false, softLimited: false, remaining: 0, resetAt: 90 },
      },
      {
        policy: Policies.ADMIN_HOURLY,
        result: { allowed: true, softLimited: false, remaining: 10, resetAt: 400 },
      },
    ])
    expect(r!.resetAt).toBe(90)
    expect(r!.denyingPolicyNames).toEqual(['ADMIN_TOOLS'])
  })
})

describe('pickTightestAllowed', () => {
  it('returns null when nothing allowed', () => {
    expect(
      pickTightestAllowed([
        {
          policy: Policies.ADMIN_TOOLS,
          result: { allowed: false, softLimited: false, remaining: 0, resetAt: 100 },
        },
      ])
    ).toBeNull()
  })

  it('picks smallest remaining among allowed', () => {
    const t = pickTightestAllowed([
      {
        policy: Policies.ADMIN_TOOLS,
        result: { allowed: true, softLimited: false, remaining: 2, resetAt: 100 },
      },
      {
        policy: Policies.ADMIN_HOURLY,
        result: { allowed: true, softLimited: false, remaining: 40, resetAt: 200 },
      },
    ])
    expect(t!.policy.name).toBe('ADMIN_TOOLS')
    expect(t!.result.remaining).toBe(2)
  })
})
