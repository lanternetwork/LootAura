/**
 * Admin authentication gate
 * Checks if the current user is an admin based on email
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Assert that the current user is an admin
 * Throws NextResponse with 403 if not admin
 */
export async function assertAdminOrThrow(req: Request): Promise<{ user: { id: string; email?: string } }> {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    throw NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get user email
  const userEmail = user.email

  if (!userEmail) {
    throw NextResponse.json({ error: 'User email not found' }, { status: 403 })
  }

  // Check if user is admin
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
  const isAdmin = adminEmails.includes(userEmail.toLowerCase())

  // Allow in debug mode for development
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true'

  if (!isAdmin && !isDebugMode) {
    throw NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  return { user: { id: user.id, email: userEmail } }
}

