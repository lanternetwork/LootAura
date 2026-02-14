/**
 * Admin authentication gate
 * Checks if the current user is an admin based on email
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { redirect, notFound } from 'next/navigation'

/**
 * Assert that the current user is an admin
 * Throws NextResponse with 403 if not admin
 */
export async function assertAdminOrThrow(_req: Request): Promise<{ user: { id: string; email?: string } }> {
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
  const isDebugMode =
    process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEBUG === 'true'

  if (!isAdmin && !isDebugMode) {
    throw NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  return { user: { id: user.id, email: userEmail } }
}

/**
 * Require admin access for /admin/tools page
 * Checks if the current user is in the ADMIN_EMAILS list
 * Redirects to sign-in if not authenticated
 * Returns 404 if authenticated but not an admin
 */
export async function requireAdminToolsAccess(): Promise<{ user: { id: string; email: string } }> {
  const supabase = createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  // If no user, redirect to sign-in
  if (authError || !user) {
    redirect('/auth/signin?redirectTo=/admin/tools')
  }

  // Get user email
  const userEmail = user.email

  if (!userEmail) {
    // User exists but no email - return 404
    notFound()
  }

  // Check if user is in ADMIN_EMAILS list (required env var)
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []
  
  if (adminEmails.length === 0) {
    // ADMIN_EMAILS not configured - fail closed for security
    notFound()
  }

  const isAdmin = adminEmails.includes(userEmail.toLowerCase())

  if (!isAdmin) {
    // Authenticated but not an admin - return 404
    notFound()
  }

  return { user: { id: user.id, email: userEmail } }
}

