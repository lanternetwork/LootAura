/**
 * When multiple policies apply, pick which denial drives Retry-After (max reset)
 * and which allowed result is tightest for success-path headers (min remaining).
 */

import type { Policy } from './policies'
import type { RateLimitResult } from './limiter'

export type PolicyCheck = Readonly<{ policy: Policy; result: RateLimitResult }>

/** If any policy denies, use the latest bucket end among denials (longest wait). */
export function pickDenialForResponse(
  checks: ReadonlyArray<PolicyCheck>
): { policy: Policy; resetAt: number; denyingPolicyNames: string[] } | null {
  const denied = checks.filter((c) => !c.result.allowed)
  if (denied.length === 0) return null

  const maxReset = Math.max(...denied.map((d) => d.result.resetAt))
  const tied = denied.filter((d) => d.result.resetAt === maxReset)
  const policy = tied[0].policy

  const denyingPolicyNames = [...new Set(denied.map((d) => d.policy.name))].sort()

  return {
    policy,
    resetAt: maxReset,
    denyingPolicyNames,
  }
}

/** Among allowed checks, smallest remaining budget (most restrictive for headers). */
export function pickTightestAllowed(checks: ReadonlyArray<PolicyCheck>): PolicyCheck | null {
  const allowed = checks.filter((c) => c.result.allowed)
  if (allowed.length === 0) return null

  return allowed.reduce((best, cur) =>
    cur.result.remaining < best.result.remaining ? cur : best
  )
}
