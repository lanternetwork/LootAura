/**
 * Rate Limiting Route Wrapper
 * 
 * Wraps Next.js API route handlers with rate limiting.
 * Enforces the most restrictive policy result across multiple policies.
 */

import { NextRequest, NextResponse } from 'next/server'
import type { Policy } from './policies'
import { deriveKey } from './keys'
import { check } from './limiter'
import { applyRateHeaders } from './headers'
import { shouldBypassRateLimit } from './config'
import {
  pickDenialForResponse,
  pickTightestAllowed,
  type PolicyCheck,
} from './pickRateLimitWinners'

export interface RateLimitOptions {
  userId?: string
  bypass?: boolean
}

export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  policies: Policy[],
  opts: RateLimitOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    // Bypass if disabled or explicitly bypassed
    if (shouldBypassRateLimit() || opts.bypass) {
      return handler(req)
    }
    
    // Derive key from first policy's scope (or combine per-scope)
    const primaryPolicy = policies[0]
    await deriveKey(req, primaryPolicy.scope, opts.userId)

    const checks: PolicyCheck[] = []
    for (const policy of policies) {
      const policyKey = await deriveKey(req, policy.scope, opts.userId)
      const result = await check(policy, policyKey)
      checks.push({ policy, result })
    }

    const denial = pickDenialForResponse(checks)

    // Handle hard limit (any policy denies — Retry-After uses longest bucket end)
    if (denial) {
      const { logger } = await import('@/lib/log')
      logger.warn('Request rate-limited', {
        component: 'rateLimit',
        operation: 'rate_limit_exceeded',
        policy: denial.policy.name,
        policies: denial.denyingPolicyNames,
        scope: denial.policy.scope,
        path: req.nextUrl.pathname,
        remaining: 0,
      })

      const nowSec = Math.floor(Date.now() / 1000)
      const retryAfterSec = Math.max(1, denial.resetAt - nowSec)

      const errorResponse = NextResponse.json(
        {
          error: 'rate_limited',
          message: 'Too many requests. Please slow down.',
          retryAfterSec,
          denyingPolicies: denial.denyingPolicyNames,
        },
        { status: 429 }
      )

      return applyRateHeaders(
        errorResponse,
        denial.policy,
        0,
        denial.resetAt,
        false
      ) as NextResponse
    }

    const tightest = pickTightestAllowed(checks)
    if (!tightest) {
      return handler(req)
    }

    // Call handler and apply headers
    const response = await handler(req)

    return applyRateHeaders(
      response,
      tightest.policy,
      tightest.result.remaining,
      tightest.result.resetAt,
      tightest.result.softLimited
    ) as NextResponse
  }
}
