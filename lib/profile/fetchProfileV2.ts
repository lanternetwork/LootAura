import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProfileData } from '@/lib/data/profileAccess'

const PROFILE_V2_SELECT =
  'id, username, display_name, avatar_url, bio, location_city, location_region, created_at, verified, social_links, email_favorites_digest_enabled, email_seller_weekly_enabled'

/**
 * Read profile from profiles_v2 (public view over lootaura_v2.profiles).
 */
export async function fetchProfileV2(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileData | null> {
  const { data, error } = await supabase
    .from('profiles_v2')
    .select(PROFILE_V2_SELECT)
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data as ProfileData
}
