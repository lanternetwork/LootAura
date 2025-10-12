import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/admin/tools', request.url))
  // Clear la_loc cookie
  res.cookies.set({ name: 'la_loc', value: '', maxAge: 0, path: '/' })
  return res
}


