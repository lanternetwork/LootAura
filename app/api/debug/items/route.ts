import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'

export const dynamic = 'force-dynamic'

/**
 * Diagnostic endpoint to check if items exist for a sale
 * ADMIN-ONLY: Requires admin authentication
 * Bypasses RLS to verify if items exist in the database
 * Usage: /api/debug/items?sale_id=<sale-id>
 */
export async function GET(request: NextRequest) {
  try {
    // Hard-disable in production - no env var override
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404 }
      )
    }
    
    // Admin gating - this endpoint exposes sensitive data (owner_id, moderation_status)
    await assertAdminOrThrow(request)
    
    const { searchParams } = new URL(request.url)
    const saleId = searchParams.get('sale_id')
    
    if (!saleId) {
      return NextResponse.json({ error: 'Missing sale_id parameter' }, { status: 400 })
    }
    
    // Use admin client to bypass RLS (admin-only operation)
    const admin = getAdminDb()
    
    // Check if items exist in base table
    const { data: items, error } = await fromBase(admin, 'items')
      .select('id, sale_id, name, price, created_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })
    
    if (error) {
      return NextResponse.json({
        saleId,
        itemsExist: false,
        error: error.message,
        errorCode: error.code,
      }, { status: 500 })
    }
    
    // Also check the sale status
    const { data: sale, error: saleError } = await fromBase(admin, 'sales')
      .select('id, status, owner_id, moderation_status')
      .eq('id', saleId)
      .single()
    
    return NextResponse.json({
      saleId,
      itemsExist: (items?.length || 0) > 0,
      itemsCount: items?.length || 0,
      items: items || [],
      sale: sale ? {
        id: sale.id,
        status: sale.status,
        owner_id: sale.owner_id,
        moderation_status: (sale as any).moderation_status,
      } : null,
      saleError: saleError ? {
        message: saleError.message,
        code: saleError.code,
      } : null,
      note: 'This endpoint bypasses RLS. If itemsExist=true but items don\'t appear in the app, RLS is blocking them.',
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    }, { status: 500 })
  }
}

