// NOTE: Writes → lootaura_v2.* only. Reads may use views.
import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getRlsDb, fromBase } from '@/lib/supabase/clients'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

interface SeedRequest {
  ownerId?: string
  saleId?: string
  days: number
  perDay: number
  eventMix?: {
    view?: number
    save?: number
    click?: number
    share?: number
    favorite?: number
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const { user } = await assertAdminOrThrow(request)

    const body: SeedRequest = await request.json()
    const { ownerId, saleId, days, perDay, eventMix } = body

    // Default event mix if not provided
    const mix = eventMix || {
      view: 50,
      save: 20,
      click: 15,
      share: 10,
      favorite: 5,
    }

    // Calculate total events per type
    const totalEvents = perDay * days
    const totalMix = Object.values(mix).reduce((sum, val) => sum + (val || 0), 0)
    const eventsPerType = Object.entries(mix).map(([type, count]) => ({
      type,
      count: Math.round((count || 0) / totalMix * totalEvents),
    }))

    // Resolve target sales
    let targetSales: Array<{ id: string; owner_id: string }> = []

    if (saleId) {
      // Use specific sale
      const db = await getRlsDb()
      const { data: sale, error: saleError } = await fromBase(db, 'sales')
        .select('id, owner_id')
        .eq('id', saleId)
        .single()

      if (saleError || !sale) {
        return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
      }

      targetSales = [sale]
    } else if (ownerId) {
      // Fetch up to 25 recent sales for owner
      const db = await getRlsDb()
      const { data: sales, error: salesError } = await fromBase(db, 'sales')
        .select('id, owner_id')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(25)

      if (salesError) {
        return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
      }

      targetSales = sales || []
    } else {
      // Use current user's sales
      const db = await getRlsDb()
      const { data: sales, error: salesError } = await fromBase(db, 'sales')
        .select('id, owner_id')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25)

      if (salesError) {
        return NextResponse.json({ error: 'Failed to fetch sales' }, { status: 500 })
      }

      targetSales = sales || []
    }

    if (targetSales.length === 0) {
      return NextResponse.json({ error: 'No sales found to seed events for' }, { status: 404 })
    }

    // Generate synthetic events
    const events: Array<{
      sale_id: string
      owner_id: string
      user_id: string | null
      event_type: string
      ts: string
      referrer: string | null
      user_agent: string | null
      is_test: boolean
    }> = []

    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - days)

    eventsPerType.forEach(({ type, count }) => {
      for (let i = 0; i < count; i++) {
        // Distribute events across the time range
        const randomDays = Math.random() * days
        const randomHours = Math.random() * 24
        const eventDate = new Date(startDate)
        eventDate.setDate(eventDate.getDate() + randomDays)
        eventDate.setHours(randomHours)

        // Pick a random sale
        const sale = targetSales[Math.floor(Math.random() * targetSales.length)]

        events.push({
          sale_id: sale.id,
          owner_id: sale.owner_id,
          user_id: null, // Test events don't have user_id
          event_type: type,
          ts: eventDate.toISOString(),
          referrer: 'https://test.lootaura.com',
          user_agent: 'LootAura Test Bot/1.0',
          is_test: true,
        })
      }
    })

    // Check if we have events to insert
    if (events.length === 0) {
      return NextResponse.json({ 
        error: 'No events generated to insert. Check event mix configuration.' 
      }, { status: 400 })
    }

    // Write with admin client
    const adminDb = getAdminDb()
    const { data: inserted, error: insertError } = await fromBase(adminDb, 'analytics_events')
      .insert(events)
      .select('id')

    if (insertError) {
      const errorCode = (insertError as any)?.code
      const errorMessage = (insertError as any)?.message || 'Unknown error'
      
      console.error('[ANALYTICS_SEED] Error inserting events:', {
        code: errorCode,
        message: errorMessage,
      })
      
      // Check if table doesn't exist
      if (errorCode === '42P01' || 
          errorMessage.includes('does not exist') ||
          errorMessage.includes('Could not find the table') ||
          errorMessage.includes('schema cache')) {
        return NextResponse.json({ 
          error: 'Analytics table does not exist. Please run database migrations first.' 
        }, { status: 400 })
      }
      
      return NextResponse.json({ 
        error: `Failed to seed events: ${errorMessage}` 
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      inserted: inserted?.length || 0,
    })
  } catch (error) {
    if (error instanceof NextResponse) {
      return error
    }
    
    // Log the full error for debugging
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = (error as any)?.code
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('[ANALYTICS_SEED] Unexpected error:', {
      message: errorMessage,
      code: errorCode,
      stack: errorStack,
      error,
    })
    
    // Check if it's a table doesn't exist error
    if (errorCode === '42P01' || 
        errorMessage.includes('does not exist') ||
        errorMessage.includes('Could not find the table') ||
        errorMessage.includes('schema cache')) {
      return NextResponse.json({ 
        error: 'Analytics table does not exist. Please run database migrations first.' 
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      error: `Internal server error: ${errorMessage}` 
    }, { status: 500 })
  }
}

