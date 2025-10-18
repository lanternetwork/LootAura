/**
 * Share API - Handle shortlink generation and retrieval
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { nanoid } from 'nanoid'

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

/**
 * POST /api/share - Create a new shareable link
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { state } = ShareRequestSchema.parse(body)

    const supabase = createSupabaseServerClient()
    const shortId = nanoid(8) // 8-character short ID

    // Store in database
    const { error } = await supabase
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
    const { searchParams } = new URL(request.url)
    const shortId = searchParams.get('id')

    if (!shortId) {
      return NextResponse.json(
        { error: 'Missing short ID' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()

    // Retrieve from database
    const { data, error } = await supabase
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
