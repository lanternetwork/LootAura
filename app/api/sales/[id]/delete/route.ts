import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: user } = await supabase.auth.getUser()
  if (!user?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  
  const saleId = params.id
  
  const { error } = await supabase
    .from('sales_v2')
    .delete()
    .eq('id', saleId)
    .eq('owner_id', user.user.id)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}

