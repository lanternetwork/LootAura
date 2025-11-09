import { NextResponse } from 'next/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'

export async function GET() {
  try {
    const db = getRlsDb()
    const { data, error } = await fromBase(db, 'sales').select('id').limit(1)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}


