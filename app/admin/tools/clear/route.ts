import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const res = NextResponse.redirect('/admin/tools')
  // Clear la_loc cookie
  res.cookies.set({ name: 'la_loc', value: '', maxAge: 0, path: '/' })
  return res
}


