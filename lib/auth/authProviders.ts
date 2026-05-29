import type { User } from '@supabase/supabase-js'

/** Auth providers linked to the user (e.g. email, google). */
export function collectAuthProviders(user: User): Set<string> {
  const providers = new Set<string>()

  for (const identity of user.identities ?? []) {
    if (identity.provider) providers.add(identity.provider)
  }

  const metaProviders = user.app_metadata?.providers
  if (Array.isArray(metaProviders)) {
    for (const p of metaProviders) {
      if (typeof p === 'string' && p) providers.add(p)
    }
  }

  return providers
}

/** True when the user can set a password via email credentials (not OAuth-only). */
export function canChangePasswordInApp(user: User): boolean {
  return collectAuthProviders(user).has('email')
}

/** Message for users who sign in via OAuth without email/password credentials. */
export function getOAuthPasswordManagedMessage(user: User): string {
  const providers = collectAuthProviders(user)
  if (providers.has('google')) {
    return 'Signed in with Google. Your password is managed by Google.'
  }

  const oauth = [...providers].filter((p) => p !== 'email')
  if (oauth.length === 1) {
    const label = oauth[0] === 'apple' ? 'Apple' : oauth[0].charAt(0).toUpperCase() + oauth[0].slice(1)
    return `Signed in with ${label}. Your password is managed by ${label}.`
  }

  return 'Signed in with an external provider. Your password is managed by that provider.'
}
