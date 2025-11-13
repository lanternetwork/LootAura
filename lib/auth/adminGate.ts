/**
 * Admin authentication gate
 * Checks if the current user is an admin based on email
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'

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
  const isDebugMode = process.env.NEXT_PUBLIC_DEBUG === 'true'

  if (!isAdmin && !isDebugMode) {
    throw NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
  }

  return { user: { id: user.id, email: userEmail } }
}

/**
 * Require admin access for /admin/tools page
 * Checks if the current user is the specific admin email (lanternetwork@gmail.com)
 * Redirects to sign-in if not authenticated
 * Returns 404 if authenticated but not the admin email
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

  // Check if user is the specific admin email
  const ADMIN_EMAIL = 'lanternetwork@gmail.com'
  const isAdmin = userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase()

  if (!isAdmin) {
    // Authenticated but not the admin - return 404
    notFound()
  }

  return { user: { id: user.id, email: userEmail } }
}

