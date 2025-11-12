import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserProfile } from '@/lib/data/profileAccess'
import EditProfileClient from './EditProfileClient'

export const dynamic = 'force-dynamic'

export default async function EditProfilePage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Auth gate: redirect to sign-in if not logged in
  if (authError || !user) {
    redirect('/auth/signin?redirectTo=/account/edit')
  }

  // Fetch current profile (SSR) via safe reader from profiles_v2 view
  const profile = await getUserProfile(supabase, user.id)

  if (!profile) {
    // If profile doesn't exist, redirect to dashboard
    redirect('/dashboard')
  }

  return <EditProfileClient initialProfile={profile} />
}

