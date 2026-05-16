import { isValidUuid } from '@/lib/sanitize'

/** Public profile handles: 3–32 chars, alphanumeric plus underscore and hyphen. */
const PUBLIC_USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/

export type PublicListingsUserLookup =
  | { readonly kind: 'id'; readonly value: string }
  | { readonly kind: 'username'; readonly value: string }

/**
 * Resolve `user` query param to a safe profiles_v2 lookup (no PostgREST `.or()` interpolation).
 * Returns null when the param is empty or contains unsafe filter syntax characters.
 */
export function parsePublicListingsUserParam(raw: string): PublicListingsUserLookup | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (isValidUuid(trimmed)) {
    return { kind: 'id', value: trimmed }
  }
  if (PUBLIC_USERNAME_RE.test(trimmed)) {
    return { kind: 'username', value: trimmed }
  }
  return null
}
