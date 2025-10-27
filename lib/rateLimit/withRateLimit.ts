/**
 * Rate Limiting Route Wrapper
 * 
 * Wraps Next.js API route handlers with rate limiting.
 * Enforces the most restrictive policy result across multiple policies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Policy } from './policies'
import { deriveKey } from './keys'
import { check } from './limiter'
import { applyRateHeaders } from './headers'
import { shouldBypassRateLimit } from './config'

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
    
    // Check all policies and find the most restrictive result
    let mostRestrictive: {
      allowed: boolean
      softLimited: boolean
      remaining: number
      resetAt: number
      policy: Policy
    } | null = null
    
    for (const policy of policies) {
      const policyKey = await deriveKey(req, policy.scope, opts.userId)
      const result = await check(policy, policyKey)
      
      // Track the most restrictive result
      if (!mostRestrictive || 
          (!result.allowed && mostRestrictive.allowed) ||
          (result.allowed && mostRestrictive.allowed && result.remaining < mostRestrictive.remaining)) {
        mostRestrictive = {
          ...result,
          policy
        }
      }
    }
    
    if (!mostRestrictive) {
      return handler(req)
    }
    
    // Handle hard limit
    if (!mostRestrictive.allowed) {
      const errorResponse = NextResponse.json(
        { error: 'rate_limited', message: 'Too many requests. Please slow down.' },
        { status: 429 }
      )
      
      return applyRateHeaders(
        errorResponse,
        mostRestrictive.policy,
        mostRestrictive.remaining,
        mostRestrictive.resetAt,
        mostRestrictive.softLimited
      ) as NextResponse
    }
    
    // Call handler and apply headers
    const response = await handler(req)
    
    return applyRateHeaders(
      response,
      mostRestrictive.policy,
      mostRestrictive.remaining,
      mostRestrictive.resetAt,
      mostRestrictive.softLimited
    ) as NextResponse
  }
}
