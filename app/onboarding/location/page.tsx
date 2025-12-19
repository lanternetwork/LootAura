import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import OnboardingLocationClient from './OnboardingLocationClient'

export default async function OnboardingLocationPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If not authenticated, redirect to signin with return path
  if (!user) {
    redirect(`/auth/signin?redirectTo=${encodeURIComponent('/onboarding/location')}`)
  }

  // Check if user already has home_zip (shouldn't be here if they do, but double-check)
  const { data: profile } = await supabase
    .from('profiles_v2')
    .select('home_zip')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.home_zip) {
    // User already has home_zip, redirect to sales
    redirect('/sales')
  }

  return <OnboardingLocationClient />
}

