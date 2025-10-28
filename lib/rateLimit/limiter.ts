/**
 * Rate Limiting Core Logic
 * 
 * Implements sliding window rate limiting with soft-then-hard behavior.
 * Tracks per-policy window counts and enforces limits.
 */

import { Policy } from './policies'
import { incrAndGet } from './store'

export interface RateLimitResult {
  allowed: boolean
  softLimited: boolean
  remaining: number
  resetAt: number
}

export async function check(
  policy: Policy, 
  key: string
): Promise<RateLimitResult> {
  const windowKey = `${key}:${policy.name}`
  const { count, resetAt } = await incrAndGet(windowKey, policy.windowSec)
  
  // Hard limit check
  if (count > policy.limit) {
    // Check for soft grace period
    if (policy.burstSoft && policy.softWindowSec) {
      const softWindowKey = `${key}:${policy.name}:soft`
      const softResult = await incrAndGet(softWindowKey, policy.softWindowSec)
      
      if (softResult.count <= policy.burstSoft) {
        return {
          allowed: true,
          softLimited: true,
          remaining: 0,
          resetAt
        }
      }
    }
    
    // Hard block
    return {
      allowed: false,
      softLimited: false,
      remaining: 0,
      resetAt
    }
  }
  
  // Within limits
  return {
    allowed: true,
    softLimited: false,
    remaining: Math.max(0, policy.limit - count),
    resetAt
  }
}
