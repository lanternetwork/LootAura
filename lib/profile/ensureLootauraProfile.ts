import type { User } from '@supabase/supabase-js'
import { getRlsBaseClient, getRlsDb } from '@/lib/supabase/clients'

export type EnsureLootauraProfileResult = {
  ok: boolean
  created: boolean
  userId?: string
  errorCode?: string
}

const DEFAULT_PREFERENCES = {
  notifications: { email: true, push: false },
  privacy: { show_email: false, show_phone: false },
}

function buildDisplayName(user: User): string {
  const fromMeta = user.user_metadata?.full_name
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim()
  const emailLocal = user.email?.split('@')[0]
  return emailLocal?.trim() || 'User'
}

function buildAvatarUrl(user: User): string | null {
  const url = user.user_metadata?.avatar_url
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

/**
 * Ensure the authenticated user has a row in lootaura_v2.profiles (RLS-safe).
 * Must run in a server context after session cookies are written to cookies().
 * Does not throw — callers must not block auth on failure.
 */
export async function ensureLootauraProfileExists(options?: {
  userId?: string
  displayName?: string
  avatarUrl?: string | null
}): Promise<EnsureLootauraProfileResult> {
  try {
    const authClient = await getRlsBaseClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()

    if (authError || !user) {
      console.error('[PROFILE_ENSURE] No authenticated user', {
        code: authError?.message ?? 'no_user',
      })
      return { ok: false, created: false, errorCode: 'unauthenticated' }
    }

    if (options?.userId && options.userId !== user.id) {
      console.error('[PROFILE_ENSURE] userId mismatch', { expected: options.userId })
      return { ok: false, created: false, userId: user.id, errorCode: 'user_mismatch' }
    }

    const db = await getRlsDb()
    const { data: existing, error: checkError } = await db
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle()

    if (checkError) {
      console.error('[PROFILE_ENSURE] Profile check failed', {
        userId: user.id,
        code: checkError.code,
        message: checkError.message,
      })
      return { ok: false, created: false, userId: user.id, errorCode: checkError.code }
    }

    if (existing?.id) {
      return { ok: true, created: false, userId: user.id }
    }

    const displayName = options?.displayName ?? buildDisplayName(user)
    const avatarUrl =
      options?.avatarUrl !== undefined ? options.avatarUrl : buildAvatarUrl(user)

    const insertRow: Record<string, unknown> = {
      id: user.id,
      full_name: displayName,
      preferences: DEFAULT_PREFERENCES,
      member_since: user.created_at ?? new Date().toISOString(),
    }

    if (avatarUrl) {
      insertRow.avatar_url = avatarUrl
    }

    const { error: insertError } = await db.from('profiles').insert(insertRow)

    if (insertError) {
      if (insertError.code === '23505') {
        return { ok: true, created: false, userId: user.id }
      }
      console.error('[PROFILE_ENSURE] Profile insert failed', {
        userId: user.id,
        code: insertError.code,
        message: insertError.message,
      })
      return { ok: false, created: false, userId: user.id, errorCode: insertError.code }
    }

    const updatePayload: Record<string, unknown> = {}
    if (displayName) {
      updatePayload.display_name = displayName
    }
    if (avatarUrl) {
      updatePayload.avatar_url = avatarUrl
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await db
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id)
      if (updateError && process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.warn('[PROFILE_ENSURE] Profile metadata update warning', {
          userId: user.id,
          code: updateError.code,
        })
      }
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[PROFILE_ENSURE] Profile created', { userId: user.id })
    }

    return { ok: true, created: true, userId: user.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.error('[PROFILE_ENSURE] Unexpected error', { message })
    return { ok: false, created: false, errorCode: message }
  }
}
