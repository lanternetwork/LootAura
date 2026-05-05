/**
 * Share API - Handle shortlink generation and retrieval
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabase/clients'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { Policies, type Policy } from '@/lib/rateLimit/policies'
import { shouldBypassRateLimit } from '@/lib/rateLimit/config'
import { deriveKey } from '@/lib/rateLimit/keys'
import { check } from '@/lib/rateLimit/limiter'
import { applyRateHeaders } from '@/lib/rateLimit/headers'

const MAX_SHARE_PAYLOAD_BYTES = 32 * 1024

// Schema for share request
const ShareRequestSchema = z.object({
  state: z.object({
    view: z.object({
      lat: z.number(),
      lng: z.number(),
      zoom: z.number()
    }),
    filters: z.object({
      dateRange: z.string().optional(),
      categories: z.array(z.string()).optional(),
      radius: z.number().optional()
    })
  })
})

// Schema for share response
const ShareResponseSchema = z.object({
  shortId: z.string()
})

// Schema for share retrieval
const ShareRetrievalSchema = z.object({
  state: z.object({
    view: z.object({
      lat: z.number(),
      lng: z.number(),
      zoom: z.number()
    }),
    filters: z.object({
      dateRange: z.string().optional(),
      categories: z.array(z.string()).optional(),
      radius: z.number().optional()
    })
  })
})

async function enforceRateLimit(request: NextRequest, policies: Policy[]): Promise<NextResponse | null> {
  if (shouldBypassRateLimit()) {
    return null
  }

  let mostRestrictive: {
    allowed: boolean
    softLimited: boolean
    remaining: number
    resetAt: number
    policy: Policy
  } | null = null

  for (const policy of policies) {
    const key = await deriveKey(request, policy.scope)
    const result = await check(policy, key)
    if (
      !mostRestrictive ||
      (!result.allowed && mostRestrictive.allowed) ||
      (result.allowed && mostRestrictive.allowed && result.remaining < mostRestrictive.remaining)
    ) {
      mostRestrictive = { ...result, policy }
    }
  }

  if (!mostRestrictive) {
    return null
  }

  if (!mostRestrictive.allowed) {
    const response = NextResponse.json(
      { code: 'RATE_LIMITED', message: 'Too many requests' },
      { status: 429 }
    )
    return applyRateHeaders(
      response,
      mostRestrictive.policy,
      mostRestrictive.remaining,
      mostRestrictive.resetAt,
      mostRestrictive.softLimited
    ) as NextResponse
  }

  return null
}

/**
 * POST /api/share - Create a new shareable link
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(request, [Policies.AUTH_DEFAULT, Policies.AUTH_HOURLY])
    if (rateLimited) {
      return rateLimited
    }

    const rawBody = await request.text()
    const bodySizeBytes = new TextEncoder().encode(rawBody).length
    if (bodySizeBytes > MAX_SHARE_PAYLOAD_BYTES) {
      return NextResponse.json(
        { code: 'PAYLOAD_TOO_LARGE', message: 'Request too large' },
        { status: 413 }
      )
    }
    const body = JSON.parse(rawBody)
    const { state } = ShareRequestSchema.parse(body)

    const shortId = nanoid(8) // 8-character short ID

    // Server-only: lootaura_v2.shared_states (see migration 156). Same API as before.
    const { error } = await getAdminDb()
      .from('shared_states')
      .insert({
        id: shortId,
        state_json: state,
        version: 1
      })

    if (error) {
      console.error('Failed to store shared state:', error)
      return NextResponse.json(
        { error: 'Failed to create shareable link' },
        { status: 500 }
      )
    }

    const response = ShareResponseSchema.parse({ shortId })

    return NextResponse.json(response)
  } catch (error) {
    console.error('Share API error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request format', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/share?id=shortId - Retrieve shared state
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimited = await enforceRateLimit(request, [Policies.SALES_VIEW_30S, Policies.SALES_VIEW_HOURLY])
    if (rateLimited) {
      return rateLimited
    }

    const { searchParams } = new URL(request.url)
    const shortId = searchParams.get('id')

    if (!shortId) {
      return NextResponse.json(
        { error: 'Missing short ID' },
        { status: 400 }
      )
    }

    const { data, error } = await getAdminDb()
      .from('shared_states')
      .select('state_json')
      .eq('id', shortId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Share link not found' },
          { status: 404 }
        )
      }
      
      console.error('Failed to retrieve shared state:', error)
      return NextResponse.json(
        { error: 'Failed to retrieve shareable link' },
        { status: 500 }
      )
    }

    const response = ShareRetrievalSchema.parse({ state: data.state_json })

    return NextResponse.json(response)
  } catch (error) {
    console.error('Share retrieval error:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid response format', details: error.errors },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
