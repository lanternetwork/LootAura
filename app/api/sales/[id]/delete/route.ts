// NOTE: Writes → lootaura_v2.* via schema-scoped clients. Reads from views allowed. Do not write to views.
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getRlsDb, fromBase } from '@/lib/supabase/clients'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const saleId = params.id
  
  // Write to base table using schema-scoped client
  const db = getRlsDb()
  const { error } = await fromBase(db, 'sales')
    .delete()
    .eq('id', saleId)
    .eq('owner_id', user.user.id)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}

